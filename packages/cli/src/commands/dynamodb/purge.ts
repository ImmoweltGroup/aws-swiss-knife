import { GluegunCommand, GluegunToolbox } from 'gluegun'
import { catchError, map, switchMap, tap } from 'rxjs/operators'
import { combineLatest, iif, Observable, of, OperatorFunction } from 'rxjs'
import { DynamoDBClient, Table, KeySchema } from '@immowelt/awsk-dynamodb'
import { mergeObj } from '../../utils/operators'
import { Credentials } from 'aws-sdk'
import { HelpOptions } from '../../extensions/help-extension'

const command: GluegunCommand = {
  name: 'purge',
  alias: 'p',
  description: 'Purges an DynamoDB table.',
  run: async (toolbox) => {
    const { print, input, help } = toolbox
    if (help.requested()) {
      return help.print(buildHelp(toolbox))
    }

    await getParameters(toolbox)
      .pipe(
        confirm(
          ({ table }) =>
            input.confirm({
              message: `Proceed deletion of items in table ${table.tableName} (${table.accessKeyId})?`,
              initial: true,
            }),
          ({ table, keySchema }) => exec(toolbox, table, keySchema),
          () => of(null).pipe(tap(() => print.info('Cancelled')))
        )
      )
      .toPromise()
  },
}

const exec = (
  toolbox: GluegunToolbox,
  table: Table,
  keySchema: KeySchema
): Observable<void> => {
  const { print } = toolbox
  const client = new DynamoDBClient(table)

  return client
    .scanAll({
      limit: 25,
    })
    .pipe(
      tap((items) =>
        print.info(`Deleting ${items.length} items from ${table.tableName}.`)
      ),
      switchMap((items) => client.deleteAll(items, keySchema))
    )
}

const getParameters = (toolbox: GluegunToolbox): Observable<Parameters> => {
  const { aws, input, print } = toolbox

  const getTable = (): Observable<Table> =>
    aws.credentials().pipe(
      map<Credentials, Table>((credentials: Credentials) => ({
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        tableName: null,
        region: null,
      })),
      mergeObj<Table, string>(
        () =>
          aws.region({
            defaultValue: 'eu-central-1',
          }),
        (orig, region) => ({
          ...orig,
          region,
        })
      ),
      mergeObj<Table, string>(
        (table) =>
          aws.tableName({
            region: table.region,
            credentials: {
              accessKeyId: table.accessKeyId,
              secretAccessKey: table.secretAccessKey,
            },
            parameter: `first`,
          }),
        (orig, tableName) => ({
          ...orig,
          tableName,
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
        // tslint:disable-next-line
        return input
          .str({
            argumentName: 'keySchema',
            message: 'Key schema:',
          })
          .pipe(
            map((str: string) => JSON.parse(str) as KeySchema)
          ) as Observable<KeySchema>
      })
    )
  }

  return of({}).pipe(
    mergeObj<Parameters, Table>(getTable, (orig, table) => ({
      ...orig,
      table: {
        ...orig.table,
        region: table.region,
        tableName: table.tableName,
        secretAccessKey: table.secretAccessKey,
        accessKeyId: table.accessKeyId,
      },
    })),
    mergeObj(getKeySchema, (orig, keySchema) => ({
      ...orig,
      keySchema,
    }))
  )
}

interface Parameters {
  table: Table
  keySchema: KeySchema
}

const confirm = <T, K, R>(
  condition: (obj: T) => Observable<boolean>,
  trueCb: (obj: T) => Observable<K>,
  falseCb: (obj: T) => Observable<R>
): OperatorFunction<T, K | R> => {
  return (source) =>
    source.pipe(
      switchMap((obj: T) =>
        combineLatest([
          condition(obj).pipe(catchError(() => of(false))),
          of(obj),
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
    '--key-schema': 'JSON value representing the schema of the primary index',
  },
})

module.exports = command
