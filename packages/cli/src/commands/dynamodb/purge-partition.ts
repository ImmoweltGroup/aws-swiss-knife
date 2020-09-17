import { GluegunCommand, GluegunToolbox } from 'gluegun'
import {
  catchError,
  count,
  map,
  mapTo,
  mergeMap,
  switchMap,
  tap
} from 'rxjs/operators'
import {
  combineLatest,
  from,
  iif,
  Observable,
  of,
  OperatorFunction
} from 'rxjs'
import { DynamoDBClient, Table, KeySchema } from '@iwtethys/dynamodb-toolkit'
import { mergeObj } from '../../utils/operators'
import { Credentials, DynamoDB } from 'aws-sdk'
import { HelpOptions } from '../../extensions/help-extension'

// typings until tsconfig adds es6
// declare Object
type FromEntries<T = any> = (
  entries: Iterable<readonly [PropertyKey, T]>
) => { [k: string]: T }

// polyfill until node v12 is mandatory
const fromEntries: FromEntries =
  (Object as any).fromEntries ||
  function fromEntries(iterable: [string, any]) {
    return [...iterable].reduce(
      (obj, [key, val]) => ({ ...obj, [key]: val }),
      {}
    )
  }

const command: GluegunCommand = {
  name: 'purge-partition',
  alias: 'pp',
  description: 'Deletes an partition key entry with all its sort key entries.',
  run: async (toolbox: GluegunToolbox) => {
    const { print, input, help } = toolbox
    if (help.requested()) {
      return help.print(buildHelp(toolbox))
    }

    await getParameters(toolbox)
      .pipe(
        confirm(
          ({ table, partitionKey, partitionKeyValue }) =>
            input.confirm({
              message: `Proceed deletion of items for partitionKey ${partitionKey}='${partitionKeyValue}' in table ${table.tableName} (${table.accessKeyId})?`,
              initial: true
            }),
          ({ table, partitionKeyValue, partitionKey, keySchema }) =>
            exec(toolbox, table, partitionKey, partitionKeyValue, keySchema),
          () => of(null).pipe(tap(() => print.info('Cancelled')))
        )
      )
      .toPromise()
  }
}

const exec = (
  toolbox: GluegunToolbox,
  table: Table,
  partitionKey: string,
  partitionKeyValue: string,
  keySchema: KeySchema
): Observable<void> => {
  const client = new DynamoDB(table)

  const { print } = toolbox

  const query: DynamoDB.QueryInput = {
    TableName: table.tableName,
    KeyConditions: {
      [partitionKey]: {
        ComparisonOperator: 'EQ',
        AttributeValueList: [
          {
            [keySchema[partitionKey]]: partitionKeyValue
          }
        ]
      }
    }
  }

  return from(client.query(query).promise()).pipe(
    switchMap(({ Items }) => Items), // flatten
    map((
      // delete non KeySchema attributes
      itemAttrMap
    ) =>
      fromEntries(
        Object.entries(itemAttrMap).filter(([key]) => key in keySchema)
      )
    ),
    mergeMap(item =>
      from(
        client.deleteItem({ TableName: table.tableName, Key: item }).promise()
      )
    ),
    count(),
    tap(numDeletions =>
      numDeletions > 0
        ? print.success(`Deleted ${numDeletions} entries`)
        : print.warning('No entries found')
    ),
    mapTo(void 0)
  )
}

const getParameters = (toolbox: GluegunToolbox): Observable<Parameters> => {
  const { aws, input, print, prompt } = toolbox

  const getTable = (): Observable<Table> =>
    aws.credentials().pipe(
      map<Credentials, Table>((credentials: Credentials) => ({
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        tableName: null,
        region: null
      })),
      mergeObj<Table, string>(
        () =>
          input.str({
            argumentName: 'first',
            message: 'Table name'
          }),
        (orig, tableName) => ({
          ...orig,
          tableName
        })
      ),
      mergeObj<Table, string>(
        () =>
          aws.region({
            defaultValue: 'eu-central-1'
          }),
        (orig, region) => ({
          ...orig,
          region
        })
      )
    )

  const getKeySchema: (parameters: Parameters) => Observable<KeySchema> = (
    parameters: Parameters
  ): Observable<KeySchema> => {
    const client = new DynamoDBClient(parameters.table)

    return client.getKeySchema().pipe(
      catchError(() => {
        print.warning('Could not determine key schema.')
        return input
          .str({
            argumentName: 'keySchema',
            message: 'Key schema'
          })
          .pipe(map((str: string) => JSON.parse(str) as KeySchema))
      })
    )
  }

  const getPartitionKeyName = ({ keySchema }: Parameters) =>
    from(
      prompt.ask({
        type: 'select',
        initial: 0,
        choices: Object.keys(keySchema),
        message: `Select Partition Key`,
        name: 'partitionKeyName',
        required: true
      })
    ).pipe(map(response => response.partitionKeyName))

  const getPartitionKeyValue = () =>
    input.str({
      argumentName: 'partitionKeyValue',
      message: 'Partition Key Value'
    })

  return of({}).pipe(
    mergeObj<Parameters, Table>(getTable, (orig, table) => ({
      ...orig,
      table: {
        ...orig.table,
        region: table.region,
        tableName: table.tableName,
        secretAccessKey: table.secretAccessKey,
        accessKeyId: table.accessKeyId
      }
    })),
    mergeObj(getKeySchema, (orig, keySchema) => ({
      ...orig,
      keySchema
    })),
    mergeObj(getPartitionKeyName, (orig, partitionKey) => ({
      ...orig,
      partitionKey
    })),
    mergeObj(getPartitionKeyValue, (orig, partitionKeyValue) => ({
      ...orig,
      partitionKeyValue
    }))
  )
}

interface Parameters {
  partitionKey: string
  partitionKeyValue: string
  table: Table
  keySchema: KeySchema
}

const confirm = <T, K, R>(
  condition: (obj: T) => Observable<boolean>,
  trueCb: (obj: T) => Observable<K>,
  falseCb: (obj: T) => Observable<R>
): OperatorFunction<T, K | R> => {
  return source =>
    source.pipe(
      switchMap((obj: T) =>
        combineLatest([
          condition(obj).pipe(catchError(() => of(false))),
          of(obj)
        ])
      ),
      switchMap(([res, obj]) => iif(() => res, trueCb(obj), falseCb(obj)))
    )
}

const buildHelp = (toolbox: GluegunToolbox): HelpOptions => ({
  usage: `${toolbox.runtime.brand} ${toolbox.command.commandPath.join(
    ' '
  )} <table>`,
  arguments: {
    '--profile': 'AWS Profile to use to authenticate',
    '--access-key-id': 'AWS Access Key Id to use to authenticate',
    '--secret-access-key': 'AWS Secret Access Key to use to authenticate',
    '--region': 'Region of DynamoDB table to delete',
    '--key-schema': 'JSON value representing the schema of the primary index'
  }
})

module.exports = command
