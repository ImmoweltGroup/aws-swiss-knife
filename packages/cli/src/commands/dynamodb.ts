import { GluegunCommand } from 'gluegun'

const command: GluegunCommand = {
  name: 'dynamodb',
  description: 'Namespace for all DynamoDB commands',
  hidden: true,
  run: async toolbox => toolbox.help.printNamespaceHelp()
}

module.exports = command
