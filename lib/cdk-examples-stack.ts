import { Stack, StackProps } from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { CrudTSNestedStack } from './crud-typescript/crud-typescript';
import { ApiGatewayDynamoDBNestedStack } from './apigateway-dynamodb/apigateway-dynamodb';

export class CdkExamplesStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    new CrudTSNestedStack(this, "CrudTypescript", props);
    new ApiGatewayDynamoDBNestedStack(this, "ApiGatewayDynamoDB", props);
  }
}
