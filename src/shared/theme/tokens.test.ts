// Node types are only needed by this test (tsconfig.app.json lists just vite/client).
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const designCss = read('../../../design/tokens.css')
const ourCss = read('./tokens.css')

// `--name: value;` where the value may contain quoted strings with semicolons (data: URLs).
const DECL = /(--[a-z0-9-]+):\s*((?:[^;"]|"[^"]*")+);/g

function declarations(block: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const [, name, value] of block.matchAll(DECL)) {
    if (name && value) out.set(name, value.replace(/\s+/g, ' ').trim())
  }
  return out
}

/** Body of the first block whose selector line starts with `selector`. */
function block(css: string, selector: RegExp): string {
  const match = selector.exec(css)
  if (!match) throw new Error(`selector not found: ${String(selector)}`)
  const start = css.indexOf('{', match.index) + 1
  let depth = 1
  let i = start
  while (depth > 0 && i < css.length) {
    if (css[i] === '{') depth++
    if (css[i] === '}') depth--
    i++
  }
  return css.slice(start, i - 1)
}

const designLight = declarations(block(designCss, /^:root \{/m))
const designDark = declarations(block(designCss, /^:root\[data-theme="dark"\] \{/m))
const ourLight = new Map([
  ...declarations(block(ourCss, /^@theme static \{/m)),
  ...declarations(block(ourCss, /^:root \{/m)),
])
const ourDark = declarations(block(ourCss, /^:root\[data-theme='dark'\] \{/m))
const ourDarkMedia = declarations(block(ourCss, /^ {2}:root:not\(\[data-theme='light'\]\) \{/m))

describe('design tokens', () => {
  it('carry every light token from design/tokens.css with the same value', () => {
    for (const [name, value] of designLight) {
      if (name.startsWith('--font-')) continue // family names differ on purpose (see next test)
      expect(ourLight.get(name), name).toBe(value)
    }
  })

  it('use the self-hosted variable font families first', () => {
    expect(ourLight.get('--font-ui')).toMatch(/^"Atkinson Hyperlegible Next Variable"/)
    expect(ourLight.get('--font-display')).toMatch(/^"Fraunces Variable"/)
    expect(ourLight.get('--font-hand')).toMatch(/^"Caveat Variable"/)
    expect(ourLight.get('--font-mono')).toBe(designLight.get('--font-mono'))
  })

  it('carry every dark token, both for the manual override and for the OS preference', () => {
    expect(designDark.size).toBeGreaterThan(20)
    for (const [name, value] of designDark) {
      expect(ourDark.get(name), `[data-theme=dark] ${name}`).toBe(value)
      expect(ourDarkMedia.get(name), `prefers-color-scheme ${name}`).toBe(value)
    }
  })

  it('keeps the printed paper white in both themes (R4)', () => {
    expect(ourLight.get('--color-paper')).toBe('#ffffff')
    expect(ourDark.has('--color-paper')).toBe(false)
    expect(ourDarkMedia.has('--color-paper')).toBe(false)
  })

  it('does not disable the OS preference when the user picked light', () => {
    expect(ourCss).toContain(":root:not([data-theme='light'])")
  })
})
