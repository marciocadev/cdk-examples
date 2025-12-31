import 'source-map-support/register';
import {
  ExecuteStatementCommand,
  ExecuteStatementCommandInput,
  RDSDataClient
} from "@aws-sdk/client-rds-data";
import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Context } from 'aws-lambda';

const logger = new Logger({ serviceName: "triggerStart" });
const tracer = new Tracer({ serviceName: "triggerStart" });
const client = tracer.captureAWSv3Client(new RDSDataClient({ region: process.env.AWS_REGION }));

export const handler = async (event: any, context: Context) => {
  try {
    logger.addContext(context);

    let param: ExecuteStatementCommandInput = {
      resourceArn: process.env.RESOURCE_ARN,
      secretArn: process.env.SECRET_ARN,
      database: process.env.DATABASE_NAME,
      sql: undefined
    }

    let sql = 'CREATE TABLE IF NOT EXISTS accounts ('
      + 'user_id VARCHAR(50) PRIMARY KEY,'
      + 'username VARCHAR(50) UNIQUE NOT NULL,'
      + 'password VARCHAR(50) NOT NULL,'
      + 'email VARCHAR(255) UNIQUE NOT NULL,'
      + 'created_at TIMESTAMP(3) NOT NULL,' // to millisecond precision
      + 'last_login TIMESTAMP(3))';
    const paraTableAccounts: ExecuteStatementCommandInput = {
      ...param,
      sql: sql,
    }
    await client.send(new ExecuteStatementCommand(paraTableAccounts));

    sql = 'CREATE TABLE IF NOT EXISTS roles ('
      + 'role_id VARCHAR(50) PRIMARY KEY,'
      + 'role_name VARCHAR(255))';
    const paramTableRoles: ExecuteStatementCommandInput = {
      ...param,
      sql: sql,
    };
    await client.send(new ExecuteStatementCommand(paramTableRoles));

    sql = 'CREATE TABLE IF NOT EXISTS account_roles ('
      + 'user_id VARCHAR(50),'
      + 'role_id VARCHAR(50),'
      + 'PRIMARY KEY(user_id, role_id),'
      + 'FOREIGN KEY(role_id) REFERENCES roles (role_id),'
      + 'FOREIGN KEY(user_id) REFERENCES accounts (user_id))';
    const paramTableAccountRoles: ExecuteStatementCommandInput = {
      ...param,
      sql: sql,
    };
    await client.send(new ExecuteStatementCommand(paramTableAccountRoles));
  } catch (error) {
    logger.error("Erro ao criar as tabelas", error as Error);
    throw error;
  }
}