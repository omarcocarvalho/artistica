import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveCrop } from './crop'
import { descriptor } from './test-support/fixtures'

describe('resolveCrop', () => {
  it('uses the full image when crop is null', () => {
    expect(resolveCrop(descriptor('a', 400, 300))).toEqual({ x: 0, y: 0, w: 400, h: 300 })
  })
  it('keeps a valid crop', () => {
    const crop = { x: 10, y: 20, w: 100, h: 50 }
    expect(resolveCrop(descriptor('a', 400, 300, { crop }))).toEqual(crop)
  })
  it('keeps fractional crops unrounded', () => {
    const crop = { x: 10.25, y: 20.5, w: 100.75, h: 50.125 }
    expect(resolveCrop(descriptor('a', 400, 300, { crop }))).toEqual(crop)
  })
  it('clamps a crop that spills outside the image', () => {
    expect(
      resolveCrop(descriptor('a', 400, 300, { crop: { x: -5, y: 250, w: 500, h: 100 } })),
    ).toEqual({
      x: 0,
      y: 250,
      w: 400,
      h: 50,
    })
  })
})

describe('the page model’s runtime imports', () => {
  const runtimeImports = (file: string): string[] => {
    const src = readFileSync(file, 'utf8')
    const specs = [...src.matchAll(/^(?:import|export) (?!type\b)[^;]*?from '(\.[^']+)'/gms)]
    return specs.flatMap((m) => {
      const spec = m[1]
      if (spec === undefined) return []
      const base = resolve(dirname(file), spec)
      const hit = [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')].find((f) => existsSync(f))
      return hit ? [hit] : []
    })
  }

  it('crop.ts imports only types', () => {
    expect(runtimeImports(join(import.meta.dirname, 'crop.ts'))).toEqual([])
  })

  it('form no cycle from buildPageModels through the guide geometry', () => {
    const seen = new Set<string>()
    const stack: string[] = []
    const cycles: string[][] = []
    const visit = (file: string) => {
      if (stack.includes(file)) {
        cycles.push(stack.slice(stack.indexOf(file)))
        return
      }
      if (seen.has(file)) return
      seen.add(file)
      stack.push(file)
      runtimeImports(file).forEach(visit)
      stack.pop()
    }
    visit(join(import.meta.dirname, 'page-model', 'build-page-models.ts'))
    expect([...seen].some((f) => f.endsWith(join('guides', 'map.ts')))).toBe(true)
    expect(cycles).toEqual([])
  })
})
