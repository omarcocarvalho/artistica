import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ENDONYMS, LANGUAGES, isLanguageCode } from '../src/shared/i18n/languages.ts'

export interface ScreenEntry {
  readonly id: string
  readonly width: 'desktop' | 'phone'
  readonly description: string
}

const PSEUDO = 'pseudo'
const CAPTURE = /^([\w-]+)\/([\w-]+)-(desktop|phone)\.png$/

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const languageName = (code: string) =>
  isLanguageCode(code) ? ENDONYMS[code] : code === PSEUDO ? 'Pseudo-locale' : code
const languageTag = (code: string) => (code === PSEUDO ? 'en-XA' : code)

/**
 * The contact sheet (M6-R26): one row per screen of `screens`, its descriptions, then each
 * language's desktop and phone capture side by side. `files` are paths under `screens/`.
 */
export function screensIndexHtml(
  files: readonly string[],
  screens: readonly ScreenEntry[],
): string {
  const ids = [...new Set(screens.map((s) => s.id))]
  const captures = new Set<string>()
  const found = new Set<string>()
  for (const file of files) {
    const match = CAPTURE.exec(file)
    if (!match || !ids.includes(match[1])) continue
    captures.add(file)
    found.add(match[2])
  }
  const rank = (code: string) => {
    const i = (LANGUAGES as readonly string[]).indexOf(code)
    return i >= 0 ? i : code === PSEUDO ? LANGUAGES.length + 1 : LANGUAGES.length
  }
  const langs = [...found].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))

  const head = langs
    .map((code) => `<th lang="${languageTag(code)}">${escape(languageName(code))}</th>`)
    .join('')
  const body = ids
    .map((id) => {
      const entries = screens.filter((s) => s.id === id)
      const about = entries.map((s) => `<p><b>${s.width}</b> ${escape(s.description)}</p>`).join('')
      const cells = langs
        .map((code) => {
          const shots = entries
            .map((s) => {
              const file = `${id}/${code}-${s.width}.png`
              const alt = escape(`${s.description} — ${languageName(code)}, ${s.width}`)
              return captures.has(file)
                ? `<a href="${file}"><img src="${file}" alt="${alt}" loading="lazy" class="${s.width}"></a>`
                : `<span class="missing">no ${s.width} capture</span>`
            })
            .join('')
          return `<td>${shots}</td>`
        })
        .join('')
      return `<tr data-screen="${escape(id)}"><th scope="row"><code>${escape(id)}</code>${about}</th>${cells}</tr>`
    })
    .join('\n')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Artistica screens</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
  body { margin: 16px; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #8884; padding: 8px; vertical-align: top; text-align: left; }
  thead th { position: sticky; top: 0; background: Canvas; }
  th[scope="row"] { width: 14rem; font-weight: normal; }
  td a { display: inline-block; margin: 0 4px 4px 0; }
  img.desktop { width: 320px; }
  img.phone { width: 110px; }
  .missing { display: inline-block; color: GrayText; font-size: 0.8rem; margin: 4px; }
</style>
</head>
<body>
<h1>Artistica screens</h1>
<table>
<thead><tr><th>Screen</th>${head}</tr></thead>
<tbody>
${body}
</tbody>
</table>
</body>
</html>
`
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  )
}

function main(dir: string): number {
  const screens = JSON.parse(readFileSync(join(dir, 'screens.json'), 'utf8')) as ScreenEntry[]
  const files = walk(dir).map((file) => relative(dir, file).split('\\').join('/'))
  writeFileSync(join(dir, 'index.html'), screensIndexHtml(files, screens))
  console.log(`Wrote ${join(dir, 'index.html')}`)
  return 0
}

if (import.meta.main) process.exit(main(process.argv[2] ?? 'screens'))
