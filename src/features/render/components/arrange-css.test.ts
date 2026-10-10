// Node types are only needed by this test (tsconfig.app.json lists just vite/client).
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('./arrange.css', import.meta.url)), 'utf8')

function rulesWith(declaration: RegExp): string[] {
  return [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter((m) => declaration.test(m[2] ?? ''))
    .map((m) => (m[1] ?? '').trim())
}

describe('arrange.css on touch screens', () => {
  it('stops panning on blocks and handles only, so the pages still scroll from the gaps (M5-R15)', () => {
    expect(rulesWith(/touch-action:\s*none/)).toEqual(['.arrange-block', '.arrange-handle'])
  })

  it('a long press on a block selects no text and opens no image menu', () => {
    const block = rulesWith(/-webkit-touch-callout:\s*none/)
    expect(block).toEqual(['.arrange-block'])
    expect(rulesWith(/(?:^|[\s;])user-select:\s*none/)).toEqual(['.arrange-block'])
    expect(rulesWith(/-webkit-user-select:\s*none/)).toEqual(['.arrange-block'])
  })
})

describe('arrange.css drag ghost', () => {
  const ghost = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => (m[1] ?? '').split(',').some((sel) => sel.trim() === '.arrange-ghost'))
    .map((m) => m[2] ?? '')
    .join(';')

  it('is fixed to the viewport, above the panels and below dialogs, and never takes the pointer', () => {
    expect(ghost).toMatch(/position:\s*fixed/)
    expect(ghost).toMatch(/pointer-events:\s*none/)
    expect(ghost).toMatch(/z-index:\s*var\(--z-popover\)/)
  })

  it('carries its own on-paper colours, since it is drawn outside the arrange layer', () => {
    for (const name of ['--on-paper-select', '--on-paper-danger']) {
      expect(ghost).toContain(`${name}:`)
    }
  })
})
