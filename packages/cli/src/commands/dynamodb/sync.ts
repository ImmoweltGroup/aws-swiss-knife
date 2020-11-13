import { GluegunCommand, GluegunToolbox } from 'gluegun'
import { DynamoDBClient, Table } from '@immowelt/awsk-dynamodb'
import { Observable, of } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'
import { mergeObj } from '../../utils/operators'
import { Credentials } from 'aws-sdk'
import { HelpOptions } from '../../extensions/help-extension'

const command: GluegunCommand = {
  name: 'sync',
  alias: 's',
  description: 'Copies all items of one DynamoDB table to another.',
  run: async (toolbox) => {
    const { help } = toolbox

    if (help.requested()) {
      return help.print(buildHelp())
    }
    await getParameters(toolbox)
      .pipe(switchMap(({ src, dest }) => new DynamoDBClient(src).copyTo(dest)))
      .toPromise()
  },
}

const getParameters = (toolbox: GluegunToolbox): Observable<Paramaters> => {
  const { aws, input } = toolbox

  const getCredentials = (
    optionPrefix: string,
    labelPrefix: string
  ): Observable<Credentials> => {
    const options = {
      parameters: {
        accessKeyId: `${optionPrefix}AccessKeyId`,
        secretAccessKey: `${optionPrefix}SecretAccessKey`,
        profile: `${optionPrefix}Profile`,
      },
      labelPrefix,
    }

    // 1. check for explicit credentials
    // 2. check for general credentials
    // 3. finally prompt
    return aws.credentialsChain(
      {
        ...options,
        interactive: false,
      },
      {
        interactive: false,
      },
      options
    )
  }

  const getRegion = (
    optionPrefix: string,
    labelPrefix: string
  ): Observable<string> => {
    const options = {
      parameter: `${optionPrefix}Region`,
      labelPrefix,
      defaultValue: 'eu-central-1',
    }

    // 1. check for explicit region
    // 2. check for general region
    // 3. finally prompt
    return aws.regionChain(
      {
        ...options,
        interactive: false,
      },
      {
        interactive: false,
      },
      options
    )
  }

  const getTable = (
    optionPrefix: string,
    labelPrefix: string
  ): Observable<Table> =>
    getCredentials(optionPrefix, labelPrefix).pipe(
      map((credentials: Credentials) => ({
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      })),
      mergeObj<Table, string>(
        () =>
          input.str({
            argumentName: `${optionPrefix}TableName`,
            message: `${labelPrefix} Table Name:`,
          }),
        (orig, tableName) => ({
          ...orig,
          tableName,
        })
      ),
      mergeObj<Table, string>(
        () => getRegion(optionPrefix, labelPrefix),
        (orig, region) => ({
          ...orig,
          region,
        })
      )
    )

  return of<Paramaters>({} as Paramaters).pipe(
    mergeObj(
      () => getTable('src', 'Source'),
      (orig, src) => ({
        ...orig,
        src,
      })
    ),
    mergeObj(
      () => getTable('dest', 'Destination'),
      (orig, dest) => ({
        ...orig,
        dest,
      })
    )
  )
}

interface Paramaters {
  src: Table
  dest: Table
}
const buildHelp = (): HelpOptions => ({
  arguments: {
    '--profile': 'AWS Profile to use to authenticate for both tables',
    '--access-key-id':
      'AWS Access Key Id to use to authenticate for both tables',
    '--secret-access-key':
      'AWS Secret Access Key to use to authenticate for both tables',
    '--region': 'Region of both DynamoDB table to sync',
    '--src-profile':
      'AWS Profile to use to authenticate for source table (overrules --profile when provided)',
    '--src-access-key-id':
      'AWS Access Key Id to use to authenticate for source table (overrules --access-key-id when provided)',
    '--src-secret-access-key':
      'AWS Secret Access Key to use to authenticate for source table (overrules --secret-access-key when provided)',
    '--src-table-name': 'DynamoDB Table to use as source',
    '--src-region':
      'Region of source DynamoDB table to sync from (overrules --region when provided)',
    '--dest-profile':
      'AWS Profile to use to authenticate for destination table (overrules --profile when provided)',
    '--dest-access-key-id':
      'AWS Access Key Id to use to authenticate for destination table (overrules --access-key-id when provided)',
    '--dest-secret-access-key':
      'AWS Secret Access Key to use to authenticate for destination table (overrules --secret-access-key when provided)',
    '--dest-table-name': 'DynamoDB Table to use as destination',
    '--dest-region':
      'Region of destination DynamoDB table to sync to (overrules --region when provided)',
  },
})

module.exports = command
