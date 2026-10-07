// Node types are only needed by this test (tsconfig.app.json lists just vite/client).
/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('../../../', import.meta.url))
const TOUCH_QUERY = '(pointer: coarse), (max-width: 959.98px)'

const cssFiles = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.css'))
  .map((f) => ({ file: f, css: readFileSync(`${SRC}${f}`, 'utf8') }))

describe('the 44 px touch-target query', () => {
  const queries = cssFiles.flatMap(({ file, css }) =>
    [...css.matchAll(/@media\s+([^{]*pointer:\s*coarse[^{]*)\{/g)].map((m) => ({
      file,
      query: (m[1] ?? '').trim(),
    })),
  )

  it('is used by the shared buttons, the shared form controls, the studies controls and the touch variant', () => {
    expect(queries.map((q) => q.file).sort()).toEqual(
      expect.arrayContaining([
        'features/studies/components/studies.css',
        'shared/styles.css',
        'shared/ui/css/basics.css',
        'shared/ui/css/forms.css',
      ]),
    )
  })

  it('is the same query everywhere, so the phone and coarse-pointer sizes switch together', () => {
    for (const { file, query } of queries)
      expect({ file, query }).toEqual({ file, query: TOUCH_QUERY })
  })
})
