import { GluegunToolbox } from 'gluegun'
import { from, Observable, of } from 'rxjs'
import { map } from 'rxjs/operators'

export interface InputToolboxExtension {
  str: (options: StrOptions) => Observable<string>
  confirm: (options: ConfirmOptions) => Observable<boolean>
}

interface Options<T> {
  message: string
  initial?: T
}
interface StrOptions extends Options<string> {
  argumentName: string
  type?: 'input' | 'invisible' | 'list' | 'password' | 'text'
}
interface ConfirmOptions extends Options<boolean> {}

module.exports = (toolbox: GluegunToolbox) => {
  const { parameters, prompt } = toolbox

  const str = (options: StrOptions): Observable<string> => {
    if (parameters[options.argumentName]) {
      return of(parameters[options.argumentName])
    }
    if (parameters.options[options.argumentName]) {
      return of(parameters.options[options.argumentName])
    }
    return from(
      prompt.ask({
        type: options.type || 'input',
        message: options.message,
        name: options.argumentName,
        required: true,
        initial: options.initial
      })
    ).pipe(map(res => res[options.argumentName]))
  }
  const confirm = (options: ConfirmOptions): Observable<boolean> => {
    return from(prompt.confirm(options.message, options.initial))
  }

  toolbox.input = {
    str,
    confirm
  }
}
