import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const WORKFLOWS = fileURLToPath(new URL('../.github/workflows/', import.meta.url))
const BUILD = 'pnpm build'
const UPLOAD = 'actions/upload-pages-artifact@'
const DEPLOY = 'actions/deploy-pages@'
const MAX_TIMEOUT_MINUTES = 60
const CHECKS = [
  'node scripts/check-bundle-budget.ts dist/app/index.html dist',
  'node scripts/audit-hosts.ts dist',
]

interface Job {
  readonly file: string
  readonly name: string
  readonly text: string
  readonly steps: readonly string[]
}

function workflowFiles(): string[] {
  return readdirSync(WORKFLOWS)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()
}

function jobsOf(file: string, yaml: string): Job[] {
  const body = yaml.slice(yaml.indexOf('\njobs:\n') + '\njobs:\n'.length)
  return body
    .split(/^(?= {2}[\w-]+:\s*$)/m)
    .filter((chunk) => /^ {2}[\w-]+:/.test(chunk))
    .map((text) => ({
      file,
      name: /^ {2}([\w-]+):/.exec(text)?.[1] ?? '',
      text,
      steps: text.split(/^(?= {6}- )/m).slice(1),
    }))
}

function allJobs(): Job[] {
  return workflowFiles().flatMap((f) => jobsOf(f, readFileSync(join(WORKFLOWS, f), 'utf8')))
}

/** Problems with the steps that build, check and upload the Pages artifact in one job. */
function deployChecksMissing(job: Pick<Job, 'steps'>): string[] {
  const at = (needle: string) => job.steps.findIndex((s) => s.includes(needle))
  const build = at(BUILD)
  const upload = at(UPLOAD)
  return CHECKS.flatMap((check) => {
    const i = at(check)
    if (i < 0) return [`no step runs "${check}"`]
    const step = job.steps[i]
    if (/^\s+(if|continue-on-error):/m.test(step)) return [`"${check}" is conditional`]
    if (!(build < i && i < upload))
      return [`"${check}" does not run between the build and the upload`]
    return []
  })
}

/** Why a job has no usable job-level timeout, or null when it has one or calls a reusable workflow. */
function timeoutMissing(job: Pick<Job, 'text'>): string | null {
  if (/^ {4}uses:/m.test(job.text)) return null
  const value = /^ {4}timeout-minutes:[ \t]*(.+?)[ \t]*$/m.exec(job.text)?.[1]
  if (value === undefined) return 'no job-level timeout-minutes'
  const minutes = Number(value)
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_TIMEOUT_MINUTES)
    return `timeout-minutes ${value} is not a whole number from 1 to ${String(MAX_TIMEOUT_MINUTES)}`
  return null
}

describe('every workflow job', () => {
  it('stops after a job-level timeout-minutes, unless it calls a reusable workflow', () => {
    const jobs = allJobs()
    expect(jobs.length).toBeGreaterThanOrEqual(10)
    expect(jobs.map((j) => `${j.file}:${j.name}`)).toEqual(
      expect.arrayContaining(['pr-title.yml:pr-title', 'release.yml:release-please', 'ci.yml:e2e']),
    )
    const missing = jobs.flatMap((j) => {
      const problem = timeoutMissing(j)
      return problem === null ? [] : [`${j.file}:${j.name}: ${problem}`]
    })
    expect(missing).toEqual([])
  })
})

