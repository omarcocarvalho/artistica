import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { mmToUnit, roundForUnit, type Unit } from '../model/units'
import { parseDecimal } from '../ui/parse-decimal'
import { formatLengthValue } from './format'
import { LANGUAGES } from './languages'

describe('formatLengthValue round-trips through parseDecimal', () => {
  it.each(LANGUAGES)('in %s, for both units', (lng) => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1200, noNaN: true }),
        fc.constantFrom<Unit>('mm', 'in'),
        (mm, unit) => {
          expect(parseDecimal(formatLengthValue(mm, unit, lng))).toBe(
            roundForUnit(mmToUnit(mm, unit), unit),
          )
        },
      ),
    )
  })
})
