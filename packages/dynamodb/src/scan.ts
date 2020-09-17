import { DynamoDB } from "aws-sdk";
import { bindCallback, Observable, of } from "rxjs";
import { AWSError } from "aws-sdk/lib/error";
import { throwOnError } from "./operators/throw-on-aws-error";
import { map, switchMap } from "rxjs/operators";

export const scanAll = <T>(
  client: DynamoDB,
  input: DynamoDB.ScanInput
): Observable<T[]> => {
  return scanRec(client, input).pipe(
    map((items) =>
      items.map((item) => DynamoDB.Converter.unmarshall(item) as T)
    )
  );
};

type ScanFn = (
  params: DynamoDB.ScanInput,
  callback: (err: AWSError, out: DynamoDB.Types.ScanOutput) => void
) => any;

const scan = (
  client: DynamoDB,
  input: DynamoDB.ScanInput
): Observable<DynamoDB.ScanOutput> => {
  return bindCallback(client.scan.bind(client) as ScanFn)(input).pipe(
    throwOnError()
  );
};
const scanRec = (
  client: DynamoDB,
  input: DynamoDB.ScanInput
): Observable<DynamoDB.Types.ItemList> => {
  return scan(client, input).pipe(
    switchMap((output) => {
      if (output.LastEvaluatedKey) {
        return scanRec(client, {
          ...input,
          ExclusiveStartKey: output.LastEvaluatedKey,
        }).pipe(map((items) => [...output.Items!, ...items]));
      }
      return of(output.Items!);
    })
  );
};
