// Node types are only needed by this test (tsconfig.app.json lists just vite/client).
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('./overlays.css', import.meta.url)), 'utf8')

function zIndexOf(selector: string): string | undefined {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const block = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? ''
  return /z-index:\s*([^;]+);/.exec(block)?.[1]?.trim()
}

describe('overlay stacking', () => {
  it('puts the overlay on the same layer as dialogs and sheets, so a nested dialog dims its parent', () => {
    const overlay = zIndexOf('.ds-overlay')
    expect(overlay).toBeDefined()
    expect(zIndexOf('.ds-dialog,\n  .ds-sheet')).toBe(overlay)
  })
})
