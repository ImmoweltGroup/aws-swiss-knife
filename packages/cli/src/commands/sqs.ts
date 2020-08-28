import { GluegunCommand } from 'gluegun'

const command: GluegunCommand = {
  name: 'sqs',
  description: 'Namespace for all SQS commands',
  hidden: true,
  run: async toolbox => toolbox.help.printNamespaceHelp()
}

module.exports = command
