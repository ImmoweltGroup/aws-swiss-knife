import { AWSToolboxExtension } from './aws-extension'
import { HelpToolboxExtension } from './help-extension'
import { InputToolboxExtension } from './input-extension'

declare module 'gluegun/build/types/domain/toolbox' {
  interface GluegunToolbox {
    input?: InputToolboxExtension
    aws?: AWSToolboxExtension
    help?: HelpToolboxExtension
  }
}
