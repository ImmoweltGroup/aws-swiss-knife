import { throwOnError } from "./operators/throw-on-aws-error";
import { DynamoDB } from "aws-sdk";
import { bindCallback, Observable } from "rxjs";
import { AWSError } from "aws-sdk/lib/error";

export const listTables = (
  client: DynamoDB
): Observable<DynamoDB.ListTablesOutput> => {
  return bindCallback(client.listTables.bind(client) as ListTablesFn)().pipe(
    throwOnError()
  );
};

type ListTablesFn = (
  callback?: (err: AWSError, data: DynamoDB.Types.ListTablesOutput) => void
) => any;
