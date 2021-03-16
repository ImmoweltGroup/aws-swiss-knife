import { Table } from "./models/table";
import { bindCallback } from "rxjs";
import { copy as copyLib } from "copy-dynamodb-table";
import { throwOnError } from "./operators/throw-on-aws-error";

export const copy = (source: Table, destination: Table) =>
  bindCallback(copyLib as (p: any, cb: (error, result) => void) => void)({
    source: {
      tableName: source.tableName,
      config: {
        accessKeyId: source.accessKeyId,
        secretAccessKey: source.secretAccessKey,
        region: source.region,
      },
    },
    destination: {
      tableName: destination.tableName,
      config: {
        accessKeyId: destination.accessKeyId,
        secretAccessKey: destination.secretAccessKey,
        region: destination.region,
      },
    },
    log: true,
  }).pipe(throwOnError());
