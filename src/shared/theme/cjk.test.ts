// Node types are only needed by this test (tsconfig.app.json lists just vite/client).
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LANGUAGES } from '../i18n/languages'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const tokensCss = read('./tokens.css')
const baseCss = read('./base.css')
const controlsCss = ['basics.css', 'forms.css', 'overlays.css'].map((f) => read(`../ui/css/${f}`))

/** M6-R17: each CJK language's own system fonts, in order. */
const CJK_FONTS = {
  ja: [
    '"Hiragino Sans"',
    '"Hiragino Kaku Gothic ProN"',
    '"Yu Gothic UI"',
    '"Yu Gothic"',
    'Meiryo',
    '"Noto Sans JP"',
    '"Noto Sans CJK JP"',
  ],
  ko: ['"Apple SD Gothic Neo"', '"Malgun Gothic"', '"Noto Sans KR"', '"Noto Sans CJK KR"'],
  'zh-CN': [
    '"PingFang SC"',
    '"Hiragino Sans GB"',
    '"Microsoft YaHei UI"',
    '"Microsoft YaHei"',
    '"Noto Sans SC"',
    '"Noto Sans CJK SC"',
  ],
} as const
type CjkLanguage = keyof typeof CJK_FONTS

const CJK_NAME =
  /Hiragino|PingFang|YaHei|SimSun|SimHei|Gothic|Meiryo|Mincho|Malgun|Nanum|CJK|Noto (Sans|Serif) (JP|KR|SC|TC|HK)/

interface Rule {
  selector: string
  body: string
}

/** Every innermost rule (a block holding declarations only), with nested at-rules unwrapped. */
function rules(css: string): Rule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: Rule[] = []
  const stack: number[] = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') stack.push(i)
    else if (text[i] === '}') {
      const open = stack.pop()
      if (open === undefined) continue
      const body = text.slice(open + 1, i)
      if (body.includes('{')) continue
      const head = text.slice(0, open)
      const selector = head.slice(
        Math.max(head.lastIndexOf('}'), head.lastIndexOf('{'), head.lastIndexOf(';')) + 1,
      )
      out.push({ selector: selector.replace(/\s+/g, ' ').trim(), body })
    }
  }
  return out
}

function declarations(body: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const [, name, value] of body.matchAll(/([a-z-]+):\s*((?:[^;"]|"[^"]*")+)(?:;|$)/g)) {
    if (name && value) out.set(name, value.replace(/\s+/g, ' ').trim())
  }
  return out
}

/** Top-level comma split of a selector list or font stack (ignores commas in quotes and brackets). */
function splitList(list: string): string[] {
  const out: string[] = []
  let depth = 0
  let quoted = false
  let start = 0
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    if (c === '"') quoted = !quoted
    else if (!quoted && c === '(') depth++
    else if (!quoted && c === ')') depth--
    else if (!quoted && depth === 0 && c === ',') {
      out.push(list.slice(start, i).trim())
      start = i + 1
    }
  }
  out.push(list.slice(start).trim())
  return out.filter(Boolean)
}

/** True when a selector matches the element of the language itself (`:lang(x)` or `:is(…, :lang(x), …)`). */
function selectsLanguage(selector: string, lng: string): boolean {
  return splitList(selector).some((part) => {
    if (part === `:lang(${lng})`) return true
    const is = /^:is\((.*)\)$/.exec(part)
    return is?.[1] !== undefined && splitList(is[1]).includes(`:lang(${lng})`)
  })
}

const allRules = [tokensCss, baseCss, ...controlsCss].flatMap(rules)
const sharedStacks = declarations(
  rules(tokensCss).find((r) => r.selector === '@theme static')?.body ?? '',
)

/** The declarations that apply to an element whose own language is `lng`, later rules winning. */
function forLanguage(lng: string): Map<string, string> {
  const merged = new Map(sharedStacks)
  for (const rule of allRules) {
    if (!selectsLanguage(rule.selector, lng)) continue
    for (const [name, value] of declarations(rule.body)) merged.set(name, value)
  }
  return merged
}

function resolve(value: string, scope: Map<string, string>, depth = 0): string {
  if (depth > 8) throw new Error(`var() cycle in ${value}`)
  return value.replace(/var\((--[a-z0-9-]+)\)/g, (_, name: string) => {
    const inner = scope.get(name)
    if (inner === undefined) throw new Error(`${name} is not defined for this language`)
    return resolve(inner, scope, depth + 1)
  })
}

function stack(name: string, lng: string): string[] {
  const scope = forLanguage(lng)
  const value = scope.get(name)
  if (value === undefined) throw new Error(`${name} not set`)
  return splitList(resolve(value, scope))
}

