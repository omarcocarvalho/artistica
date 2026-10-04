import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  evaluateBudget,
  gzipBytes,
  INITIAL_JS_LIMIT_BYTES,
  initialScriptPaths,
} from './bundle-budget.ts'

const html = `<!doctype html><html><head>
<script type="module" crossorigin src="/artistica/assets/app-AbC123.js"></script>
<link rel="modulepreload" crossorigin href="/artistica/assets/vendor-XyZ789.js">
<link rel="stylesheet" crossorigin href="/artistica/assets/app-AbC123.css">
<link rel="modulepreload" href="/artistica/assets/react-111.js" crossorigin>
</head><body><div id="root"></div></body></html>`

describe('initialScriptPaths', () => {
  it('returns the entry script and static modulepreloads, relative to dist, in order, without CSS', () => {
    expect(initialScriptPaths(html, '/artistica/')).toEqual([
      'assets/app-AbC123.js',
      'assets/vendor-XyZ789.js',
      'assets/react-111.js',
    ])
  })
  it('ignores attribute order and duplicates', () => {
    const h = `<script src="/artistica/a.js" type="module"></script><script type="module" src="/artistica/a.js"></script>`
    expect(initialScriptPaths(h, '/artistica/')).toEqual(['a.js'])
  })
  it('returns [] for html with no module scripts', () => {
    expect(initialScriptPaths('<html></html>', '/artistica/')).toEqual([])
  })
})

describe('gzipBytes', () => {
  it('matches node zlib at level 9', () => {
    const data = new TextEncoder().encode('abc'.repeat(1000))
    expect(gzipBytes(data)).toBe(gzipSync(data, { level: 9 }).length)
  })
})

describe('evaluateBudget', () => {
  it('passes at exactly the limit and fails one byte over', () => {
    expect(evaluateBudget([{ file: 'a.js', gzipBytes: INITIAL_JS_LIMIT_BYTES }]).ok).toBe(true)
    expect(evaluateBudget([{ file: 'a.js', gzipBytes: INITIAL_JS_LIMIT_BYTES + 1 }]).ok).toBe(false)
  })
  it('sums across files', () => {
    const r = evaluateBudget(
      [
        { file: 'a', gzipBytes: 100 },
        { file: 'b', gzipBytes: 50 },
      ],
      200,
    )
    expect(r).toEqual({ totalBytes: 150, ok: true })
  })
})
