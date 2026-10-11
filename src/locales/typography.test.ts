import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const ROOT = new URL('../../', import.meta.url)

interface Tree {
  readonly [key: string]: string | Tree
}

function strings(lang: string): [string, string][] {
  const out: [string, string][] = []
  const walk = (prefix: string, node: string | Tree): void => {
    if (typeof node === 'string') out.push([prefix, node])
    else
      for (const [k, v] of Object.entries(node))
        walk(prefix.endsWith(':') ? prefix + k : `${prefix}.${k}`, v)
  }
  const read = (path: string): Tree => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8')) as Tree
  const dir = `src/locales/${lang}/`
  for (const file of readdirSync(new URL(dir, ROOT)).filter((f) => f.endsWith('.json')))
    walk(`${file.slice(0, -5)}:`, read(dir + file))
  walk('landing:', read(`landing/locales/${lang}.json`))
  return out
}

const SPACED_UNIT = /(\d|\}\}) +(DPI|MB|px|\{\{unit\}\})/u

describe('number and unit stay on one line in Japanese, Korean and Chinese', () => {
  it.each(['ja', 'ko', 'zh-CN'])(
    '%s writes a no-break space before DPI, MB, px and units',
    (lang) => {
      const spaced = strings(lang)
        .filter(([, value]) => SPACED_UNIT.test(value))
        .map(([key]) => key)
      expect(spaced).toEqual([])
    },
  )
})

describe('Korean particles', () => {
  it('never follow a closing quotation mark, a bracket or a percent sign directly', () => {
    const stranded = strings('ko')
      .filter(([, value]) => /[’”)\]%][\p{Script=Hangul}]/u.test(value))
      .map(([key, value]) => `${key}: ${value}`)
    expect(stranded).toEqual([])
  })
})
