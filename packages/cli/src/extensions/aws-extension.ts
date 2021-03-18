import { GluegunToolbox } from 'gluegun'
import { combineLatest, from, Observable, of, throwError } from 'rxjs'
import { Credentials, SharedIniFileCredentials, IniLoader } from 'aws-sdk'
import * as deepmerge from 'deepmerge'
import { catchError, map, switchMap } from 'rxjs/operators'
import { PromptOptions } from 'gluegun/build/types/toolbox/prompt-enquirer-types'
import { DynamoDBClient } from '@immowelt/awsk-dynamodb'

export interface AWSToolboxExtension {
  credentials: (options?: CredentialOptions) => Observable<Credentials>
  credentialsChain: (...options: CredentialOptions[]) => Observable<Credentials>
  region: (options?: RegionOptions) => Observable<string>
  regionChain: (...options: RegionOptions[]) => Observable<string>
  tableName: (options?: TableNameOptions) => Observable<string>
  tableNameChain: (...options: TableNameOptions[]) => Observable<string>
}

module.exports = (toolbox: GluegunToolbox) => {
  const { parameters, print, prompt } = toolbox

  const hasArgument = (name: string): boolean =>
    name in parameters && !!getArgumentValue(name)
  const getArgumentValue = (name: string): string => parameters[name]
  const hasOption = (name: string): boolean => name in parameters.options
  const getOptionValue = (name: string): string => parameters.options[name]

  const promptProfile = (labelPrefix: string): Observable<Credentials> => {
    return from(
      prompt.ask({
        type: 'select',
        initial: 0,
        choices: readAvailableProfiles(),
        message: `Choose ${labelPrefix}AWS Profile`,
        name: 'profile',
        required: true,
      })
    ).pipe(
      map((response) => response.profile),
      map((profile) => createProfileCredentials(profile)),
      switchMap((credentials) => {
        if (!areCredentialsValid(credentials)) {
          print.info('Unknown profile')
          return promptProfile(labelPrefix)
        }
        return of(credentials)
      })
    )
  }
  const promptExplicitCredentials = (
    labelPrefix: string
  ): Observable<Credentials> => {
    const ask = (options: PromptOptions) => {
      const name =
        typeof options.name === 'function' ? options.name() : options.name
      return from(prompt.ask(options)).pipe(map((response) => response[name]))
    }
    return ask({
      type: 'input',
      name: 'accessKeyId',
      message: `${labelPrefix}AWS Access Key ID:`,
    }).pipe(
      switchMap((accessKeyId) =>
        combineLatest([
          of(accessKeyId),
          ask({
            type: 'password',
            name: 'secretAccessKey',
            message: `${labelPrefix}AWS Secret Access Key:`,
          }),
        ])
      ),
      map(([accessKeyId, secretAccessKey]) =>
        createExplicitCredentials(accessKeyId, secretAccessKey)
      )
    )
  }
  const promptCredentials = (
    options: CredentialOptions
  ): Observable<Credentials> => {
    const labelPrefix = options.labelPrefix ? options.labelPrefix + ' ' : ''
    return from(
      prompt.ask({
        type: 'select',
        initial: 0,
        choices: ['profile', 'explicitly'],
        message: `How do you like to enter ${labelPrefix}credentials?`,
        name: 'type',
        required: true,
      })
    ).pipe(
      map((response) => response.type),
      switchMap((type) => {
        switch (type) {
          case 'profile':
            return promptProfile(labelPrefix)
          case 'explicitly':
            return promptExplicitCredentials(labelPrefix)
          default:
            return throwError('unknown credentials type')
        }
      })
    )
  }

  const promptRegion = (
    labelPrefix: string,
    defaultValue?: string
  ): Observable<string> => {
    labelPrefix = labelPrefix ? labelPrefix + ' ' : ''
    return from(
      prompt.ask({
        type: 'input',
        name: 'region',
        message: `${labelPrefix}AWS Region`,
        initial: defaultValue,
      })
    ).pipe(map((response) => response.region))
  }

  const promptTableName = (
    labelPrefix: string,
    credentials: Record<'accessKeyId' | 'secretAccessKey', string>,
    region: string
  ): Observable<string> => {
    labelPrefix = labelPrefix ? labelPrefix + ' ' : ''
    const client = new DynamoDBClient({
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    })
    return client.listTables().pipe(
      switchMap((output) => {
        if (output.TableNames?.length) {
          return of(output.TableNames as string[])
        }
        return throwError('table names empty')
      }),
      switchMap((tables: string[]) =>
        from(
          prompt.ask({
            type: 'select',
            initial: 0,
            choices: tables,
            message: `${labelPrefix} Table Name:`,
            name: 'tablename',
            required: true,
          })
        )
      ),
      map((response) => response.tablename)
    )
  }
  const inputTableName = (labelPrefix: string): Observable<string> => {
    labelPrefix = labelPrefix ? labelPrefix + ' ' : ''
    return from(
      prompt.ask({
        type: 'input',
        name: 'tablename',
        message: `${labelPrefix} Table Name`,
      })
    ).pipe(map((response) => response.tablename))
  }

  const credentials = (
    options?: CredentialOptions
  ): Observable<Credentials> => {
    options = deepmerge(defaultCredentialOptions, options || {})

    if (
      hasOption(options.parameters.accessKeyId) ||
      hasOption(options.parameters.secretAccessKey)
    ) {
      return of(
        createExplicitCredentials(
          getOptionValue(options.parameters.accessKeyId),
          getOptionValue(options.parameters.secretAccessKey)
        )
      )
    }
    if (hasOption(options.parameters.profile)) {
      const profile = getOptionValue(options.parameters.profile)
      const credentials = createProfileCredentials(profile)
      if (!areCredentialsValid(credentials)) {
        return throwError(`unknown profile '${profile}'`)
      }
      return of(credentials)
    }

    if (!options.interactive) {
      return of(null)
    }
    return promptCredentials(options)
  }
  const credentialsChain = (
    ...options: CredentialOptions[]
  ): Observable<Credentials> => createChain(options, credentials)

  const region = (options?: RegionOptions): Observable<string> => {
    options = deepmerge(defaultRegionOptions, options || {})
    if (hasOption(options.parameter)) {
      return of(getOptionValue(options.parameter))
    }

    if (!options.interactive) {
      return of(null)
    }
    return promptRegion(options.labelPrefix, options.defaultValue)
  }
  const regionChain = (...options: RegionOptions[]): Observable<string> =>
    createChain(options, region)

  const tableName = (options?: TableNameOptions): Observable<string> => {
    options = deepmerge(defaultTableNameOptions, options ?? {})

    if (hasOption(options.parameter)) {
      return of(getOptionValue(options.parameter))
    }
    if (hasArgument(options.parameter)) {
      return of(getArgumentValue(options.parameter))
    }

    if (!options.interactive) {
      return of(null)
    }

    if ('credentials' in options && 'region' in options) {
      return promptTableName(
        options.labelPrefix,
        options.credentials,
        options.region
      ).pipe(
        catchError(() => {
          print.warning(`Could not automatically read table names.`)

          return inputTableName(options.labelPrefix)
        })
      )
    }

    return inputTableName(options.labelPrefix)
  }
  const tableNameChain = (...options: TableNameOptions[]): Observable<string> =>
    createChain(options, tableName)

  toolbox.aws = {
    credentials,
    credentialsChain,
    region,
    regionChain,
    tableName,
    tableNameChain,
  }
}

