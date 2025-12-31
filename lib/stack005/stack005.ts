import { Duration, NestedStack, NestedStackProps, RemovalPolicy } from "aws-cdk-lib";
import { AccessLogFormat, JsonSchema, JsonSchemaType, JsonSchemaVersion, LambdaIntegration, LogGroupLogDestination, MethodLoggingLevel, Model, RequestValidator, RestApi } from "aws-cdk-lib/aws-apigateway";
import { SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import { PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Architecture, Runtime, Tracing } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { AuroraPostgresEngineVersion, ClusterInstance, DatabaseCluster, DatabaseClusterEngine } from "aws-cdk-lib/aws-rds";
import { Trigger } from "aws-cdk-lib/triggers";
import { Construct } from "constructs";
import { join } from "path";

export class Stack005NestedStack extends NestedStack {
  constructor(scope: Construct, id: string, props?: NestedStackProps) {
    super(scope, id, props);

    const vpc = new Vpc(this, "Vpc");

    const dbClusterName = "Stack005DB";

    const dbCluster = new DatabaseCluster(this, "DbCluster", {
      engine: DatabaseClusterEngine.auroraPostgres({
        version: AuroraPostgresEngineVersion.VER_17_6
      }),
      defaultDatabaseName: dbClusterName,
      removalPolicy: RemovalPolicy.DESTROY,
      writer: ClusterInstance.serverlessV2('writer', {
        publiclyAccessible: false,
      }),
      readers: [ClusterInstance.serverlessV2('reader', {
        publiclyAccessible: false,
      })],
      serverlessV2MinCapacity: 0,
      serverlessV2MaxCapacity: 5,
      vpc: vpc,
    });

    // StartTriger Function
    // Cria a instância e as tabelas ao término do deploy
    const startTriggerFunction = new NodejsFunction(this, "StartTriggerFunction", {
      functionName: "Stack005StartTriggerFunction",
      entry: join(__dirname, "functions", "trigger", "index.ts"),
      runtime: Runtime.NODEJS_LATEST,
      architecture: Architecture.ARM_64,
      handler: "index.handler",
      tracing: Tracing.ACTIVE,
      timeout: Duration.minutes(1),
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: {
        RESOURCE_ARN: dbCluster.clusterArn,
        SECRET_ARN: dbCluster.secret?.secretArn || '',
        DATABASE_NAME: dbClusterName,
      },
    });
    startTriggerFunction.logGroup.applyRemovalPolicy(RemovalPolicy.DESTROY);
    dbCluster.grantDataApiAccess(startTriggerFunction);
    new Trigger(this, "StartTrigger", {
      handler: startTriggerFunction,
      executeAfter: [dbCluster],
    });
    // StartTriger Function

    // CreateUser Function
    const userFunction = new NodejsFunction(this, "UserFunction", {
      functionName: "Stack005UserFunction",
      entry: join(__dirname, "functions", "user", "index.ts"),
      runtime: Runtime.NODEJS_LATEST,
      architecture: Architecture.ARM_64,
      handler: "index.handler",
      tracing: Tracing.ACTIVE,
      timeout: Duration.minutes(1),
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: {
        RESOURCE_ARN: dbCluster.clusterArn,
        SECRET_ARN: dbCluster.secret?.secretArn || '',
        DATABASE_NAME: dbClusterName,
      },
    });
    userFunction.logGroup.applyRemovalPolicy(RemovalPolicy.DESTROY);
    dbCluster.grantDataApiAccess(userFunction);
    // CreateUser Function

    // RestApi
    const apiLogGroup = new LogGroup(this, "ApiLogGroup", {
      logGroupName: "/aws/api-gateway/Stack005Api",
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const api = new RestApi(this, "RestApiGateway", {
      restApiName: "Stack005Api",
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
      }
    });

    const requestBodyValidator = new RequestValidator(this, "BodyValidator", {
      requestValidatorName: "Stack005BodyValidator",
      restApi: api,
      validateRequestBody: true,
    });

    const requestSchemaPost: JsonSchema = {
      title: "PostAlbumRequest",
      type: JsonSchemaType.OBJECT,
      schema: JsonSchemaVersion.DRAFT4,
      properties: {
        username: { type: JsonSchemaType.STRING },
        password: { type: JsonSchemaType.STRING },
        email: { type: JsonSchemaType.STRING },
      },
      required: ["username", "password"],
    };

    const requestModelPost: Model = new Model(this, "PostAlbumModel", {
      restApi: api,
      contentType: "application/json",
      schema: requestSchemaPost,
    });

    api.root.addMethod("POST", new LambdaIntegration(userFunction), {
      requestModels: {
        "application/json": requestModelPost
      },
      requestValidator: requestBodyValidator
    });
    // RestApi

  }
}