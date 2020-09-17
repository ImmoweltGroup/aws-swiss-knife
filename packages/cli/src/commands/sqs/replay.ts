import { GluegunCommand, GluegunToolbox } from 'gluegun'
import { Observable, of } from 'rxjs'
import { map, switchMap, tap } from 'rxjs/operators'
import { mergeObj } from '../../utils/operators'
import { Credentials } from 'aws-sdk'
import { Queue, redrive } from '@immowelt/awsk-sqs'
import { HelpOptions } from '../../extensions/help-extension'

const command: GluegunCommand = {
  name: 'replay',
  alias: 'r',
  description:
    'Reads & deletes any message from one queue and adds them to another.',
  run: async toolbox => {
    const { print, help } = toolbox
    if (help.requested()) {
      return help.print(buildHelp())
    }
    await getParameters(toolbox)
      .pipe(
        switchMap(({ src, dest }) =>
          redrive(src, dest, messageId =>
            print.info(`moved message ${messageId}`)
          )
        ),
        tap(count =>
          print.info(`replayed ${count} message${count !== 1 ? 's' : ''}`)
        )
      )
      .toPromise()
  }
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
        profile: `${optionPrefix}Profile`
      },
      labelPrefix
    }

    // 1. check for explicit credentials
    // 2. check for general credentials
    // 3. finally prompt
    return aws.credentialsChain(
      {
        ...options,
        interactive: false
      },
      {
        interactive: false
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
      defaultValue: 'eu-central-1'
    }

    // 1. check for explicit region
    // 2. check for general region
    // 3. finally prompt
    return aws.regionChain(
      {
        ...options,
        interactive: false
      },
      {
        interactive: false
      },
      options
    )
  }

  const getQueue = (
    optionPrefix: string,
    labelPrefix: string
  ): Observable<Queue> =>
    getCredentials(optionPrefix, labelPrefix).pipe(
      map((credentials: Credentials) => ({
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        endpoint: null,
        region: null
      })),
      mergeObj<Queue, string>(
        () =>
          input.str({
            argumentName: `${optionPrefix}Queue`,
            message: `${labelPrefix} Queue Endpoint:`
          }),
        (orig, endpoint) => ({
          ...orig,
          endpoint
        })
      ),
      mergeObj<Queue, string>(
        () => getRegion(optionPrefix, labelPrefix),
        (orig, region) => ({
          ...orig,
          region
        })
      )
    )

  return of<Paramaters>({} as Paramaters).pipe(
    mergeObj(
      () => getQueue('src', 'Source'),
      (orig, src) => ({
        ...orig,
        src
      })
    ),
    mergeObj(
      () => getQueue('dest', 'Destination'),
      (orig, dest) => ({
        ...orig,
        dest
      })
    )
  )
}

interface Paramaters {
  src: Queue
  dest: Queue
}
const buildHelp = (): HelpOptions => ({
  arguments: {
    '--profile': 'AWS Profile to use to authenticate for both tables',
    '--access-key-id':
      'AWS Access Key Id to use to authenticate for both tables',
    '--secret-access-key':
      'AWS Secret Access Key to use to authenticate for both tables',
    '--region': 'Region of both Queues',
    '--src-profile':
      'AWS Profile to use to authenticate for source table (overrules --profile when provided)',
    '--src-access-key-id':
      'AWS Access Key Id to use to authenticate for source table (overrules --access-key-id when provided)',
    '--src-secret-access-key':
      'AWS Secret Access Key to use to authenticate for source table (overrules --secret-access-key when provided)',
    '--src-queue': 'Queues URL to use as source',
    '--src-region':
      'Region of source Queue to sync from (overrules --region when provided)',
    '--dest-profile':
      'AWS Profile to use to authenticate for destination table (overrules --profile when provided)',
    '--dest-access-key-id':
      'AWS Access Key Id to use to authenticate for destination table (overrules --access-key-id when provided)',
    '--dest-secret-access-key':
      'AWS Secret Access Key to use to authenticate for destination table (overrules --secret-access-key when provided)',
    '--dest-queue': 'Queues URLe to use as destination',
    '--dest-region':
      'Region of destination Queue to sync to (overrules --region when provided)'
  }
})

module.exports = command
