import { describe, expect, it } from 'vitest'
import { EPS_MM, SCORE_SHORT_SIDE_EPS_MM, SEARCH_TOLERANCE_MM } from './tolerances'

describe('tolerances', () => {
  it('keeps the epsilons ordered: fit slack < score tie < search tolerance', () => {
    expect(EPS_MM).toBeLessThan(SCORE_SHORT_SIDE_EPS_MM)
    expect(SCORE_SHORT_SIDE_EPS_MM).toBeLessThan(SEARCH_TOLERANCE_MM)
  })
})
