import { GluegunToolbox } from 'gluegun'

export interface HelpToolboxExtension {
  requested: () => boolean
  print: (options: HelpOptions) => void
  getSubCommands: (levelAdjustment?: number) => { [key: string]: string }
  printNamespaceHelp: (levelAdjustment?: number) => void
}

module.exports = (toolbox: GluegunToolbox) => {
  const { parameters, print, runtime, command } = toolbox

  const requestedHelp = (): boolean =>
    ('first' in parameters && parameters.first === 'help') ||
    'help' in parameters.options ||
    'h' in parameters.options
  const printHelp = (options: HelpOptions): void => {
    const padLeft = '    '
    const getMaxNameLength = (...names: string[]): number =>
      names.reduce((prev, item) => Math.max(prev, item.length), 0)
    const printList = (
      header: string,
      lines: string[],
      sort?: 'asc' | 'desc'
    ) => {
      if (sort) {
        lines = lines.sort((a, b) => {
          if (sort === 'asc') {
            return a > b ? 1 : -1
          }
          return a < b ? 1 : -1
        })
      }

      print.info(`${header}:`)
      print.newline()
      lines.forEach(line => print.info(`${padLeft}${line}`))
      print.newline()
    }
    const printListFromObj = (
      header: string,
      lines: { [key: string]: string },
      labelLength: number,
      sort?: 'asc' | 'desc'
    ) =>
      printList(
        header,
        Object.keys(lines).map(
          key => `${key.padEnd(labelLength, ' ')} ${lines[key]}`
        ),
        sort
      )

    const buildDefaultOptions = (): HelpOptions => ({
      ...options,
      info: options.info || command.description,
      usage:
        options.usage || `${runtime.brand} ${command.commandPath.join(' ')}`
    })

    options = buildDefaultOptions()

    if (options.info) {
      print.info(options.info)
      print.newline()
    }

    printList('Usage', [options.usage])

    const maxNameLength =
      getMaxNameLength(
        ...Object.keys(options.subcommands || {}),
        ...Object.keys(options.arguments || {})
      ) + 1
    if (options.arguments) {
      printListFromObj('Arguments', options.arguments, maxNameLength)
    }
    if (options.subcommands) {
      printListFromObj('Commands', options.subcommands, maxNameLength, 'asc')
    }
  }

  const adjustCommandPath = (levelAdjustment: number): string[] => {
    let commandPath: string[] = command.commandPath
    levelAdjustment = Math.max(-commandPath.length, levelAdjustment)
    if (levelAdjustment < 0) {
      commandPath = commandPath.slice(0, commandPath.length + levelAdjustment)
    }
    return commandPath
  }
  const getSubCommands = (levelAdjustment = 0): { [key: string]: string } => {
    const result = {}
    if (!runtime.commands) {
      return result
    }

    const commandPath = adjustCommandPath(levelAdjustment)

    runtime.commands
      .filter(item => item !== runtime.defaultCommand)
      .filter(item => item.name !== 'help')
      .filter(item => commandPath.length === item.commandPath.length - 1)
      .filter(item =>
        item.commandPath.join(' ').startsWith(commandPath.join(' '))
      )
      .map(item => [item.commandPath[commandPath.length], item.description])
      .forEach(([name, description]) => (result[name] = description))

    return result
  }
  const printNamespaceHelp = (levelAdjustment = 0) => {
    printHelp({
      usage: `${runtime.brand} ${adjustCommandPath(levelAdjustment).join(
        ' '
      )} <command>`,
      subcommands: getSubCommands(levelAdjustment)
    })
  }

  toolbox.help = {
    requested: requestedHelp,
    print: printHelp,
    getSubCommands,
    printNamespaceHelp
  }
}

export interface HelpOptions {
  info?: string
  usage?: string
  subcommands?: {
    [key: string]: string
  }
  arguments?: {
    [key: string]: string
  }
}
