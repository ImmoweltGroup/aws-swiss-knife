import { DynamoDB } from "aws-sdk";
import { bindCallback, combineLatest, Observable, of } from "rxjs";
import { AWSError } from "aws-sdk/lib/error";
import { throwOnError } from "./operators/throw-on-aws-error";
import { map } from "rxjs/operators";
import { chunk } from "./utils/chunk";
import { KeySchema } from "./models/table";

export const deleteAll = <T>(
  client: DynamoDB,
  tableName: string,
  items: T[],
  keySchema: KeySchema
): Observable<void> => {
  if (items.length === 0) {
    return of();
  }
  const params = chunk(items, 25).map((chunk) => {
    const params: DynamoDB.Types.BatchWriteItemInput = { RequestItems: {} };
    params.RequestItems[tableName] = chunk
      .map((item) => convertItemToKey(item, keySchema))
      .map((key) => ({
        DeleteRequest: {
          Key: key,
        },
      }));
    return params;
  });

  return combineLatest(
    params.map((chunk) =>
      bindCallback(client.batchWriteItem.bind(client) as DeleteFn)(chunk).pipe(
        throwOnError()
      )
    )
  ).pipe(map(() => {}));
};

type DeleteFn = (
  params: DynamoDB.Types.BatchWriteItemInput,
  callback: (err: AWSError, out: DynamoDB.Types.ScanOutput) => void
) => any;
const convertItemToKey = (item: any, keySchema: KeySchema) => {
  const key: { [key: string]: DynamoDB.Types.AttributeValue } = {};
  Object.keys(keySchema).forEach((keyName) => {
    const type = keySchema[keyName];
    key[keyName] = {};
    key[keyName][type] = item[keyName];
  });
  return key;
};
