import { KeyAttributeType, KeySchema, Table } from "./models/table";
import { Observable } from "rxjs";
import { DynamoDB } from "aws-sdk";
import { scanAll } from "./scan";
import { deleteAll } from "./delete";
import { copy } from "./copy";
import { describeTable } from "./describe-table";
import { map } from "rxjs/operators";

export class DynamoDBClient {
  private readonly dynamoClient: DynamoDB;
  constructor(private table: Table) {
    this.dynamoClient = new DynamoDB(table);
  }

  scanAll(options: { limit?: number }): Observable<any[]>;
  scanAll<T>(options: { limit?: number }): Observable<T[]> {
    return scanAll<T>(this.dynamoClient, {
      TableName: this.table.tableName,
      Limit: options.limit || 25,
    });
  }
  deleteAll(items: any[], keySchema: KeySchema): Observable<void>;
  deleteAll<T>(items: T[], keySchema: KeySchema): Observable<void> {
    return deleteAll(this.dynamoClient, this.table.tableName, items, keySchema);
  }

  copyTo(dest: Table): Observable<void> {
    return copy(this.table, dest);
  }

  describeTable(): Observable<DynamoDB.DescribeTableOutput> {
    return describeTable(this.dynamoClient, this.table.tableName);
  }

  getKeySchema(): Observable<KeySchema> {
    return this.describeTable().pipe(
      map((res) =>
        res.Table.KeySchema.reduce(
          (prev: KeySchema, item: DynamoDB.KeySchemaElement) => {
            const attrDefinition = res.Table.AttributeDefinitions.find(
              (attr) => attr.AttributeName === item.AttributeName
            );
            if (!["S", "B", "N"].includes(attrDefinition.AttributeType)) {
              // technically impossible as DynamoDB only allows those as keys
              throw new Error(
                `Unsupported attribute type ${attrDefinition.AttributeType}.`
              );
            }
            prev[
              item.AttributeName
            ] = attrDefinition.AttributeType as KeyAttributeType;
            return prev;
          },
          {} as KeySchema
        )
      )
    );
  }
}
