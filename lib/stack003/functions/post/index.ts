import 'source-map-support/register';
import { Logger } from "@aws-lambda-powertools/logger";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { AttributeValue, DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { Context, SQSBatchItemFailure, SQSBatchResponse, SQSEvent } from "aws-lambda";

const logger = new Logger({ serviceName: "postAlbum" });
const tracer = new Tracer({ serviceName: "postAlbum" });
const client = tracer.captureAWSv3Client(new DynamoDBClient({ region: process.env.AWS_REGION }));

interface Artist {
  Artist: string;
  Album: string;
  Tracks?: Array<Record<string, AttributeValue>>
}

export const handler = async (event: SQSEvent, context: Context): Promise<SQSBatchResponse> => {
  logger.addContext(context);

  let batchFailureResponse: SQSBatchResponse = {
    batchItemFailures: [],
  };

  for (const e of event.Records) {
    logger.info("event", e.body);
    const payload = JSON.parse(e.body);

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
      const result = await client.send(
        new PutItemCommand({
          TableName: process.env.TABLE_NAME,
          Item: marshall(artist),
        })
      );
      tracer.putMetadata("result", result);
    } catch (err) {
      let failureResponse: SQSBatchItemFailure = {
        itemIdentifier: e.messageId,
      }
      batchFailureResponse.batchItemFailures.push(failureResponse);
    }
  }

  return batchFailureResponse;
}