import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '__fixtures__' ? [] : sources(path)
    const isSource = /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)
    return isSource && name !== 'test-utils.tsx' ? [path] : []
  })
}
const files = sources(import.meta.dirname)
const srcRoot = join(import.meta.dirname, '..', '..')
const allSrc = sources(srcRoot)
const text = (f: string) => readFileSync(f, 'utf8')
/** Drop comments so prose can mention banned words. */
const code = (f: string) =>
  text(f)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

describe('privacy and laziness guards', () => {
  it('finds the sources to scan', () => {
    expect(files.length).toBeGreaterThan(15)
    expect(files.some((f) => f.endsWith('url.ts'))).toBe(true)
  })

  it('never persists or beacons anything', () => {
    const banned =
      /\b(localStorage|sessionStorage|indexedDB|sendBeacon|XMLHttpRequest|WebSocket|EventSource)\b|\bcaches\s*\.|zustand\/middleware|\bpersist\s*\(/
    for (const f of files) expect(code(f), f).not.toMatch(banned)
  })

  it.each(['arrange-store.ts', 'arrange-ui.ts', 'arrange-controller.ts'])(
    'the arrange state (manual layout, undo stack, pick-up, announcements) is memory-only too: %s (M5-R7)',
    (name) => {
      const arrange = join(srcRoot, 'app', name)
      expect(allSrc).toContain(arrange)
      expect(code(arrange)).not.toMatch(
        /\b(localStorage|sessionStorage|indexedDB)\b|zustand\/middleware|\bpersist\s*\(/,
      )
    },
  )

  it('only the URL fetcher and the store wiring touch fetch', () => {
    for (const f of files) {
      if (/\/(url|store)\.ts$/.test(f)) continue
      expect(code(f), f).not.toMatch(/\bfetch\b/)
    }
  })

  it('heic-to is only ever imported dynamically, anywhere in src', () => {
    for (const f of allSrc) {
      expect(code(f), f).not.toMatch(/from\s+['"]heic-to/)
      expect(code(f), f).not.toMatch(/^\s*import\s+['"]heic-to/m)
      expect(code(f), f).not.toMatch(/require\(\s*['"]heic-to/)
    }
    const heic = files.find((f) => f.endsWith('/heic.ts'))
    expect(heic).toBeDefined()
    expect(code(heic ?? '')).toContain("import('heic-to')")
  })
})
