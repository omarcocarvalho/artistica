// Node types are only needed by this test (tsconfig.app.json lists just vite/client).
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

interface TsConfig {
  compilerOptions: { lib: string[] }
  include: string[]
  references?: { path: string }[]
}

describe('worker setup', () => {
  it('builds workers as ES modules', () => {
    expect(read('../../../vite.config.ts')).toMatch(/worker:\s*\{\s*format:\s*'es'\s*\}/)
  })

  it('keeps worker files out of the DOM program', () => {
    expect(read('../../../tsconfig.app.json')).toContain('"src/**/*.worker.ts"')
  })

  it('allows importing JSON modules (locale files)', () => {
    expect(read('../../../tsconfig.app.json')).toContain('"resolveJsonModule": true')
  })

  it('type-checks worker files with the WebWorker lib and without DOM', () => {
    const worker = JSON.parse(read('../../../tsconfig.worker.json')) as TsConfig
    expect(worker.compilerOptions.lib).toContain('WebWorker')
    expect(worker.compilerOptions.lib).not.toContain('DOM')
    expect(worker.include).toEqual(['src/**/*.worker.ts'])
  })

  it('references the worker program from the solution tsconfig', () => {
    const root = JSON.parse(read('../../../tsconfig.json')) as TsConfig
    expect(root.references).toContainEqual({ path: './tsconfig.worker.json' })
  })

  it('runs scripts/** tests in the unit project (CR-E7) and includes scripts in the node program', () => {
    expect(read('../../../vite.config.ts')).toContain("'scripts/**/*.test.ts'")
    expect(read('../../../tsconfig.node.json')).toContain('"scripts"')
  })
})
