import { fileURLToPath } from 'node:url'

const f = (name: string) => fileURLToPath(new URL(`../fixtures/presets/${name}`, import.meta.url))

/** Preset files for import tests. `letterValues` holds one preset, "Letter values". */
export const PRESET_FIXTURES = {
  letterValues: f('letter-values.json'),
  notJson: f('not-json.json'),
  settingsEnvelope: f('settings-envelope.json'),
  version2: f('version-2.json'),
  tooLarge: f('too-large.json'),
  oneBroken: f('one-broken.json'),
} as const

/** Every path a preset may hold (M5-R2), `[]` standing for any array index. */
const PRESET_PATHS = [
  'name',
  'pageSetup',
  'pageSetup.paper',
  'pageSetup.customSize',
  'pageSetup.customSize.w',
  'pageSetup.customSize.h',
  'pageSetup.orientation',
  'pageSetup.safeAreaMm',
  'pageSetup.gutter',
  'pageSetup.gutter.enabled',
  'pageSetup.gutter.mm',
  'pageSetup.cropMarks',
  'pageSetup.bleed',
  'pageSetup.bleed.enabled',
  'pageSetup.bleed.mm',
  'study',
  'study.versions',
  'study.versions[]',
  'study.blurPct',
  'study.values',
  'study.values.count',
  'study.values.hue',
  'study.values.neutral',
  'lines',
  'lines.grid',
  'lines.grid.on',
  'lines.grid.cols',
  'lines.grid.rows',
  'lines.thirds',
  'lines.armature',
  'lines.golden',
  'lines.spiral',
  'lines.spiral.on',
  'lines.spiral.corner',
  'lines.centre',
  'lines.style',
  'lines.style.colour',
  'lines.style.widthMm',
  'lines.style.opacityPct',
  'lines.edges',
  'lines.edges.on',
  'lines.edges.detailPct',
  'lines.face',
  'lines.pose',
]

/** Every path in `value`, objects and arrays walked to the leaves (`[]` for an array index). */
export function jsonPaths(value: unknown, prefix = ''): string[] {
  const join = (key: string) => (prefix === '' ? key : `${prefix}.${key}`)
  if (Array.isArray(value)) {
    return value.flatMap((item: unknown) => {
      const path = `${prefix}[]`
      return [path, ...jsonPaths(item, path)]
    })
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, item]) => [
      join(key),
      ...jsonPaths(item, join(key)),
    ])
  }
  return []
}

/** Paths of `presets` (a list of presets) outside the whitelist; [] when every key is allowed. */
export function keysOutsideWhitelist(presets: unknown): string[] {
  const allowed = new Set(PRESET_PATHS.map((p) => `[].${p}`))
  allowed.add('[]')
  return [...new Set(jsonPaths(presets))].filter((p) => !allowed.has(p))
}
