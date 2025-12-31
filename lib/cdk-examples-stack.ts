import { Stack, StackProps } from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
// import { Stack001NestedStack } from './stack001/stack001';
// import { Stack002NestedStack } from './stack002/stack002';
// import { Stack003NestedStack } from './stack003/stack003';
// import { Stack004NestedStack } from './stack004/stack004';
import { Stack005NestedStack } from './stack005/stack005';
// import { Stack006NestedStack } from './stack006/stack006';

export class CdkExamplesStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // new Stack001NestedStack(this, "Stack001", props);
    // new Stack002NestedStack(this, "Stack002", props);
    // new Stack003NestedStack(this, "Stack003", props);
    // new Stack004NestedStack(this, "Stack004", props);
    new Stack005NestedStack(this, "Stack005", props);
    // new Stack006NestedStack(this, "Stack006", props);
  }
}
