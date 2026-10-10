import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  evaluateBudget,
  gzipBytes,
  INITIAL_JS_LIMIT_BYTES,
  initialScriptPaths,
  isLocaleChunk,
  LAZY_ONLY_MARKERS,
  lazyOnlyViolations,
  LOCALE_CHUNK_LIMIT_BYTES,
  localeChunkViolations,
  localeMarkers,
  localeMarkerViolations,
  stringLeaves,
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

describe('lazyOnlyViolations', () => {
  it('names each initial chunk that contains FaceLandmarker or PoseLandmarker', () => {
    expect(LAZY_ONLY_MARKERS).toEqual(['FaceLandmarker', 'PoseLandmarker'])
    expect(
      lazyOnlyViolations([
        { file: 'assets/app.js', text: 'const a = 1' },
        { file: 'assets/vendor.js', text: 'class FaceLandmarker {}' },
        { file: 'assets/x.js', text: 'x.PoseLandmarker.createFromOptions()' },
      ]),
    ).toEqual(['assets/vendor.js: FaceLandmarker', 'assets/x.js: PoseLandmarker'])
  })
  it('passes when no initial chunk names them', () => {
    expect(lazyOnlyViolations([{ file: 'assets/app.js', text: 'createLandmarkEngine()' }])).toEqual(
      [],
    )
  })
})

describe('isLocaleChunk', () => {
  it('accepts JS chunks whose file name starts with locale-', () => {
    expect(isLocaleChunk('assets/locale-pt-BR-a1B2c3.js')).toBe(true)
    expect(isLocaleChunk('locale-ja-x.js')).toBe(true)
    expect(isLocaleChunk('assets/locale-ja-x.js.map')).toBe(false)
    expect(isLocaleChunk('assets/app-locale-x.js')).toBe(false)
    expect(isLocaleChunk('assets/locales-x.js')).toBe(false)
  })
})

describe('localeMarkers', () => {
  const chunk = `var e={title:"Artistica",documentTitle:"Aplicativo Artistica",a:'Couldn\\'t carregar',b:\`Adicionar fotos aqui\`,c:"Adicionar fotos aqui",d:"日本語のテキストがここにありますよ"};export{e as default};`

  it('lists each string literal longer than 12 characters once, in order', () => {
    expect(localeMarkers(chunk)).toEqual([
      '"Aplicativo Artistica"',
      "'Couldn\\'t carregar'",
      '`Adicionar fotos aqui`',
      '"Adicionar fotos aqui"',
      '"日本語のテキストがここにありますよ"',
    ])
  })

  it('skips literals of 12 characters or fewer', () => {
    expect(localeMarkers('x="123456789012";y="1234567890123"')).toEqual(['"1234567890123"'])
  })

  it('skips the chunk import paths the bundler writes', () => {
    expect(
      localeMarkers(
        'import{r as e}from"./rolldown-runtime-hePW80VL.js";import"../assets/app-Ds_3CWdD.js";var t={a:"./not a path at all.js"}',
      ),
    ).toEqual(['"./not a path at all.js"'])
  })

  it('skips literals equal to an English string', () => {
    expect(
      localeMarkers(
        'x="Artistica reference sheet";y="Folha de referência"',
        new Set(['Artistica reference sheet']),
      ),
    ).toEqual(['"Folha de referência"'])
  })
})

describe('localeMarkerViolations', () => {
  const locale = [
    {
      file: 'assets/locale-pt-BR-1.js',
      text: 'var e={a:"Adicionar suas fotos",b:"Sim"};export{e as default}',
    },
    {
      file: 'assets/locale-ja-2.js',
      text: 'var e={a:"写真を追加してください。今すぐ"};export{e as default}',
    },
  ]

  it('names each initial chunk that holds a string of a locale chunk', () => {
    expect(
      localeMarkerViolations(
        locale,
        [
          { file: 'assets/app.js', text: 'const x={a:"Add your photos"}' },
          { file: 'assets/vendor.js', text: 'q("Adicionar suas fotos")' },
          { file: 'assets/other.js', text: 'z="写真を追加してください。今すぐ"' },
        ],
        new Set(),
      ),
    ).toEqual([
      'assets/vendor.js: "Adicionar suas fotos" (from assets/locale-pt-BR-1.js)',
      'assets/other.js: "写真を追加してください。今すぐ" (from assets/locale-ja-2.js)',
    ])
  })

  it('passes when the initial chunks hold only English', () => {
    expect(
      localeMarkerViolations(
        locale,
        [{ file: 'assets/app.js', text: 'a:"Add your photos"' }],
        new Set(),
      ),
    ).toEqual([])
  })

  it('passes with no locale chunk at all', () => {
    expect(
      localeMarkerViolations(
        [],
        [{ file: 'assets/app.js', text: 'a:"Add your photos"' }],
        new Set(),
      ),
    ).toEqual([])
  })
})

describe('localeChunkViolations', () => {
  it('fails each locale chunk over 15 KB gzip and ignores other chunks', () => {
    expect(LOCALE_CHUNK_LIMIT_BYTES).toBe(15_000)
    expect(
      localeChunkViolations([
        { file: 'assets/locale-ja-1.js', gzipBytes: 15_000 },
        { file: 'assets/locale-ko-2.js', gzipBytes: 15_001 },
        { file: 'assets/app-3.js', gzipBytes: 200_000 },
      ]),
    ).toEqual(['assets/locale-ko-2.js: 15.0 KB of 15.0 KB (15001 bytes)'])
  })
})

describe('stringLeaves', () => {
  it('collects every string value of a locale tree', () => {
    expect([...stringLeaves({ a: 'One', b: { c: 'Two', d: { e: 'Three' } }, n: 3 })]).toEqual([
      'One',
      'Two',
      'Three',
    ])
  })
})
