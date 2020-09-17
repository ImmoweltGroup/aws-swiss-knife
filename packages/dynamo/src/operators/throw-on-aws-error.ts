import { of, OperatorFunction, throwError } from "rxjs";
import { AWSError } from "aws-sdk/lib/error";
import { switchMap } from "rxjs/operators";

export const throwOnError = <T>(): OperatorFunction<[AWSError, T], T> =>
  switchMap(([error, value]) => {
    if (error) {
      return throwError(error);
    }
    return of(value);
  });
