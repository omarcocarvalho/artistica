import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Namespace (file name without `.json`) → that file's parsed content. */
export type LocaleTree = Readonly<Record<string, unknown>>
/** Language → `<namespace>:<key>` → hash of the English value it was translated from. */
export type Stamps = Readonly<Record<string, Readonly<Record<string, string>>>>

export interface LocaleProblem {
  readonly lang: string
  readonly file: string
  readonly key: string
  readonly kind:
    | 'missing-file'
    | 'extra-file'
    | 'missing'
    | 'extra'
    | 'empty'
    | 'variables'
    | 'tags'
    | 'plural-missing'
    | 'plural-extra'
    | 'stale'
}

/** Reviewed keys whose translation may equal the English text in any language. */
export const SAME_AS_ENGLISH: readonly string[] = ['common:actions.ok', 'pageSetup:paper.unitMm']

const LANDING = 'landing'
const STAMPS_FILE = 'src/locales/translated-from.json'
const PLURAL = /^(.*)_(zero|one|two|few|many|other)$/
const VARIABLE = /\{\{([^}]*)\}\}/g
const TAG = /<\/?[A-Za-z0-9]+\s*\/?>/g
const LETTER = /\p{L}/u

export function intlPluralCategories(lang: string): readonly string[] {
  return new Intl.PluralRules(lang).resolvedOptions().pluralCategories
}

export function hashOf(english: string): string {
  return createHash('sha256').update(english).digest('hex').slice(0, 8)
}

function leaves(value: unknown, prefix = '', out = new Map<string, unknown>()) {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      leaves(child, prefix ? `${prefix}.${key}` : key, out)
    }
  } else {
    out.set(prefix, value)
  }
  return out
}

interface Group {
  plain?: { value: unknown }
  readonly forms: Map<string, unknown>
}

function groups(content: unknown): Map<string, Group> {
  const out = new Map<string, Group>()
  for (const [key, value] of leaves(content)) {
    const plural = PLURAL.exec(key)
    const base = plural?.[1] ?? key
    let group = out.get(base)
    if (!group) {
      group = { forms: new Map() }
      out.set(base, group)
    }
    if (plural?.[2]) group.forms.set(plural[2], value)
    else group.plain = { value }
  }
  return out
}

function variables(text: string): string[] {
  const names = [...text.matchAll(VARIABLE)].map((m) =>
    m[1]
      .split(',')
      .map((part) => part.trim())
      .join(', '),
  )
  return [...new Set(names)].sort()
}

const variableName = (variable: string) => variable.split(',')[0] ?? ''

function tags(text: string): string[] {
  return [...text.matchAll(TAG)].map((m) => m[0].replace(/\s+/g, '')).sort()
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i])

export function checkLocales(input: {
  en: LocaleTree
  others: Readonly<Record<string, LocaleTree>>
  stamps: Stamps
  pluralCategories: (lang: string) => readonly string[]
}): { problems: LocaleProblem[]; sameAsEnglish: string[] } {
  const problems: LocaleProblem[] = []
  const sameAsEnglish: string[] = []
  const reviewed = new Set(SAME_AS_ENGLISH)

  for (const lang of Object.keys(input.others).sort()) {
    const tree = input.others[lang] ?? {}
    const stamps = input.stamps[lang] ?? {}
    const required = input.pluralCategories(lang)
    const report = (file: string, key: string, kind: LocaleProblem['kind']) =>
      problems.push({ lang, file, key, kind })

    for (const file of Object.keys(input.en)) {
      if (!(file in tree)) {
        report(file, '', 'missing-file')
        continue
      }
      const enGroups = groups(input.en[file])
      const ownGroups = groups(tree[file])

      const checkValue = (key: string, value: unknown, english: unknown, mayDropCount: boolean) => {
        if (typeof value !== 'string' || value.trim() === '') {
          report(file, key, 'empty')
          return
        }
        if (typeof english !== 'string') return
        const own = variables(value)
        const dropCount = mayDropCount && !own.some((v) => variableName(v) === 'count')
        const expected = variables(english).filter(
          (v) => !(dropCount && variableName(v) === 'count'),
        )
        if (!sameList(own, expected)) report(file, key, 'variables')
        if (!sameList(tags(value), tags(english))) report(file, key, 'tags')
        if (value === english && LETTER.test(english) && !reviewed.has(`${file}:${key}`)) {
          sameAsEnglish.push(`${lang} ${file}:${key}`)
        }
      }

      for (const [base, en] of enGroups) {
        const own = ownGroups.get(base)
        if (!own) {
          report(file, base, 'missing')
          continue
        }
        if (en.forms.size === 0) {
          if (own.plain) checkValue(base, own.plain.value, en.plain?.value, false)
          else report(file, base, 'missing')
          for (const category of own.forms.keys()) report(file, `${base}_${category}`, 'extra')
        } else {
          if (own.plain) report(file, base, 'extra')
          for (const category of required) {
            if (!own.forms.has(category)) report(file, `${base}_${category}`, 'plural-missing')
          }
          for (const [category, value] of own.forms) {
            const key = `${base}_${category}`
            if (category !== 'zero' && !required.includes(category)) {
              report(file, key, 'plural-extra')
            } else {
              const english = en.forms.get(category) ?? en.forms.get('other')
              checkValue(key, value, english, category === 'zero')
            }
          }
        }
        const englishLeaves: [string, unknown][] = en.plain
          ? [[base, en.plain.value]]
          : [...en.forms].map(([category, value]) => [`${base}_${category}`, value])
        for (const [key, english] of englishLeaves) {
          if (typeof english === 'string' && stamps[`${file}:${key}`] !== hashOf(english)) {
            report(file, key, 'stale')
          }
        }
      }

      for (const [base, own] of ownGroups) {
        if (enGroups.has(base)) continue
        if (own.plain) report(file, base, 'extra')
        for (const category of own.forms.keys()) report(file, `${base}_${category}`, 'extra')
      }
    }

    for (const file of Object.keys(tree)) {
      if (!(file in input.en)) report(file, '', 'extra-file')
    }
  }
  return { problems, sameAsEnglish }
}

