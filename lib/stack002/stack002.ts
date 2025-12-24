import { NestedStack, NestedStackProps, RemovalPolicy } from "aws-cdk-lib";
import { AccessLogFormat, JsonSchema, JsonSchemaType, JsonSchemaVersion, LambdaIntegration, LogGroupLogDestination, MethodLoggingLevel, Model, RequestValidator, RestApi } from "aws-cdk-lib/aws-apigateway";
import { AttributeType, TableV2 } from "aws-cdk-lib/aws-dynamodb";
import { Architecture, Runtime, Tracing } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { join } from "path";

export class Stack002NestedStack extends NestedStack {
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
      tableName: "Stack002DB",
    });
    // Table

    // RestApi
    const apiLogGroup = new LogGroup(this, "ApiLogGroup", {
      logGroupName: "/aws/api-gateway/Stack002Api",
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const api = new RestApi(this, "RestApiGateway", {
      restApiName: "Stack002Api",
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
      requestValidatorName: "Stack002BodyValidator",
      restApi: api,
      validateRequestBody: true,
    });
    const requestParameterValidator = new RequestValidator(this, "ParameterValidator", {
      requestValidatorName: "Stack002ParameterValidator",
      restApi: api,
      validateRequestParameters: true,
    });

    const albumResource = api.root.addResource("album");
    // RestApi

    // PostAlbum Function
    const postAlbumFunc = new NodejsFunction(this, "PostAlbumFunc", {
      functionName: "Stack002PostAlbum",
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

    const requestSchemaPost: JsonSchema = {
      title: "PostAlbumRequest",
      type: JsonSchemaType.OBJECT,
      schema: JsonSchemaVersion.DRAFT4,
      properties: {
        Artist: { type: JsonSchemaType.STRING },
        Album: { type: JsonSchemaType.STRING },
        Tracks: {
          type: JsonSchemaType.ARRAY,
          items: {
            type: JsonSchemaType.OBJECT,
            properties: {
              Title: { type: JsonSchemaType.STRING },
              Length: { type: JsonSchemaType.STRING }
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

    albumResource.addMethod("POST", new LambdaIntegration(postAlbumFunc), {
      requestModels: {
        "application/json": requestModelPost
      },
      requestValidator: requestBodyValidator
    });
    // PostAlbum Function

    // DeleteAlbum Function
    const deleteAlbumFunc = new NodejsFunction(this, "DeleteAlbumFunc", {
      functionName: "Stack002DeleteAlbum",
      entry: join(__dirname, "functions", "delete", "album", "index.ts"),
      runtime: Runtime.NODEJS_LATEST,
      architecture: Architecture.ARM_64,
      handler: "index.handler",
      tracing: Tracing.ACTIVE,
      environment: {
        TABLE_NAME: table.tableName,
      }
    });
    table.grantWriteData(deleteAlbumFunc);
    deleteAlbumFunc.logGroup.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const deleteAlbumResource = albumResource.addResource("{artist}");
    const deleteAlbumAlbumResource = deleteAlbumResource.addResource("{album}");
    deleteAlbumAlbumResource.addMethod("DELETE", new LambdaIntegration(deleteAlbumFunc), {
      requestValidator: requestParameterValidator,
    });
    // DeleteAlbum Function

    // DeleteArtist Function
    const deleteArtistFunc = new NodejsFunction(this, "DeleteArtistFunc", {
      functionName: "Stack002DeleteArtist",
      entry: join(__dirname, "functions", "delete", "artist", "index.ts"),
      runtime: Runtime.NODEJS_LATEST,
      architecture: Architecture.ARM_64,
      handler: "index.handler",
      tracing: Tracing.ACTIVE,
      environment: {
        TABLE_NAME: table.tableName,
      }
    });
    table.grantReadWriteData(deleteArtistFunc);
    deleteArtistFunc.logGroup.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const artistResource = api.root.addResource("artist");
    const deleteArtistResource = artistResource.addResource("{artist}");
    deleteArtistResource.addMethod("DELETE", new LambdaIntegration(deleteArtistFunc), {
      requestValidator: requestParameterValidator
    });
    // DeleteArtist Function

    // GetAllAlbum Function
    const getAllAlbumFunc = new NodejsFunction(this, "GetAllAlbunsFunc", {
      functionName: "Stack002GetAllAlbuns",
      entry: join(__dirname, "functions", "get", "all", "index.ts"),
      runtime: Runtime.NODEJS_LATEST,
      architecture: Architecture.ARM_64,
      handler: "index.handler",
      tracing: Tracing.ACTIVE,
      environment: {
        TABLE_NAME: table.tableName,
      },
    });
    table.grantReadData(getAllAlbumFunc);
    getAllAlbumFunc.logGroup.applyRemovalPolicy(RemovalPolicy.DESTROY);

    api.root.addResource("all").addMethod("GET", new LambdaIntegration(getAllAlbumFunc));
    // GetAllAlbum Function
  }
}