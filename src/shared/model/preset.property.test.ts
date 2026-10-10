import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { parseSettings } from '../../features/settings/schema'
import { SPIRAL_CORNERS, withoutLineTypes, type LineSettings } from './lines'
import { PAPER_IDS } from './paper'
import type { PageSetup } from './page-setup'
import {
  buildPresetFile,
  parsePresetFile,
  PRESET_FILE_FORMAT,
  presetFromSettings,
  sanitizePreset,
} from './preset'
import { STUDY_VERSIONS, type StudySettings } from './study'

const loose = <T>(arb: fc.Arbitrary<T>): fc.Arbitrary<unknown> =>
  fc.oneof({ weight: 4, arbitrary: arb }, { weight: 1, arbitrary: fc.anything() })

const num = fc.oneof(
  fc.double({ noNaN: true, min: -1000, max: 2000 }),
  fc.integer({ min: -5, max: 500 }),
)

const pageSetupArb = fc.record({
  paper: loose(fc.constantFrom(...PAPER_IDS)),
  customSize: loose(fc.record({ w: num, h: num })),
  orientation: loose(fc.constantFrom('auto', 'portrait', 'landscape')),
  safeAreaMm: loose(num),
  gutter: loose(fc.record({ enabled: loose(fc.boolean()), mm: loose(num) })),
  cropMarks: loose(fc.boolean()),
  bleed: loose(fc.record({ enabled: loose(fc.boolean()), mm: loose(num) })),
})

const studyArb = fc.record({
  versions: loose(fc.array(loose(fc.constantFrom(...STUDY_VERSIONS)))),
  blurPct: loose(num),
  values: loose(fc.record({ count: loose(num), hue: loose(num), neutral: loose(fc.boolean()) })),
})

const linesArb = fc.record({
  grid: loose(fc.record({ on: loose(fc.boolean()), cols: loose(num), rows: loose(num) })),
  thirds: loose(fc.boolean()),
  armature: loose(fc.boolean()),
  golden: loose(fc.boolean()),
  spiral: loose(
    fc.record({ on: loose(fc.boolean()), corner: loose(fc.constantFrom(...SPIRAL_CORNERS)) }),
  ),
  centre: loose(fc.boolean()),
  style: loose(
    fc.record({
      colour: loose(fc.constantFrom('#112233', '#ABCDEF', ' #a1b2c3 ', 'red')),
      widthMm: loose(num),
      opacityPct: loose(num),
    }),
  ),
  edges: loose(fc.record({ on: loose(fc.boolean()), detailPct: loose(num) })),
  face: loose(fc.boolean()),
  pose: loose(fc.boolean()),
})

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

describe('parsePresetFile', () => {
  it('never throws for any string', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (text) => {
        expect(() => parsePresetFile(text)).not.toThrow()
      }),
    )
  })

  it('never throws for any JSON value', () => {
    fc.assert(
      fc.property(fc.json(), (text) => {
        expect(() => parsePresetFile(text)).not.toThrow()
      }),
    )
  })

  it('never throws for anything stringified, inside or outside a preset file envelope', () => {
    fc.assert(
      fc.property(fc.anything(), fc.array(fc.anything(), { maxLength: 4 }), (value, presets) => {
        const texts = [
          value === undefined ? 'undefined' : JSON.stringify(value),
          JSON.stringify({ format: PRESET_FILE_FORMAT, version: 1, presets: [...presets, value] }),
        ]
        for (const text of texts) expect(() => parsePresetFile(text)).not.toThrow()
      }),
    )
  })

  it('never throws on deep nesting', () => {
    const deep = `${'['.repeat(20_000)}${']'.repeat(20_000)}`
    expect(() => parsePresetFile(deep)).not.toThrow()
    const deepPreset = `{"format":"artistica-presets","version":1,"presets":[{"name":"x","pageSetup":${'{"a":'.repeat(5000)}1${'}'.repeat(5000)},"study":{},"lines":{}}]}`
    expect(() => parsePresetFile(deepPreset)).not.toThrow()
  })

  it('round-trips any sanitised preset exactly', () => {
    fc.assert(
      fc.property(pageSetupArb, studyArb, linesArb, (pageSetup, study, lines) => {
        const p = sanitizePreset({ name: 'P', pageSetup, study, lines })
        if (p === null) return
        expect(parsePresetFile(buildPresetFile([p]))).toEqual({
          ok: true,
          presets: [p],
          skipped: 0,
          adjusted: 0,
        })
      }),
    )
  })
})

describe('sanitizePreset', () => {
  it('is idempotent', () => {
    fc.assert(
      fc.property(pageSetupArb, studyArb, linesArb, (pageSetup, study, lines) => {
        const once = sanitizePreset({ name: ' My  preset ', pageSetup, study, lines })
        expect(once).not.toBeNull()
        expect(sanitizePreset(once)).toEqual(once)
      }),
    )
  })

  it('uses the same sanitizers as saved settings', () => {
    fc.assert(
      fc.property(pageSetupArb, studyArb, linesArb, (pageSetup, study, lines) => {
        const p = sanitizePreset({ name: 'P', pageSetup, study, lines })
        if (!isObject(pageSetup) || !isObject(study) || !isObject(lines)) return
        const saved = parseSettings({ pageSetup, studyDefaults: study, lineDefaults: lines })
        expect(p?.pageSetup).toEqual(saved.pageSetup)
        expect({ blurPct: p?.study.blurPct, values: p?.study.values }).toEqual(saved.studyDefaults)
        expect(p && withoutLineTypes(p.lines)).toEqual(saved.lineDefaults)
      }),
    )
  })
})

const photoArb = fc.record({
  id: fc.uuid().map((u) => `img-${u}`),
  contentHash: fc.stringMatching(/^[0-9a-f]{64}$/),
  name: fc.uuid().map((u) => `IMG_${u}.jpg`),
  pxW: fc.integer({ min: 1, max: 9000 }),
  pxH: fc.integer({ min: 1, max: 9000 }),
})

describe('no photo data leaks', () => {
  it('a preset file built while photos are loaded holds none of their ids, hashes or names', () => {
    fc.assert(
      fc.property(
        fc.array(photoArb, { minLength: 1, maxLength: 4 }),
        pageSetupArb,
        studyArb,
        linesArb,
        (photos, pageSetup, study, lines) => {
          const [first] = photos
          if (first === undefined) return
          const tag = { imageId: first.id, contentHash: first.contentHash, fileName: first.name }
          const settings = {
            images: photos,
            selectedImageId: first.id,
            pageSetup: { ...(isObject(pageSetup) ? pageSetup : {}), ...tag },
            study: { ...(isObject(study) ? study : {}), ...tag, sourceName: first.name },
            lines: { ...(isObject(lines) ? lines : {}), ...tag, detections: photos },
          }
          const text = buildPresetFile([
            presetFromSettings(
              'Study',
              settings as unknown as {
                pageSetup: PageSetup
                study: StudySettings
                lines: LineSettings
              },
            ),
          ])
          for (const photo of photos) {
            expect(text).not.toContain(photo.id)
            expect(text).not.toContain(photo.contentHash)
            expect(text).not.toContain(photo.name)
          }
          expect(text).not.toMatch(/imageId|contentHash|fileName|images|detections|sourceName/)
        },
      ),
    )
  })
})