function englishHashes(en: LocaleTree): Map<string, string> {
  const out = new Map<string, string>()
  for (const [file, content] of Object.entries(en)) {
    for (const [key, value] of leaves(content)) {
      if (typeof value === 'string') out.set(`${file}:${key}`, hashOf(value))
    }
  }
  return out
}

/**
 * Records that `lang` is translated from today's English: every English string when `keys` is
 * omitted, otherwise only `keys` (a plural key may be given by its base). Entries for English
 * strings that no longer exist are dropped; other languages are kept as they are.
 */
export function stamp(
  en: LocaleTree,
  lang: string,
  keys?: readonly string[],
  previous: Stamps = {},
): Stamps {
  const hashes = englishHashes(en)
  const next: Record<string, string> = {}
  if (keys) {
    for (const [key, hash] of Object.entries(previous[lang] ?? {})) {
      if (hashes.has(key)) next[key] = hash
    }
    for (const key of keys) {
      const matches = [...hashes].filter(([k]) => k === key || PLURAL.exec(k)?.[1] === key)
      if (matches.length === 0) throw new Error(`Unknown English key: ${key}`)
      for (const [k, hash] of matches) next[k] = hash
    }
  } else {
    for (const [key, hash] of hashes) next[key] = hash
  }
  const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => (a < b ? -1 : 1)))
  return { ...previous, [lang]: sorted }
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/**
 * Reads `src/locales/<lang>/<ns>.json`, the stamps, and, when the folder exists,
 * `landing/locales/<lang>.json` as the `landing` namespace of each language.
 */
export function readLocales(root: string): {
  en: LocaleTree
  others: Record<string, LocaleTree>
  stamps: Stamps
} {
  const trees: Record<string, Record<string, unknown>> = {}
  const appDir = join(root, 'src/locales')
  for (const entry of readdirSync(appDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const tree: Record<string, unknown> = {}
    for (const file of readdirSync(join(appDir, entry.name)).sort()) {
      if (file.endsWith('.json')) {
        tree[file.slice(0, -'.json'.length)] = readJson(join(appDir, entry.name, file))
      }
    }
    trees[entry.name] = tree
  }
  const landingDir = join(root, 'landing/locales')
  if (existsSync(landingDir)) {
    for (const file of readdirSync(landingDir).sort()) {
      if (file.endsWith('.json')) {
        ;(trees[file.slice(0, -'.json'.length)] ??= {})[LANDING] = readJson(join(landingDir, file))
      }
    }
  }
  if (!('en' in trees)) throw new Error(`No English locale under ${appDir}`)
  const { en, ...others } = trees
  const stampsPath = join(root, STAMPS_FILE)
  const stamps = existsSync(stampsPath) ? (readJson(stampsPath) as Stamps) : {}
  return { en, others, stamps }
}

function filePath(lang: string, file: string): string {
  return file === LANDING ? `landing/locales/${lang}.json` : `src/locales/${lang}/${file}.json`
}

function main(args: string[]): number {
  const rootFlag = args.indexOf('--root')
  const root = rootFlag >= 0 ? (args[rootFlag + 1] ?? '.') : '.'
  const rest = rootFlag >= 0 ? args.filter((_, i) => i !== rootFlag && i !== rootFlag + 1) : args
  const locales = readLocales(root)

  if (rest[0] === '--stamp') {
    const [, lang, ...keys] = rest
    if (!lang || !(lang in locales.others)) {
      console.error(
        `Usage: pnpm i18n:stamp <language> [keys…]; languages: ${Object.keys(locales.others).join(', ') || 'none'}`,
      )
      return 1
    }
    const next = stamp(locales.en, lang, keys.length > 0 ? keys : undefined, locales.stamps)
    writeFileSync(join(root, STAMPS_FILE), `${JSON.stringify(next, null, 2)}\n`)
    console.log(`Stamped ${String(Object.keys(next[lang] ?? {}).length)} keys for ${lang}.`)
    return 0
  }

  const { problems, sameAsEnglish } = checkLocales({
    ...locales,
    pluralCategories: intlPluralCategories,
  })
  const languages = Object.keys(locales.others)
  console.log(
    `Locale check: ${String(languages.length)} language(s) besides English, ${String(problems.length)} problem(s)`,
  )
  for (const p of problems) {
    console.log(`  ${p.kind.padEnd(14)} ${filePath(p.lang, p.file)}${p.key ? `  ${p.key}` : ''}`)
  }
  for (const entry of sameAsEnglish) console.log(`  warning: same as English: ${entry}`)
  if (problems.some((p) => p.kind === 'stale')) {
    console.log(
      'Stale keys: re-translate them from the current English, then run pnpm i18n:stamp <language> <keys…>.',
    )
  }
  return problems.length > 0 ? 1 : 0
}

if (import.meta.main) process.exit(main(process.argv.slice(2)))
