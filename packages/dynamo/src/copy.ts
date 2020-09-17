import { Table } from "./models/table";
import { bindCallback } from "rxjs";
import { copy as copyLib } from "copy-dynamodb-table";
import { throwOnError } from "./operators/throw-on-aws-error";

export const copy = (source: Table, destination: Table) =>
  bindCallback(copyLib as (p: any, cb: (error, result) => void) => void)({
    config: source,
    source,
    destination,
    log: true,
  }).pipe(throwOnError());
