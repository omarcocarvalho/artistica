// Node types are only needed by this test (tsconfig.app.json lists just vite/client).
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const formsCss = readFileSync(fileURLToPath(new URL('./forms.css', import.meta.url)), 'utf8')

function forcedColoursRule(selector: string): string {
  const start = formsCss.indexOf('@media (forced-colors: active)')
  expect(start).toBeGreaterThan(-1)
  const block = formsCss.slice(start)
  const at = block.indexOf(`${selector} {`)
  expect(at).toBeGreaterThan(-1)
  return block.slice(at, block.indexOf('}', at))
}

describe('segmented control in forced colours', () => {
  it('the checked option has no accent underline', () => {
    // It opts out of forced colours, so the browser keeps its box-shadow unless the rule clears it.
    const rule = forcedColoursRule(".ds-seg__item[data-state='checked']")
    expect(rule).toContain('forced-color-adjust: none')
    expect(rule).toMatch(/box-shadow:\s*none;/)
  })
})

const overlaysCss = readFileSync(fileURLToPath(new URL('./overlays.css', import.meta.url)), 'utf8')

describe('dialogs and sheets in forced colours', () => {
  it('keep a CanvasText border, since forced colours drop the shadow that outlines them', () => {
    const start = overlaysCss.indexOf('@media (forced-colors: active)')
    expect(start).toBeGreaterThan(-1)
    const block = overlaysCss.slice(start)
    const at = block.indexOf('.ds-dialog,\n    .ds-sheet {')
    expect(at).toBeGreaterThan(-1)
    expect(block.slice(at, block.indexOf('}', at))).toMatch(/border:\s*1px solid CanvasText;/)
  })
})
