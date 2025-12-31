import 'source-map-support/register';
import { Logger } from "@aws-lambda-powertools/logger";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { DynamoDBClient, ScanCommand, AttributeValue } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayEvent, APIGatewayProxyResultV2, Context } from "aws-lambda";

const logger = new Logger({ serviceName: "getAllAlbuns" });
const tracer = new Tracer({ serviceName: "getAllAlbuns" });
const client = tracer.captureAWSv3Client(new DynamoDBClient({ region: process.env.AWS_REGION }));

export const handler = async (
  event: APIGatewayEvent,
  context: Context
): Promise<APIGatewayProxyResultV2> => {
  logger.addContext(context);
  logger.setCorrelationId(event.requestContext.requestId);
  tracer.putMetadata("event", event);

  let items: Array<Record<string, AttributeValue>> = [];
  try {
    const result = await client.send(new ScanCommand({
      TableName: process.env.TABLE_NAME,
    }));

    if (result.Items != undefined) {
      for (const i of result.Items) {
        const item = unmarshall(i)
        items.push(item)
        logger.info("Item: " + item)
      }
    }
  } catch (err) {
    logger.error("Erro na recuperação dos itens", err as Error);
    throw err;
  }

  return {
    statusCode: 200,
    body: JSON.stringify(items)
  }
}