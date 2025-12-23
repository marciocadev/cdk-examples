import { Logger } from "@aws-lambda-powertools/logger";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { DeleteItemCommand, DynamoDBClient, ReturnValue } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayEvent, APIGatewayProxyResultV2, Context } from "aws-lambda";

const logger = new Logger({ serviceName: "deleteAlbum" });
const tracer = new Tracer({ serviceName: "deleteAlbum" });
const client = tracer.captureAWSv3Client(new DynamoDBClient({ region: process.env.AWS_REGION }));

export const handler = async (
  event: APIGatewayEvent,
  context: Context):
  Promise<APIGatewayProxyResultV2> => {
  logger.addContext(context);
  logger.setCorrelationId(event.requestContext.requestId);
  tracer.putMetadata("event", event);

  const artist = decodeURIComponent(event.pathParameters!.artist!)
  const album = decodeURIComponent(event.pathParameters!.album!)

  try {
    await client.send(new DeleteItemCommand({
      TableName: process.env.TABLE_NAME,
      Key: {
        Artist: marshall(artist),
        Album: marshall(album)
      },
      ReturnValues: ReturnValue.ALL_OLD,
    }));
  } catch (err) {
    logger.error(`Erro ao remover o album '${album}' do artist '${artist}'`, err as Error);
    throw err;
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Album '${album}' do artista '${artist}' foi deletado com sucesso.`,
    }),
  }
}