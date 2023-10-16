import * as core from '@actions/core'
import {CheckstyleReport, File, Severity} from './checkstyle'
import {XMLParser} from 'fast-xml-parser'
import fs from 'fs'
import BufferEncoding from 'buffer'
import * as path from 'path'
import {Annotation, AnnotationLevel} from './github'
import {chain, map} from 'ramda'
import decode from 'unescape'

const XML_PARSE_OPTIONS = {
  allowBooleanAttributes: true,
  ignoreAttributes: false,
  attributeNamePrefix: ''
}

function asArray<T>(arg: T[] | T | undefined): T[] {
  return !arg ? [] : Array.isArray(arg) ? arg : [arg]
}

function getWarningLevel(arg: Severity): AnnotationLevel {
  switch (arg) {
    case Severity.error:
      return AnnotationLevel.failure
    case Severity.warning:
      return AnnotationLevel.warning
    default:
      return AnnotationLevel.notice
  }
}

export function annotationsForPath(resultFile: string): Annotation[] {
  core.info(`Creating annotations for ${resultFile}`)
  const root: string = process.env['GITHUB_WORKSPACE'] || ''
  const parser = new XMLParser(XML_PARSE_OPTIONS)
  const result: CheckstyleReport = parser.parse(
    fs.readFileSync(resultFile, 'UTF-8' as BufferEncoding)
  )

  return chain(
    file => {
      return map(violation => {
        const annotation: Annotation = {
          annotation_level: getWarningLevel(violation.severity),
          path: path.relative(root, file.name),
          start_line: Number(violation.line || 1),
          end_line: Number(violation.line || 1),
          title: violation.source,
          message: decode(violation.message)
        }

        return annotation
      }, asArray(file.error))
    },
    asArray<File>(result.checkstyle?.file)
  )
}
