import * as core from '@actions/core'
import {findResults} from './search'
import {Inputs} from './constants'
import {annotationsForPath} from './annotations'
import {chain, groupBy, splitEvery} from 'ramda'
import {Annotation, AnnotationLevel} from './github'
import {context, getOctokit} from '@actions/github'

const MAX_ANNOTATIONS_PER_REQUEST = 50

async function run(): Promise<void> {
  try {
    const path = core.getInput(Inputs.Path, {required: true})
    const name = core.getInput(Inputs.Name)
    const title = core.getInput(Inputs.Title)

    const searchResult = await findResults(path)
    if (searchResult.filesToUpload.length === 0) {
      core.warning(
        `No files were found for the provided path: ${path}. No results will be uploaded.`
      )
    } else {
      core.info(
        `With the provided path, there will be ${searchResult.filesToUpload.length} results uploaded`
      )
      core.debug(`Root artifact directory is ${searchResult.rootDirectory}`)

      const annotations: Annotation[] = chain(
        annotationsForPath,
        searchResult.filesToUpload
      )
      core.debug(
        `Grouping ${annotations.length} annotations into chunks of ${MAX_ANNOTATIONS_PER_REQUEST}`
      )

      const groupedAnnotations: Annotation[][] = splitEvery(
        MAX_ANNOTATIONS_PER_REQUEST,
        annotations
      )
      core.debug(`Created ${groupedAnnotations.length} buckets`)

      const conclusion = getConclusion(annotations)

      for (const annotationSet of groupedAnnotations) {
        await createCheck(
          name,
          title,
          annotationSet,
          annotations.length,
          conclusion
        )
      }
    }
  } catch (error) {
    core.setFailed(error)
  }
}

function getConclusion(
  annotations: Annotation[]
): 'success' | 'failure' | 'neutral' {
  if (annotations.length === 0) {
    return 'success'
  }

  const annotationsByLevel: {[p: string]: Annotation[]} = groupBy(
    a => a.annotation_level,
    annotations
  )

  if (
    annotationsByLevel[AnnotationLevel.failure] &&
    annotationsByLevel[AnnotationLevel.failure].length
  ) {
    return 'failure'
  } else if (
    annotationsByLevel[AnnotationLevel.warning] &&
    annotationsByLevel[AnnotationLevel.warning].length
  ) {
    return 'neutral'
  }

  return 'success'
}

async function createCheck(
  name: string,
  title: string,
  annotations: Annotation[],
  numErrors: number,
  conclusion: 'success' | 'failure' | 'neutral'
): Promise<void> {
  core.info(
    `Uploading ${annotations.length} / ${numErrors} annotations to GitHub as ${name} with conclusion ${conclusion}`
  )
  const octokit = getOctokit(core.getInput(Inputs.Token))
  const req = {
    ...context.repo,
    ref: context.sha
  }

  const res = await octokit.checks.listForRef(req)
  const existingCheckRun = res.data.check_runs.find(
    check => check.name === name
  )

  if (!existingCheckRun) {
    const createRequest = {
      ...context.repo,
      head_sha: context.sha,
      conclusion,
      name,
      status: <const>'completed',
      output: {
        title,
        summary: `${numErrors} violation(s) found`,
        annotations
      }
    }

    await octokit.checks.create(createRequest)
  } else {
    const check_run_id = existingCheckRun.id

    const update_req = {
      ...context.repo,
      conclusion,
      check_run_id,
      status: <const>'completed',
      output: {
        title,
        summary: `${numErrors} violation(s) found`,
        annotations
      }
    }

    await octokit.checks.update(update_req)
  }
}

run()
