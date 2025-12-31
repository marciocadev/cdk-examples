import { APIGatewayEvent, APIGatewayProxyResultV2, Context } from "aws-lambda";

export const handler = async (event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResultV2> => {
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Hello from Lambda from function GET" })
  }
}