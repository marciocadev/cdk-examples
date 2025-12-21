import { Logger } from "@aws-lambda-powertools/logger";
import { AttributeValue, DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayEvent, Context, APIGatewayProxyResultV2 } from "aws-lambda";

const logger = new Logger({ serviceName: "postAlbum" });
const client = new DynamoDBClient({ region: process.env.AWS_REGION });

interface Artist {
  Artist: string;
  Album: string;
  Tracks?: Array<Record<string, AttributeValue>>
}

export const handler = async (
  event: APIGatewayEvent,
  context: Context,
): Promise<APIGatewayProxyResultV2> => {
  logger.addContext(context);
  logger.setCorrelationId(event.requestContext.requestId);

  const payload = JSON.parse(event.body!);
  let artist: Artist = {
    Artist: payload.artist,
    Album: payload.album,
  }
  if (payload.tracks) {
    artist["Tracks"] = [];
  }
  for (const t of payload.tracks) {
    const track = {
      Title: t.title,
      Length: t.length
    };
    artist["Tracks"]?.push(track);
  }

  logger.info("Payload: ", { artist: artist });

  try {
    await client.send(
      new PutItemCommand({
        TableName: process.env.TABLE_NAME,
        Item: marshall(artist),
      })
    );
  } catch (err) {
    logger.error("Erro ao inserir o album", err as Error);
    throw err;
  }

  return {
    statusCode: 204,
  }
}