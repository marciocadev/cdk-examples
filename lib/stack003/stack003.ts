import { Aws, NestedStack, NestedStackProps, RemovalPolicy } from "aws-cdk-lib";
import { AwsIntegration, IntegrationOptions, IntegrationResponse, JsonSchema, JsonSchemaType, JsonSchemaVersion, Model, RequestValidator, RestApi } from "aws-cdk-lib/aws-apigateway";
import { AttributeType, TableV2 } from "aws-cdk-lib/aws-dynamodb";
import { PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Architecture, Runtime, Tracing } from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import { join } from "path";

export class Stack003NestedStack extends NestedStack {
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
      tableName: "Stack003DB",
    });
    // Table

    // RestApi
    const api = new RestApi(this, "RestApiGateway", {
      restApiName: "Stack003Api",
      deployOptions: {
        tracingEnabled: true,
      },
    });

    const requestBodyValidator = new RequestValidator(this, "BodyValidator", {
      requestValidatorName: "Stack003BodyValidator",
      restApi: api,
      validateRequestBody: true,
    });
    const requestParameterValidator = new RequestValidator(this, "ParameterValidator", {
      requestValidatorName: "Stack003ParameterValidator",
      restApi: api,
      validateRequestParameters: true,
    });

    const albumResource = api.root.addResource("album");

    const apiGatewaySQSRole = new Role(this, 'ApiGatewaySQSRole', {
      assumedBy: new ServicePrincipal('apigateway.amazonaws.com')
    });

    // Adiciona permissões X-Ray para rastreamento
    apiGatewaySQSRole.addToPolicy(new PolicyStatement({
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

    // PostAlbum Fuction
    const postAlbumFunc = new NodejsFunction(this, "PostAlbumFunc", {
      functionName: "Stack003PostAlbum",
      entry: join(__dirname, "functions", "post", "index.ts"),
      runtime: Runtime.NODEJS_LATEST,
      architecture: Architecture.ARM_64,
      handler: "index.handler",
      tracing: Tracing.ACTIVE,
      environment: {
        TABLE_NAME: table.tableName,
      },
    });
    table.grantWriteData(postAlbumFunc);
    postAlbumFunc.logGroup.applyRemovalPolicy(RemovalPolicy.DESTROY);
    // PostAlbum Fuction

    // PostAlbum Queue
    const deadLetterQueuePostAlbum = new Queue(this, "DeadLetterPostAlbum", {
      queueName: "Stack003DeadLetterPostAlbum"
    });

    const queuePostAlbum = new Queue(this, "QueuePostAlbum", {
      queueName: "Stack003QueuePostAlbum",
      deadLetterQueue: {
        queue: deadLetterQueuePostAlbum,
        maxReceiveCount: 3
      }
    });
    queuePostAlbum.grantSendMessages(apiGatewaySQSRole);
    queuePostAlbum.grantConsumeMessages(postAlbumFunc);
    postAlbumFunc.addEventSource(new SqsEventSource(queuePostAlbum));

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
      credentialsRole: apiGatewaySQSRole,
      requestParameters: {
        "integration.request.header.Content-Type": "'application/x-www-form-urlencoded'"
      },
      requestTemplates: {
        "application/json": "Action=SendMessage&MessageBody=$input.body"
      },
      integrationResponses: [
        {
          statusCode: "200",
          selectionPattern: "200",
          responseTemplates: {
            "application/json": "{ messageId: $input.path('$.SendMessageResponse.SendMessageResult.MessageId')}"
          },
        },
        ...errorResponses
      ],
    }

    const putItemIntegration = new AwsIntegration({
      service: 'sqs',
      region: `${Aws.REGION}`,
      path: `${Aws.ACCOUNT_ID}/${queuePostAlbum.queueName}`,
      integrationHttpMethod: "POST",
      options: integrationPostAlbumOptions
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
      functionName: "Stack003DeleteAlbum",
      entry: join(__dirname, "functions", "delete", "album", "index.ts"),
      runtime: Runtime.NODEJS_LATEST,
      architecture: Architecture.ARM_64,
      handler: "index.handler",
      tracing: Tracing.ACTIVE,
      environment: {
        TABLE_NAME: table.tableName,
      },
    });
    table.grantWriteData(deleteAlbumFunc);
    deleteAlbumFunc.logGroup.applyRemovalPolicy(RemovalPolicy.DESTROY);
    // DeleteAlbum Function

    // DeleteAlbum Queue
    const deadLetterQueueDeleteAlbum = new Queue(this, "DeadLetterDeleteAlbum", {
      queueName: "Stack003DeadLetterDeleteAlbum"
    });

    const queueDeleteAlbum = new Queue(this, "QueueDeleteAlbum", {
      queueName: "Stack003QueueDeleteAlbum",
      deadLetterQueue: {
        queue: deadLetterQueueDeleteAlbum,
        maxReceiveCount: 3
      }
    });
    queueDeleteAlbum.grantSendMessages(apiGatewaySQSRole);
    queueDeleteAlbum.grantConsumeMessages(deleteAlbumFunc);
    deleteAlbumFunc.addEventSource(new SqsEventSource(queueDeleteAlbum));

    const integrationDeleteAlbumOptions: IntegrationOptions = {
      credentialsRole: apiGatewaySQSRole,
      requestParameters: {
        "integration.request.header.Content-Type": "'application/x-www-form-urlencoded'"
      },
      requestTemplates: {
        "application/json": "Action=SendMessage&MessageBody={\"artist\": \"$util.escapeJavaScript($method.request.path.artist)\", \"album\": \"$util.escapeJavaScript($method.request.path.album)\"}"
      },
      integrationResponses: [
        {
          statusCode: "200",
          selectionPattern: "200",
          responseTemplates: {
            "application/json": "{ messageId: $input.path('$.SendMessageResponse.SendMessageResult.MessageId')}"
          },
        },
        ...errorResponses,
      ],
    };

    const deleteItemIntegration = new AwsIntegration({
      service: 'sqs',
      region: `${Aws.REGION}`,
      path: `${Aws.ACCOUNT_ID}/${queueDeleteAlbum.queueName}`,
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