const cjkOnly = (families: readonly string[]) => families.filter((f) => CJK_NAME.test(f))
const otherCjk = (lng: CjkLanguage) =>
  (Object.keys(CJK_FONTS) as CjkLanguage[])
    .filter((other) => other !== lng)
    .flatMap((other) => CJK_FONTS[other].filter((f) => !CJK_FONTS[lng].includes(f as never)))

const LATIN_FAMILY = {
  '--font-ui': '"Atkinson Hyperlegible Next Variable"',
  '--font-display': '"Fraunces Variable"',
  '--font-hand': '"Caveat Variable"',
} as const
const ROLES = Object.keys(LATIN_FAMILY) as (keyof typeof LATIN_FAMILY)[]
const CJK_LANGUAGES = Object.keys(CJK_FONTS) as CjkLanguage[]

/** The local-only face that draws Chinese curly quotes from a Chinese font (Latin fonts draw them narrow). */
const QUOTES = '"Artistica Quotes"'
const QUOTE_RANGE = 'U+2018-2019, U+201C-201D'
const lead = (lng: string): string[] => (lng === 'zh-CN' ? [QUOTES] : [])
const fontFaces = [tokensCss, baseCss, ...controlsCss]
  .flatMap(rules)
  .filter((r) => r.selector === '@font-face')
  .map((r) => declarations(r.body))

