import { Stack, StackProps } from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { Stack001NestedStack } from './stack001/stack001';
import { Stack002NestedStack } from './stack002/stack002';
// import { Stack003NestedStack } from './stack003/stack003';

export class CdkExamplesStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    new Stack001NestedStack(this, "Stack001", props);
    new Stack002NestedStack(this, "Stack002", props);
    // new Stack003NestedStack(this, "Stack003", props);
  }
}
