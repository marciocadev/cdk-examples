import { App, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { BasicCrudWithLambdaStack } from '../lib/basic-crud-with-lambda-stack';

describe('Basic CRUD with lambda', () => {
  let app: App, stack: Stack, template: Template

  beforeEach(() => {
    // GIVEN
    app = new App();
    // WHEN
    stack = new BasicCrudWithLambdaStack(app, 'MyStackTest');
    // THEN
    template = Template.fromStack(stack);
  });

  test('DynamoDB table name is basic-crud-with-lambda', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'basic-crud-with-lambda',
    })
  });

  test('DynamoDB billing mode is pay per request', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
    })
  });

  test('DynamoDB table deletion policy is delete', () => {
    template.hasResource('AWS::DynamoDB::Table', {
      DeletionPolicy: 'Delete'
    });
  });
});
