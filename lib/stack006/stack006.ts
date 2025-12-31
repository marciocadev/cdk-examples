import { CfnOutput, Duration, NestedStack, NestedStackProps, RemovalPolicy } from "aws-cdk-lib";
import { AuthorizationType, CognitoUserPoolsAuthorizer, Cors, IRestApi, LambdaIntegration, MethodOptions, ResourceOptions, RestApi } from "aws-cdk-lib/aws-apigateway";
import { IUserPoolResourceServer, OAuthScope, ResourceServerScope, UserPool, UserPoolResourceServer } from "aws-cdk-lib/aws-cognito";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import { join } from "path";

export class Stack006NestedStack extends NestedStack {
  environment: string = "prod";
  userPool: UserPool;
  scopeRead: ResourceServerScope;
  scopeWrite: ResourceServerScope;
  resourceServer: IUserPoolResourceServer;
  api: IRestApi;
  authorizer: CognitoUserPoolsAuthorizer;
  optionsWithCors: ResourceOptions;

  constructor(scope: Construct, id: string, props?: NestedStackProps) {
    super(scope, id, props);

    this.createUserPool();
    this.createUserPoolDomain();
    this.createScopeRead();
    this.createScopeWrite();
    this.createResourceServer();
    this.createUserPoolClient();

    this.createRestApi();
    this.createCognitoAuthorizer();
    this.createCORS();
    this.createGetExample();
    this.createPostExample();
  }
  private createPostExample() {
    const optionsWithAuth: MethodOptions = {
      authorizationType: AuthorizationType.COGNITO,
      authorizer: {
        authorizerId: this.authorizer.authorizerId,
      },
      authorizationScopes: [
        // `${environment}/write`,
        `${this.environment}/${this.scopeWrite.scopeName}`
      ]
    };

    const func = new NodejsFunction(this, "PostFunction", {
      functionName: "Stock006PostFunction",
      runtime: Runtime.NODEJS_LATEST,
      handler: "handler",
      entry: join(__dirname, "functions", "post", "index.ts"),
      bundling: {
        minify: true,
      }
    });
    func.logGroup.applyRemovalPolicy(RemovalPolicy.DESTROY);
    const funcIntegration = new LambdaIntegration(func);

    //base resource
    const resource = this.api.root.addResource(this.scopeWrite.scopeName, this.optionsWithCors);
    resource.addMethod("POST", funcIntegration, optionsWithAuth);
  }

  private createGetExample() {
    const optionsWithAuth: MethodOptions = {
      authorizationType: AuthorizationType.COGNITO,
      authorizer: {
        authorizerId: this.authorizer.authorizerId,
      },
      authorizationScopes: [
        // `${environment}/read`,
        `${this.environment}/${this.scopeRead.scopeName}`
      ]
    };

    const func = new NodejsFunction(this, "GetFunction", {
      functionName: "Stock006GetFunction",
      runtime: Runtime.NODEJS_LATEST,
      handler: "handler",
      entry: join(__dirname, "functions", "get", "index.ts"),
      bundling: {
        minify: true,
      }
    });
    func.logGroup.applyRemovalPolicy(RemovalPolicy.DESTROY);
    const funcIntegration = new LambdaIntegration(func);

    //base resource
    const resource = this.api.root.addResource(this.scopeRead.scopeName, this.optionsWithCors);
    resource.addMethod("GET", funcIntegration, optionsWithAuth);
  }

  private createCORS() {
    //CORS options
    this.optionsWithCors = {
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: Cors.ALL_METHODS,
      },
    };
  }

  private createCognitoAuthorizer() {
    this.authorizer = new CognitoUserPoolsAuthorizer(this, "CognitoAuthorizer", {
      cognitoUserPools: [this.userPool],
      identitySource: "method.request.header.Authorization",
    });
    this.authorizer._attachToApi(this.api);
  }

  private createRestApi() {
    this.api = new RestApi(this, "RestApi", {
      restApiName: "Stock006",
      binaryMediaTypes: ["*/*"],
      deployOptions: {
        stageName: this.environment,
        throttlingRateLimit: 10,
        throttlingBurstLimit: 20,
      }
    })
  }

  private createUserPoolClient() {
    this.userPool.addClient("UserPoolClientFullAccess", {
      userPoolClientName: "Stock006UserFullAccessPoolCliet",
      generateSecret: true,
      enableTokenRevocation: true,
      accessTokenValidity: Duration.minutes(60),
      refreshTokenValidity: Duration.days(1),
      oAuth: {
        flows: {
          clientCredentials: true,
        },
        scopes: [
          //one for each scope defined above
          OAuthScope.resourceServer(this.resourceServer, this.scopeRead),
          OAuthScope.resourceServer(this.resourceServer, this.scopeWrite),
        ],
      },
    });

    this.userPool.addClient("UserPoolClientRead", {
      userPoolClientName: "Stock006UserReadPoolCliet",
      generateSecret: true,
      enableTokenRevocation: true,
      accessTokenValidity: Duration.minutes(60),
      refreshTokenValidity: Duration.days(1),
      oAuth: {
        flows: {
          clientCredentials: true,
        },
        scopes: [
          //one for each scope defined above
          OAuthScope.resourceServer(this.resourceServer, this.scopeRead),
        ],
      },
    });
  }

  private createResourceServer() {
    this.resourceServer = new UserPoolResourceServer(this, "ResourceServer", {
      identifier: this.environment,
      userPool: this.userPool,
      scopes: [this.scopeRead, this.scopeWrite],
    });
  }

  private createScopeWrite() {
    this.scopeWrite = new ResourceServerScope({
      scopeName: "write",
      scopeDescription: "write scope"
    });
  }

  private createScopeRead() {
    this.scopeRead = new ResourceServerScope({
      scopeName: "read",
      scopeDescription: "read scope"
    });
  }

  private createUserPoolDomain() {
    this.userPool.addDomain("UserPoolDomain", {
      cognitoDomain: {
        domainPrefix: "stack006-user-pool-domain",
      }
    });
    new CfnOutput(this, "UserPoolDomainURL", {
      value: this.userPool.userPoolProviderUrl,
      exportName: "UserPoolDomainURL",
    });
  }

  private createUserPool() {
    this.userPool = new UserPool(this, "CognitoUserPool", {
      userPoolName: "Stack006UserPool",
      removalPolicy: RemovalPolicy.DESTROY,
    });
    new CfnOutput(this, "OutputUserPool", {
      value: this.userPool.userPoolId,
      exportName: "UserPoolId",
    });
  }
}