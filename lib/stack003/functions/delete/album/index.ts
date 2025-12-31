import 'source-map-support/register';
import { Logger } from "@aws-lambda-powertools/logger";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { DeleteItemCommand, DynamoDBClient, ReturnValue } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { Context, SQSBatchItemFailure, SQSBatchResponse, SQSEvent } from "aws-lambda";

const logger = new Logger({ serviceName: "deleteAlbum" });
const tracer = new Tracer({ serviceName: "deleteAlbum" });
const client = tracer.captureAWSv3Client(new DynamoDBClient({ region: process.env.AWS_REGION }));


export const handler = async (event: SQSEvent, context: Context): Promise<SQSBatchResponse> => {
  logger.addContext(context);

  let batchFailureResponse: SQSBatchResponse = {
    batchItemFailures: [],
  };

  for (const e of event.Records) {
    const body = JSON.parse(e.body);
    logger.info("body", { body: body });

    let artist = body.artist;
    let album = body.album;

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
      let failureResponse: SQSBatchItemFailure = {
        itemIdentifier: e.messageId,
      }
      batchFailureResponse.batchItemFailures.push(failureResponse);
      logger.error(`Erro ao remover o album '${album}' do artist '${artist}'`, err as Error);
    }
  }

  return batchFailureResponse;
}