interface CredentialOptions {
  parameters?: {
    accessKeyId?: string
    secretAccessKey?: string
    profile?: string
  }
  labelPrefix?: string
  interactive?: boolean
}
interface RegionOptions {
  parameter?: string
  labelPrefix?: string
  interactive?: boolean
  defaultValue?: string
}

interface TableNameOptions {
  parameter?: string
  labelPrefix?: string
  credentials?: {
    accessKeyId: string
    secretAccessKey: string
  }
  region?: string
  interactive?: boolean
}

const defaultCredentialOptions: CredentialOptions = {
  parameters: {
    accessKeyId: 'accessKeyId',
    secretAccessKey: 'secretAccessKey',
    profile: 'profile',
  },
  interactive: true,
}
const defaultRegionOptions: RegionOptions = {
  parameter: 'region',
  labelPrefix: '',
  interactive: true,
}
const defaultTableNameOptions: TableNameOptions = {
  labelPrefix: '',
  interactive: true,
}

const createProfileCredentials = (profileName: string): Credentials => {
  return new SharedIniFileCredentials({ profile: profileName })
}
const createExplicitCredentials = (
  accessKeyId: string,
  secretAccessKey: string
): Credentials => {
  return new Credentials({
    accessKeyId,
    secretAccessKey,
  })
}
const areCredentialsValid = (credentials: Credentials): boolean =>
  !!credentials.accessKeyId && !!credentials.secretAccessKey

const createChain = <T, K>(
  options: T[],
  cb: (option: T) => Observable<K>
): Observable<K> => {
  let obs = of(null)

  // rx recursion - open for better approaches
  options.forEach((option) => {
    obs = obs.pipe(
      switchMap((res: K) => {
        if (res) {
          // credentials found
          return of(res)
        }
        // try next
        return cb(option)
      })
    )
  })

  return obs
}

const readAvailableProfiles = (): string[] => {
  // read from default credentials file
  const credentials = Object.keys(new IniLoader().loadFrom({ isConfig: false }))
  // read from default config file
  const config = Object.keys(new IniLoader().loadFrom({ isConfig: true }))
  // merge arrays and remove duplicates by spreading a set
  return [...new Set([...credentials, ...config])]
}
