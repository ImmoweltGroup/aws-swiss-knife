import { DynamoDB } from "aws-sdk";
import { bindCallback, Observable } from "rxjs";
import { AWSError } from "aws-sdk/lib/error";
import { throwOnError } from "./operators/throw-on-aws-error";

export const describeTable = (
  client: DynamoDB,
  tableName: string
): Observable<DynamoDB.DescribeTableOutput> => {
  return bindCallback(client.describeTable.bind(client) as DescribeFn)({
    TableName: tableName,
  }).pipe(throwOnError());
};

type DescribeFn = (
  params: DynamoDB.DescribeTableInput,
  callback: (err: AWSError, out: DynamoDB.DescribeTableOutput) => void
) => any;
