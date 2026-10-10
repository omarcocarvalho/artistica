import { appendFileSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  evaluateBudget,
  gzipBytes,
  INITIAL_JS_LIMIT_BYTES,
  initialScriptPaths,
  isLocaleChunk,
  LOCALE_CHUNK_LIMIT_BYTES,
  lazyOnlyViolations,
  localeChunkViolations,
  localeMarkerViolations,
  stringLeaves,
} from './bundle-budget.ts'

const BASE = '/artistica/'
const htmlPath = process.argv[2] ?? 'dist/app/index.html'
const distDir = process.argv[3] ?? 'dist'

const files = initialScriptPaths(readFileSync(htmlPath, 'utf8'), BASE)
if (files.length === 0) {
  console.error(`No module scripts found in ${htmlPath}; is the build output missing?`)
  process.exit(1)
}
const entries = files.map((file) => ({
  file,
  gzipBytes: gzipBytes(readFileSync(join(distDir, file))),
}))
const { totalBytes, ok } = evaluateBudget(entries)

const localeFiles = readdirSync(join(distDir, 'assets'))
  .map((name) => `assets/${name}`)
  .filter(isLocaleChunk)
  .sort()
const localeEntries = localeFiles.map((file) => ({
  file,
  gzipBytes: gzipBytes(readFileSync(join(distDir, file))),
}))

const kb = (n: number) => `${(n / 1000).toFixed(1)} KB`
const lines = [
  `Initial app JS (gzip): ${kb(totalBytes)} of ${kb(INITIAL_JS_LIMIT_BYTES)}`,
  ...entries.map((e) => `  ${kb(e.gzipBytes).padStart(9)}  ${e.file}`),
  `Locale chunks (gzip, each at most ${kb(LOCALE_CHUNK_LIMIT_BYTES)}): ${String(localeEntries.length)}`,
  ...localeEntries.map((e) => `  ${kb(e.gzipBytes).padStart(9)}  ${e.file}`),
]
console.log(lines.join('\n'))
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### Initial app JS\n\n\`\`\`\n${lines.join('\n')}\n\`\`\`\n`,
  )
}
const eager = lazyOnlyViolations(
  files.map((file) => ({ file, text: readFileSync(join(distDir, file), 'utf8') })),
)
if (eager.length > 0) {
  console.error(
    `MediaPipe is in an initial chunk; import it only from the landmark worker or a dynamic import():\n  ${eager.join('\n  ')}`,
  )
  process.exit(1)
}
const englishDir = new URL('../src/locales/en/', import.meta.url)
const english = new Set(
  readdirSync(englishDir)
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) => [
      ...stringLeaves(JSON.parse(readFileSync(new URL(name, englishDir), 'utf8')) as unknown),
    ]),
)
const leaked = localeMarkerViolations(
  localeFiles.map((file) => ({ file, text: readFileSync(join(distDir, file), 'utf8') })),
  files.map((file) => ({ file, text: readFileSync(join(distDir, file), 'utf8') })),
  english,
)
if (leaked.length > 0) {
  console.error(
    `Non-English strings are in an initial chunk; load every language but English through loadLanguage():\n  ${leaked.join('\n  ')}`,
  )
  process.exit(1)
}
const oversized = localeChunkViolations(localeEntries)
if (oversized.length > 0) {
  console.error(`A language chunk is over its budget:\n  ${oversized.join('\n  ')}`)
  process.exit(1)
}
if (!ok) {
  console.error(
    'Budget exceeded. Lazy-load heavy modules (HEIC decoder, PDF export, workers) with dynamic import().',
  )
  process.exit(1)
}
