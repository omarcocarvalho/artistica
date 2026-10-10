import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LANGUAGES } from '../src/shared/i18n/languages.ts'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const read = (path: string): string => readFileSync(`${ROOT}${path}`, 'utf8')
const doc = (name: string): string => read(`docs/i18n/${name}`)

const DOCS = ['README.md', 'style-guide.md', 'glossary.md', 'context.md', 'privacy-claims.md']

const GLOSSARY_HEADER = ['en', 'pt-BR', 'es', 'it', 'ja', 'ko', 'zh-CN']

const REQUIRED_TERMS = [
  'reference photo',
  'sheet',
  'page',
  'paper',
  'safe area',
  'gutter',
  'bleed',
  'crop marks',
  'cut line, trim',
  'DPI',
  'low resolution',
  'scaled to fit',
  'study',
  'values, tonal values',
  'value study',
  'blur, squint study',
  'hue',
  'value ramp',
  'composition lines',
  'rule of thirds',
  'grid',
  'diagonals',
  'armature',
  'golden ratio',
  'golden spiral',
  'centre lines',
  'guides',
  'edge outline',
  'face construction lines',
  'pose figure',
  'landmarks',
  'preset',
  'arrange',
  'swap',
  're-run auto layout',
  'undo',
  'crop',
  'rotate',
  'flip',
  'copies',
  'fixed size',
  'export',
  'create PDF',
  'download',
  'import',
  'paste',
  'link',
  'offline',
  'model download',
]

const DO_NOT_TRANSLATE = [
  'Artistica',
  'PDF',
  'JPG',
  'PNG',
  'WebP',
  'GIF',
  'HEIC',
  'MediaPipe',
  'MIT',
  'GitHub',
  'DPI',
  'Shift',
  'Ctrl',
  '⌘',
  'Page Up',
  'Page Down',
  'Enter',
  'Esc',
]

const cells = (row: string): string[] =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim())

function glossaryRows(markdown: string): string[][] {
  const rows: string[][] = []
  let inTable = false
  for (const line of markdown.split('\n')) {
    if (!line.trim().startsWith('|')) {
      inTable = false
      continue
    }
    const row = cells(line)
    if (GLOSSARY_HEADER.every((code, i) => row[i] === code)) {
      inTable = true
      continue
    }
    if (inTable && !/^:?-+:?$/.test(row[0] ?? '')) rows.push(row)
  }
  return rows
}

function englishKeys(): Set<string> {
  const keys = new Set<string>()
  const dir = `${ROOT}src/locales/en/`
  const walk = (ns: string, node: unknown, path: string): void => {
    if (typeof node === 'string') {
      keys.add(`${ns}:${path.replace(/_(zero|one|two|few|many|other)$/, '')}`)
      return
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>))
      walk(ns, v, path ? `${path}.${k}` : k)
  }
  for (const file of readdirSync(dir))
    walk(file.replace(/\.json$/, ''), JSON.parse(readFileSync(`${dir}${file}`, 'utf8')), '')
  return keys
}

const REF = /^- `([^`]+)` › (.+)$/

describe('docs/i18n', () => {
  it('has the README, the style guide, the glossary, the context file and the privacy claims', () => {
    for (const name of DOCS) expect(existsSync(`${ROOT}docs/i18n/${name}`), name).toBe(true)
    const readme = doc('README.md')
    for (const name of DOCS.slice(1)) expect(readme, name).toContain(`(${name})`)
  })

  it('the style guide has the common rules and one section per language', () => {
    const headings = doc('style-guide.md')
      .split('\n')
      .filter((l) => l.startsWith('## '))
      .map((l) => l.slice(3).trim())
    expect(headings).toContain('Common rules')
    for (const code of LANGUAGES.filter((c) => c !== 'en'))
      expect(headings.some((h) => h.startsWith(`${code} `) || h === code)).toBe(true)
  })

  it('every glossary row gives the term in all seven languages', () => {
    const rows = glossaryRows(doc('glossary.md'))
    expect(rows.length).toBeGreaterThanOrEqual(REQUIRED_TERMS.length)
    for (const row of rows)
      for (let i = 0; i < GLOSSARY_HEADER.length; i++)
        expect(row[i] ?? '', `${row[0] ?? '?'} / ${GLOSSARY_HEADER[i] ?? '?'}`).not.toBe('')
  })

  it('the glossary covers every term the plan lists', () => {
    const terms = new Set(glossaryRows(doc('glossary.md')).map((r) => r[0]))
    expect(REQUIRED_TERMS.filter((t) => !terms.has(t))).toEqual([])
  })

  it('the glossary keeps product names, file formats and key names untranslated', () => {
    const section = doc('glossary.md').split('## Do not translate')[1]?.split('\n## ')[0] ?? ''
    expect(DO_NOT_TRANSLATE.filter((name) => !section.includes(`\`${name}\``))).toEqual([])
  })

  it('every tight key in the context file is an English key with a limit', () => {
    const keys = englishKeys()
    const context = doc('context.md')
    const table = context.split('## Tight keys')[1]?.split('\n## ')[0] ?? ''
    const rows = table
      .split('\n')
      .filter((l) => l.startsWith('| `'))
      .map(cells)
    expect(rows.length).toBeGreaterThan(20)
    for (const row of rows) {
      const names = [...(row[0] ?? '').matchAll(/`([^`]+)`/g)].map((m) => m[1])
      expect(names.length, row[0]).toBeGreaterThan(0)
      for (const name of names) expect(keys.has(name), name).toBe(true)
      expect(row[2] ?? '', `${row[0] ?? '?'} latin`).toMatch(/^\d+$/)
      expect(row[3] ?? '', `${row[0] ?? '?'} CJK`).toMatch(/^\d+$/)
    }
  })

  it('every privacy claim names at least one backing test, and every named test exists', () => {
    const claims = doc('privacy-claims.md').split('\n### ').slice(1)
    expect(claims.length).toBeGreaterThanOrEqual(6)
    for (const claim of claims) {
      const refs = claim
        .split('\n')
        .map((l) => REF.exec(l))
        .filter((m): m is RegExpExecArray => m !== null)
      expect(refs.length, claim.split('\n')[0]).toBeGreaterThan(0)
      for (const [, file = '', title = ''] of refs) {
        expect(existsSync(`${ROOT}${file}`), file).toBe(true)
        expect(read(file), `${file} › ${title}`).toContain(title)
      }
    }
  })
})
