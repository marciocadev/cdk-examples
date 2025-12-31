import { Aws, NestedStack, NestedStackProps, RemovalPolicy } from "aws-cdk-lib";
import { AccessLogFormat, AwsIntegration, IntegrationOptions, IntegrationResponse, JsonSchema, JsonSchemaType, JsonSchemaVersion, LogGroupLogDestination, MethodLoggingLevel, Model, RequestValidator, RestApi } from "aws-cdk-lib/aws-apigateway";
import { AttributeType, TableV2 } from "aws-cdk-lib/aws-dynamodb";
import { Effect, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Architecture, Runtime, Tracing } from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { Topic, SubscriptionFilter, TracingConfig } from "aws-cdk-lib/aws-sns";
import { SqsSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import { join } from "path";

export class Stack004NestedStack extends NestedStack {
  constructor(scope: Construct, id: string, props?: NestedStackProps) {
    super(scope, id, props);

    // Table
    const table = new TableV2(this, "Table", {
      partitionKey: {
        name: "Artist",
        type: AttributeType.STRING,
      },
      sortKey: {
        name: "Album",
        type: AttributeType.STRING,
      },
      removalPolicy: RemovalPolicy.DESTROY,
      tableName: "Stack004DB",
    });
    // Table

    // RestApi
    const apiLogGroup = new LogGroup(this, "ApiLogGroup", {
      logGroupName: "/aws/api-gateway/Stack004Api",
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const api = new RestApi(this, "RestApiGateway", {
      restApiName: "Stack004Api",
      deployOptions: {
        tracingEnabled: true,
        loggingLevel: MethodLoggingLevel.INFO,
        accessLogDestination: new LogGroupLogDestination(apiLogGroup),
        accessLogFormat: AccessLogFormat.jsonWithStandardFields({
          ip: true,
          caller: true,
          user: true,
          requestTime: true,
          httpMethod: true,
          protocol: true,
          resourcePath: true,
          status: true,
          responseLength: true,
        }),
      },
    });

    const requestBodyValidator = new RequestValidator(this, "BodyValidator", {
      requestValidatorName: "Stack004BodyValidator",
      restApi: api,
      validateRequestBody: true,
    });
    const requestParameterValidator = new RequestValidator(this, "ParameterValidator", {
      requestValidatorName: "Stack004ParameterValidator",
      restApi: api,
      validateRequestParameters: true,
    });

    const albumResource = api.root.addResource("album");

    const apiGatewaySNSRole = new Role(this, 'ApiGatewaySNSRole', {
      assumedBy: new ServicePrincipal('apigateway.amazonaws.com')
    });

    // Adiciona permissões X-Ray para rastreamento
    apiGatewaySNSRole.addToPolicy(new PolicyStatement({
      actions: [
        'xray:PutTraceSegments',
        'xray:PutTelemetryRecords'
      ],
      resources: ['*']
    }));

    const errorResponses: IntegrationResponse[] = [
      {
        statusCode: "400",
        selectionPattern: "400",
        responseTemplates: {
          'application/json': `{
      "error": "Bad input!"
    }`
        }
      },
      {
        statusCode: "500",
        selectionPattern: "5\\d{2}",
        responseTemplates: {
          'application/json': `{
      "error": "Internal Service Error!"
    }`
        }
      }
    ];
    // RestApi

    // Topic
    const topic = new Topic(this, "Topic", {
      topicName: "Stack004Topic",
      tracingConfig: TracingConfig.ACTIVE,
    });
    topic.grantPublish(apiGatewaySNSRole);
    const snsRole = new Role(this, 'snsRole', {
      assumedBy: new ServicePrincipal('sns.amazonaws.com')
    });
    snsRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        "xray:PutTraceSegments",
        "xray:PutTelemetryRecords",
        "xray:GetSamplingRules",
        "xray:GetSamplingTargets"
      ],
      resources: ['*'],
      conditions: {
        StringEquals: {
          "aws:SourceArn": topic.topicArn
        }
      }
    }));
    // Topic

    // PostAlbum Function
    const postAlbumFunc = new NodejsFunction(this, "PostAlbumFunc", {
      functionName: "Stack004PostAlbum",
      entry: join(__dirname, "functions", "post", "index.ts"),
      runtime: Runtime.NODEJS_LATEST,
      architecture: Architecture.ARM_64,
      handler: "index.handler",
      tracing: Tracing.ACTIVE,
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: {
        TABLE_NAME: table.tableName,
      },
    });
    table.grantWriteData(postAlbumFunc);
    postAlbumFunc.logGroup.applyRemovalPolicy(RemovalPolicy.DESTROY);
    // PostAlbum Function

    // postAlbum Queue
    const deadLetterQueuePostAlbum = new Queue(this, "DeadLetterPostAlbum", {
      queueName: "Stack004DeadLetterPostAlbum"
    });

    const queuePostAlbum = new Queue(this, "QueuePostAlbum", {
      queueName: "Stack004QueuePostAlbum",
      deadLetterQueue: {
        queue: deadLetterQueuePostAlbum,
        maxReceiveCount: 3
      }
    });
    queuePostAlbum.grantConsumeMessages(postAlbumFunc);
    postAlbumFunc.addEventSource(new SqsEventSource(queuePostAlbum));

    topic.addSubscription(new SqsSubscription(queuePostAlbum, {
      filterPolicy: {
        "http": SubscriptionFilter.stringFilter({
          allowlist: ["PostAlbum"]
        })
      },
      // filterPolicyWithMessageBody: {
      //   artist: FilterOrPolicy.filter(SubscriptionFilter.stringFilter({
      //     allowlist: ["Dream Theater"]
      //   }))
      // }
    }));

    const requestSchemaPost: JsonSchema = {
      title: "PostAlbumRequest",
      type: JsonSchemaType.OBJECT,
      schema: JsonSchemaVersion.DRAFT4,
      properties: {
        artist: { type: JsonSchemaType.STRING },
        album: { type: JsonSchemaType.STRING },
        tracks: {
          type: JsonSchemaType.ARRAY,
          items: {
            type: JsonSchemaType.OBJECT,
            properties: {
              title: { type: JsonSchemaType.STRING },
              length: { type: JsonSchemaType.STRING }
            }
          }
        }
      },
      required: ["artist", "album"],
    };

    const requestModelPost: Model = new Model(this, "PostAlbumModel", {
      restApi: api,
      contentType: "application/json",
      schema: requestSchemaPost,
    });

    const integrationPostAlbumOptions: IntegrationOptions = {
      credentialsRole: apiGatewaySNSRole,
      requestParameters: {
        "integration.request.header.Content-Type": "'application/x-www-form-urlencoded'"
      },
      requestTemplates: {
        "application/json": "Action=Publish&" +
          "TargetArn=$util.urlEncode('" + topic.topicArn + "')&" +
          "Message=$input.body&" +
          "MessageAttributes.entry.1.Name=http&" +
          "MessageAttributes.entry.1.Value.DataType=String&" +
          "MessageAttributes.entry.1.Value.StringValue=PostAlbum"
      },
      integrationResponses: [
        {
          statusCode: "200",
          selectionPattern: "200",
          responseTemplates: {
            "application/json": "{ messageId: $input.path('$.PublishResponse.PublishResult.MessageId')}"
          },
        },
        ...errorResponses
      ],
    };

    const putItemIntegration = new AwsIntegration({
      service: "sns",
      region: `${Aws.REGION}`,
      path: `${Aws.ACCOUNT_ID}/${topic.topicName}`,
      integrationHttpMethod: "POST",
      options: integrationPostAlbumOptions,
    });

    albumResource.addMethod("POST", putItemIntegration, {
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400' },
        { statusCode: '500' }
      ],
      requestModels: { 'application/json': requestModelPost },
      requestValidator: requestBodyValidator
    });
    // PostAlbum Queue

    // DeleteAlbum Function
    const deleteAlbumFunc = new NodejsFunction(this, "DeleteAlbumFunc", {
      functionName: "Stack004DeleteAlbum",
      entry: join(__dirname, "functions", "delete", "album", "index.ts"),
      runtime: Runtime.NODEJS_LATEST,
      architecture: Architecture.ARM_64,
      handler: "index.handler",
      tracing: Tracing.ACTIVE,
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: {
        TABLE_NAME: table.tableName,
      },
    });
    table.grantWriteData(deleteAlbumFunc);
    deleteAlbumFunc.logGroup.applyRemovalPolicy(RemovalPolicy.DESTROY);
    // DeleteAlbum Function

    // DeleteAlbum Queue
    const deadLetterQueueDeleteAlbum = new Queue(this, "DeadLetterDeleteAlbum", {
      queueName: "Stack004DeadLetterDeleteAlbum"
    });
    const queueDeleteAlbum = new Queue(this, "QueueDeleteAlbum", {
      queueName: "Stack004QueueDeleteAlbum",
      deadLetterQueue: {
        queue: deadLetterQueueDeleteAlbum,
        maxReceiveCount: 3
      }
    });
    queueDeleteAlbum.grantConsumeMessages(deleteAlbumFunc);
    deleteAlbumFunc.addEventSource(new SqsEventSource(queueDeleteAlbum));

    topic.addSubscription(new SqsSubscription(queueDeleteAlbum, {
      filterPolicy: {
        "http": SubscriptionFilter.stringFilter({
          allowlist: ["DeleteAlbum"]
        })
      },
    }));

    const integrationDeleteAlbumOptions: IntegrationOptions = {
      credentialsRole: apiGatewaySNSRole,
      requestParameters: {
        "integration.request.header.Content-Type": "'application/x-www-form-urlencoded'"
      },
      requestTemplates: {
        "application/json": "Action=Publish&" +
          "TargetArn=$util.urlEncode('" + topic.topicArn + "')&" +
          "Message={" +
          "\"artist\": \"$util.escapeJavaScript($method.request.path.artist)\"," +
          "\"album\": \"$util.escapeJavaScript($method.request.path.album)\"}&" +
          "MessageAttributes.entry.1.Name=http&" +
          "MessageAttributes.entry.1.Value.DataType=String&" +
          "MessageAttributes.entry.1.Value.StringValue=DeleteAlbum"
      },
      integrationResponses: [
        {
          statusCode: "200",
          selectionPattern: "200",
          responseTemplates: {
            "application/json": "{ messageId: $input.path('$.PublishResponse.PublishResult.MessageId')}"
          },
        },
        ...errorResponses,
      ],
    };

    const deleteItemIntegration = new AwsIntegration({
      service: 'sns',
      region: `${Aws.REGION}`,
      path: `${Aws.ACCOUNT_ID}/${topic.topicName}`,
      integrationHttpMethod: "POST",
      options: integrationDeleteAlbumOptions
    });

    const deleteAlbumResource = albumResource.addResource("{artist}");
    const deleteAlbumAlbumResource = deleteAlbumResource.addResource("{album}");
    deleteAlbumAlbumResource.addMethod("DELETE", deleteItemIntegration, {
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400' },
        { statusCode: '500' }
      ],
      requestParameters: {
        "method.request.path.artist": true,
        "method.request.path.album": true
      },
      requestValidator: requestParameterValidator
    });
    // DeleteAlbum Queue
  }
}