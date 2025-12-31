import 'source-map-support/register';
import { Logger } from "@aws-lambda-powertools/logger";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { ExecuteStatementCommand, ExecuteStatementCommandInput, RDSDataClient } from "@aws-sdk/client-rds-data";
import { APIGatewayEvent, Context } from "aws-lambda";
import { v4 as uuidv4 } from 'uuid';

const logger = new Logger({ serviceName: "triggerStart" });
const tracer = new Tracer({ serviceName: "triggerStart" });
const client = tracer.captureAWSv3Client(new RDSDataClient({ region: process.env.AWS_REGION }));

export const handler = async (event: APIGatewayEvent, context: Context) => {
  logger.addContext(context);
  let body = JSON.parse(event.body!);
  logger.info("event body", { body: body });

  const { username, password, email } = body;
  const dt = Date.now() / 1000;
  try {
    const sqlInsert = 'INSERT INTO accounts'
      + '(user_id, username, password, email, created_at)'
      + 'VALUES (:id, :user, :pw, :email, TO_TIMESTAMP(:dt))';
    const param: ExecuteStatementCommandInput = {
      resourceArn: process.env.RESOURCE_ARN,
      secretArn: process.env.SECRET_ARN,
      database: process.env.DATABASE_NAME,
      sql: sqlInsert,
      parameters: [
        { name: 'id', value: { stringValue: uuidv4() } },
        { name: 'user', value: { stringValue: username } },
        { name: 'pw', value: { stringValue: password } },
        { name: 'email', value: { stringValue: email } },
        { name: 'dt', value: { doubleValue: dt } }
      ]
    }
    await client.send(new ExecuteStatementCommand(param));
  } catch (error) {
    logger.error("Erro ao inserir o usuário", error as Error);
    throw error;
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Usuário inserido com sucesso" })
  }
}