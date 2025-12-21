import { Aws, NestedStack, NestedStackProps, RemovalPolicy } from "aws-cdk-lib";
import { AwsIntegration, IntegrationOptions, IntegrationResponse, JsonSchema, JsonSchemaType, JsonSchemaVersion, Model, RequestValidator, RestApi } from "aws-cdk-lib/aws-apigateway";
import { AttributeType, TableV2 } from "aws-cdk-lib/aws-dynamodb";
import { Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export class ApiGatewayDynamoDBNestedStack extends NestedStack {
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
      tableName: "ApiGatewayDynamoDB",
    });
    // Table

    // RestApi
    const api = new RestApi(this, "RestApiGateway", {
      restApiName: "ApiGatewayDynamoDB"
    });

    const requestBodyValidator = new RequestValidator(this, "BodyValidator", {
      requestValidatorName: "ApiGatewayDynamoDBBodyValidator",
      restApi: api,
      validateRequestBody: true,
    });
    const requestParameterValidator = new RequestValidator(this, "ParameterValidator", {
      requestValidatorName: "CrudTypescriptParameterValidator",
      restApi: api,
      validateRequestParameters: true,
    });

    const albumResource = api.root.addResource("album");

    const apiGatewayDynamoRole = new Role(this, 'ApiGatewayDynamoRole', {
      assumedBy: new ServicePrincipal('apigateway.amazonaws.com')
    });
    table.grantFullAccess(apiGatewayDynamoRole);

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
    ]
    // RestApi

    // PostAlbum
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
              Lenght: { type: JsonSchemaType.STRING }
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
      credentialsRole: apiGatewayDynamoRole,
      requestTemplates: {
        'application/json': `
        {
          "TableName": "${table.tableName}",
          "Item": {
            "Artist": { "S": "$input.path('$.artist')" },
            "Album": { "S": "$input.path('$.album')" }
            #if($input.path('$.tracks') && $input.path('$.tracks').size() > 0)
            ,"Tracks": {
              "L": [
                #foreach($track in $input.path('$.tracks'))
                {
                  "M": {
                    "Title": { "S": "$track.title" },
                    "Length": { "S": "$track.length" }
                  }
                }#if($foreach.hasNext),#end
                #end
              ]
            }
            #end
          }
        }`
      },
      integrationResponses: [
        {
          statusCode: '204',
          responseTemplates: {
            'application/json': '$context.requestId',
          }
        },
        ...errorResponses
      ],
    }

    const putItemIntegration = new AwsIntegration({
      service: 'dynamodb',
      region: `${Aws.REGION}`,
      action: 'PutItem',
      options: integrationPostAlbumOptions
    });

    albumResource.addMethod("POST", putItemIntegration, {
      methodResponses: [
        { statusCode: '204' },
        { statusCode: '400' },
        { statusCode: '500' }
      ],
      requestModels: { 'application/json': requestModelPost },
      requestValidator: requestBodyValidator
    });
    // PostAlbum

    // DeleteAlbum
    const integrationDeleteAlbumOptions: IntegrationOptions = {
      credentialsRole: apiGatewayDynamoRole,
      requestTemplates: {
        'application/json': `
        {
          "TableName": "${table.tableName}",
          "Key": {
            "Artist": { "S": "$util.urlDecode($method.request.path.artist)" },
            "Album": { "S": "$util.urlDecode($method.request.path.album)" }
          },
          "ReturnValues": "ALL_OLD"
        }`
      },
      integrationResponses: [
        {
          statusCode: '200',
          responseTemplates: {
            'application/json': `#set($artist = $input.path('$.Attributes.Artist.S'))
#if($artist && "$artist" != "")
{
  "artist": "$input.path('$.Attributes.Artist.S')",
  "album": "$input.path('$.Attributes.Album.S')"
}
#else
#set($context.responseOverride.status = 404)
{
  "error": "Registro não existe no banco de dados",
  "message": "O artista '$util.urlDecode($method.request.path.artist)' e o álbum '$util.urlDecode($method.request.path.album)' não foram encontrados na tabela"
}
#end`
          }
        },
        ...errorResponses,
      ],

    };

    const deleteItemIntegration = new AwsIntegration({
      service: 'dynamodb',
      region: `${Aws.REGION}`,
      action: 'DeleteItem',
      options: integrationDeleteAlbumOptions
    });

    const albumPathResource = albumResource.addResource('{artist}').addResource('{album}');
    albumPathResource.addMethod('DELETE', deleteItemIntegration, {
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '404' },
        { statusCode: '400' },
        { statusCode: '500' }
      ],
      requestValidator: requestParameterValidator,
      requestParameters: {
        'method.request.path.artist': true,
        'method.request.path.album': true,
      },
    });
    // Delete Album

    // GetAllAlbum
    const integrationGetAllAlbumOptions: IntegrationOptions = {
      credentialsRole: apiGatewayDynamoRole,
      requestTemplates: {
        'application/json': `{ "TableName": "${table.tableName}" }`
      },
      integrationResponses: [
        {
          statusCode: '200',
          responseTemplates: {
            'application/json': `[
  #foreach($item in $input.path('$.Items'))
  {
    "artist": "$item.Artist.S",
    "album": "$item.Album.S",
    #if($item.Tracks && $item.Tracks.L)
    "tracks": [
      #foreach($track in $item.Tracks.L)
      {
        "title": "$track.M.Title.S",
        "length": "$track.M.Length.S"
      }#if($foreach.hasNext),#end
      #end
    ]
    #else
    "tracks": []
    #end
  }#if($foreach.hasNext),#end
  #end
]`
          }
        },
        ...errorResponses,
      ],
    };

    const scanIntegration = new AwsIntegration({
      service: 'dynamodb',
      region: `${Aws.REGION}`,
      action: 'Scan',
      options: integrationGetAllAlbumOptions
    });

    api.root.addResource("all").addMethod("GET", scanIntegration, {
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400' },
        { statusCode: '500' }
      ],
    });
    // GetAllAlbum
  }
}