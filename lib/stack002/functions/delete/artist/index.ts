import { Logger } from "@aws-lambda-powertools/logger";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { BatchWriteItemCommand, DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayEvent, APIGatewayProxyResult, Context } from "aws-lambda";

const logger = new Logger({ serviceName: "deleteArtist" });
const tracer = new Tracer({ serviceName: "deleteArtist" });
const client = tracer.captureAWSv3Client(new DynamoDBClient({ region: process.env.AWS_REGION }));

export const handler = async (event: APIGatewayEvent, context: Context):
  Promise<APIGatewayProxyResult> => {
  logger.addContext(context);
  logger.setCorrelationId(event.requestContext.requestId);
  tracer.putMetadata("event", event);

  const artist = decodeURIComponent(event.pathParameters!.artist!)
  const marshallArtist = marshall(artist)

  try {
    const list = await client.send(new QueryCommand({
      TableName: process.env.TABLE_NAME,
      KeyConditionExpression: "Artist = :artist",
      ExpressionAttributeValues: {
        ":artist": marshallArtist
      }
    }));

    if (!list.Items || list.Items.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: `Artista '${artist}' não foi encontrado.`,
        }),
      };
    }

    // BatchWriteItem permite até 25 itens por requisição
    const BATCH_SIZE = 25;
    const itemsToDelete = list.Items;

    // Processa em lotes de 25 itens
    for (let i = 0; i < itemsToDelete.length; i += BATCH_SIZE) {
      const batch = itemsToDelete.slice(i, i + BATCH_SIZE);

      const deleteRequests = batch.map((item: any) => ({
        DeleteRequest: {
          Key: {
            Artist: item.Artist,
            Album: item.Album
          }
        }
      }));

      let requestItems = {
        [process.env.TABLE_NAME!]: deleteRequests
      };

      // Processa o batch e trata UnprocessedItems se necessário
      let result = await client.send(new BatchWriteItemCommand({
        RequestItems: requestItems
      }));

      // Reprocessa itens não processados (até 3 tentativas)
      let retryCount = 0;
      while (result.UnprocessedItems && Object.keys(result.UnprocessedItems).length > 0 && retryCount < 3) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 100)); // Backoff exponencial
        result = await client.send(new BatchWriteItemCommand({
          RequestItems: result.UnprocessedItems
        }));
        retryCount++;
      }

      if (result.UnprocessedItems && Object.keys(result.UnprocessedItems).length > 0) {
        logger.warn(`Alguns itens não foram processados após ${retryCount} tentativas`);
      }
    }
  } catch (err) {
    logger.error(`Erro ao remover oa albuns do artist '${artist}'`, err as Error);
    throw err;
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Artista '${artist}' foi deletado com sucesso.`,
    }),
  };
}