describe('CJK fonts per language (M6-R17)', () => {
  it('covers every CJK language the app ships', () => {
    expect(LANGUAGES.filter((l) => /^(ja|ko|zh)/.test(l)).sort()).toEqual([...CJK_LANGUAGES].sort())
  })

  it('the shared --font-ui and --font-display stacks name no CJK font', () => {
    for (const role of ROLES) {
      const shared = splitList(sharedStacks.get(role) ?? '')
      expect(shared.length, role).toBeGreaterThan(2)
      expect(cjkOnly(shared), role).toEqual([])
    }
  })

  it('an English page keeps the shared stacks', () => {
    for (const role of ROLES)
      expect(stack(role, 'en'), role).toEqual(splitList(sharedStacks.get(role) ?? ''))
  })

  it.each(CJK_LANGUAGES)(
    '%s lists its own fonts, in order, right after the Latin family',
    (lng) => {
      for (const role of ROLES) {
        const families = stack(role, lng)
        expect(families.slice(0, lead(lng).length), `${lng} ${role}`).toEqual(lead(lng))
        expect(families[lead(lng).length], `${lng} ${role}`).toBe(LATIN_FAMILY[role])
        expect(cjkOnly(families), `${lng} ${role}`).toEqual(CJK_FONTS[lng])
        const latin = families.slice(lead(lng).length, families.indexOf(CJK_FONTS[lng][0]))
        expect(cjkOnly(latin), `${lng} ${role}`).toEqual([])
        expect(
          latin.every((f) => splitList(sharedStacks.get(role) ?? '').includes(f)),
          `${lng} ${role}`,
        ).toBe(true)
      }
    },
  )

  it(':lang(ja) puts Hiragino Sans before any Chinese or Korean font', () => {
    const families = stack('--font-ui', 'ja')
    const first = families.indexOf('"Hiragino Sans"')
    expect(first).toBeGreaterThan(0)
    for (const f of otherCjk('ja'))
      expect(!families.includes(f) || families.indexOf(f) > first, f).toBe(true)
  })

  it(':lang(zh-CN) puts PingFang SC before any Japanese font', () => {
    const families = stack('--font-ui', 'zh-CN')
    const first = families.indexOf('"PingFang SC"')
    expect(first).toBeGreaterThan(0)
    for (const f of CJK_FONTS.ja)
      expect(!families.includes(f) || families.indexOf(f) > first, f).toBe(true)
  })

  it(':lang(ko) puts Apple SD Gothic Neo first among CJK fonts', () => {
    expect(cjkOnly(stack('--font-ui', 'ko'))[0]).toBe('"Apple SD Gothic Neo"')
  })

  it.each(CJK_LANGUAGES)(
    'in %s --font-display and --font-hand fall back to the language’s sans',
    (lng) => {
      for (const role of ['--font-display', '--font-hand'] as const) {
        const families = stack(role, lng)
        expect(families.at(-1), `${lng} ${role}`).toBe('sans-serif')
        expect(families, `${lng} ${role}`).not.toContain('serif')
        expect(families, `${lng} ${role}`).not.toContain('cursive')
      }
    },
  )

  it('an element with its own lang re-resolves the UI stack inside that subtree', () => {
    const rule = allRules.find((r) => r.selector === ':where([lang])')
    expect(declarations(rule?.body ?? '').get('font-family')).toBe('var(--font-ui)')
  })

  it('adds no font file: its only faces are local fonts, for the quote marks alone', () => {
    expect(fontFaces.length).toBeGreaterThan(0)
    for (const face of fontFaces) {
      expect(face.get('font-family')).toBe(QUOTES)
      expect(face.get('unicode-range')).toBe(QUOTE_RANGE)
      const sources = splitList(face.get('src') ?? '')
      expect(sources.length).toBeGreaterThan(2)
      for (const source of sources) expect(source).toMatch(/^local\("[^"]+"\)$/)
      expect(face.get('src')).not.toMatch(/url\(/)
    }
  })

  it('zh-CN draws curly quotes from a Chinese font before the Latin family takes them', () => {
    for (const role of ROLES) expect(stack(role, 'zh-CN')[0], role).toBe(QUOTES)
    for (const lng of LANGUAGES.filter((l) => l !== 'zh-CN'))
      for (const role of ROLES) expect(stack(role, lng), `${lng} ${role}`).not.toContain(QUOTES)
    const sources = fontFaces.flatMap((face) => splitList(face.get('src') ?? ''))
    for (const font of ['PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC'])
      expect(
        sources.some((source) => source.includes(font)),
        font,
      ).toBe(true)
    expect(
      sources.some((source) => /Hiragino Sans"|Hiragino Kaku|Yu Gothic|Meiryo|JP/.test(source)),
    ).toBe(false)
  })

  it('zh-CN asks for the full-width quote glyphs (PingFang SC draws them proportional by default)', () => {
    expect(forLanguage('zh-CN').get('font-variant-east-asian')).toBe('full-width')
    for (const lng of LANGUAGES.filter((l) => l !== 'zh-CN'))
      expect(forLanguage(lng).get('font-variant-east-asian'), lng).toBeUndefined()
  })
})

describe('CJK line breaking (M6-R18)', () => {
  it('ja and zh-CN set line-break: strict; ko sets word-break: keep-all; each sets overflow-wrap: anywhere and font-synthesis: none', () => {
    for (const lng of ['ja', 'zh-CN'])
      expect(forLanguage(lng).get('line-break'), lng).toBe('strict')
    expect(forLanguage('zh-CN').get('word-break')).toBe('normal')
    expect(forLanguage('ko').get('word-break')).toBe('keep-all')
    expect(forLanguage('ko').get('line-break')).toBeUndefined()
    for (const lng of CJK_LANGUAGES) {
      expect(forLanguage(lng).get('overflow-wrap'), lng).toBe('anywhere')
      expect(forLanguage(lng).get('font-synthesis'), lng).toBe('none')
    }
  })

  it('leaves Latin languages to the browser defaults', () => {
    for (const lng of LANGUAGES.filter((l) => !(CJK_LANGUAGES as string[]).includes(l))) {
      const d = forLanguage(lng)
      for (const prop of ['line-break', 'word-break', 'overflow-wrap', 'font-synthesis'])
        expect(d.get(prop), `${lng} ${prop}`).toBeUndefined()
    }
  })

  it('Japanese text, hints and notices included, breaks at phrases where the browser can', () => {
    expect(forLanguage('ja').get('word-break')).toBe('auto-phrase')
    const rules = allRules.filter((r) => declarations(r.body).get('word-break') === 'auto-phrase')
    for (const rule of rules) expect(rule.selector).not.toMatch(/zh|ko/)
  })

  it('hint and notice paragraphs avoid a lone word or character on their last line', () => {
    const pretty = allRules.filter((r) => declarations(r.body).get('text-wrap') === 'pretty')
    const selectors = pretty.flatMap((r) => splitList(r.selector.replace(/^:where\((.*)\)$/, '$1')))
    expect(selectors).toEqual(expect.arrayContaining(['p', '.ds-note__body']))
  })

  it('never hyphenates automatically', () => {
    for (const css of [tokensCss, baseCss, ...controlsCss])
      expect(css).not.toMatch(/hyphens:\s*auto/)
  })

  it.each(['.ds-btn', '.ds-chip', '.ds-tab', '.ds-seg__item'])(
    'buttons, chips, tabs and segmented options allow overflow-wrap: anywhere (%s)',
    (selector) => {
      const rule = allRules.find((r) => r.selector === selector)
      expect(declarations(rule?.body ?? '').get('overflow-wrap'), selector).toBe('anywhere')
    },
  )

  it.each(CJK_LANGUAGES)(
    '%s hand lettering takes its line height from the fonts it draws with',
    (lng) => {
      const rule = rules(tokensCss).find(
        (r) => r.selector.startsWith('.font-hand:') && selectsLanguage(r.selector.slice(10), lng),
      )
      expect(declarations(rule?.body ?? '').get('line-height'), lng).toBe('normal')
    },
  )
})
