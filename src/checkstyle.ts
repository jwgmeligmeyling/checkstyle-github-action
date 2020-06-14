export interface CheckstyleReport {
  checkstyle?: Checkstyle
}

export interface Checkstyle {
  file: File[] | File | undefined
}

export interface File {
  name: string
  error: Error[] | Error | undefined
}

export enum Severity {
  error = 'error',
  warning = 'warning',
  info = 'info',
  ignore = 'ignore'
}

export interface Error {
  line: string
  column: string
  severity: Severity
  message: string
  source: string
}