describe('timeoutMissing', () => {
  const job = (...lines: string[]) => ({ text: ['  job:', ...lines, '    steps:', ''].join('\n') })

  it('accepts a whole number of minutes on the job, and a reusable workflow call', () => {
    expect(timeoutMissing(job('    runs-on: ubuntu-latest', '    timeout-minutes: 10'))).toBeNull()
    expect(timeoutMissing(job(`    timeout-minutes: ${String(MAX_TIMEOUT_MINUTES)}`))).toBeNull()
    expect(timeoutMissing(job('    uses: ./.github/workflows/deploy-pages.yml'))).toBeNull()
  })

  it('fails a job without one, with one only on a step, and with a value out of range', () => {
    expect(timeoutMissing(job('    runs-on: ubuntu-latest'))).toBe('no job-level timeout-minutes')
    expect(
      timeoutMissing(
        job('    runs-on: ubuntu-latest', '      - run: pnpm test', '        timeout-minutes: 5'),
      ),
    ).toBe('no job-level timeout-minutes')
    expect(
      timeoutMissing(
        job(
          '    runs-on: ubuntu-latest',
          '      - uses: actions/checkout@v7',
          '      - name: Deploy',
          '        uses: actions/deploy-pages@v5',
        ),
      ),
    ).toBe('no job-level timeout-minutes')
    for (const value of [
      '0',
      String(MAX_TIMEOUT_MINUTES + 1),
      '360',
      '2.5',
      '${{ inputs.minutes }}',
    ])
      expect(timeoutMissing(job(`    timeout-minutes: ${value}`))).toBe(
        `timeout-minutes ${value} is not a whole number from 1 to ${String(MAX_TIMEOUT_MINUTES)}`,
      )
  })
})

describe('every workflow that deploys to Pages', () => {
  const jobs = allJobs()

  it('reads the workflow files', () => {
    expect(workflowFiles()).toEqual(
      expect.arrayContaining(['ci.yml', 'deploy-pages.yml', 'release.yml']),
    )
    expect(jobs.map((j) => `${j.file}:${j.name}`)).toEqual(
      expect.arrayContaining(['deploy-pages.yml:build', 'release.yml:deploy', 'ci.yml:build']),
    )
  })

  it('runs the bundle budget and the host audit on dist before it uploads the artifact', () => {
    const uploads = jobs.filter((j) => j.text.includes(UPLOAD))
    expect(uploads.map((j) => `${j.file}:${j.name}`)).toEqual(['deploy-pages.yml:build'])
    for (const job of uploads) expect(deployChecksMissing(job), job.file).toEqual([])
  })

  it('deploys only an artifact built in the same workflow, and the release reuses that workflow', () => {
    const deployers = jobs.filter((j) => j.text.includes(DEPLOY))
    expect(deployers.map((j) => j.file)).toEqual(['deploy-pages.yml'])
    const release = jobs.find((j) => j.file === 'release.yml' && j.name === 'deploy')
    expect(release?.text).toMatch(/^ {4}uses: \.\/\.github\/workflows\/deploy-pages\.yml$/m)
    const callers = jobs.filter((j) => j.text.includes('uses: ./.github/workflows/'))
    expect(callers.map((j) => `${j.file}:${j.name}`)).toEqual(['release.yml:deploy'])
  })
})

describe('deployChecksMissing', () => {
  const step = (run: string, extra = '') => `      - run: ${run}\n${extra}`
  const upload = `      - uses: ${UPLOAD}v5\n`
  const good = [step(BUILD), step(CHECKS[0]), step(CHECKS[1]), upload]

  it('accepts both checks between the build and the upload', () => {
    expect(deployChecksMissing({ steps: good })).toEqual([])
  })

  it('fails a missing check, a check after the upload or before the build, and a conditional one', () => {
    expect(deployChecksMissing({ steps: [good[0], good[1], good[3]] })).toEqual([
      `no step runs "${CHECKS[1]}"`,
    ])
    expect(deployChecksMissing({ steps: [good[0], good[1], good[3], good[2]] })).toEqual([
      `"${CHECKS[1]}" does not run between the build and the upload`,
    ])
    expect(deployChecksMissing({ steps: [good[1], good[0], good[2], good[3]] })).toEqual([
      `"${CHECKS[0]}" does not run between the build and the upload`,
    ])
    expect(
      deployChecksMissing({
        steps: [good[0], step(CHECKS[0], '        continue-on-error: true\n'), good[2], good[3]],
      }),
    ).toEqual([`"${CHECKS[0]}" is conditional`])
  })
})
