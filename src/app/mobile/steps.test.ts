import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { nextStep, prevStep, STEPS, stepIndex } from './steps'

describe('steps', () => {
  it('has the M2 order with Studies between Page and Preview (spec §2.12)', () => {
    expect(STEPS).toEqual(['images', 'page', 'studies', 'preview', 'export'])
  })
  it('clamps at both ends', () => {
    expect(prevStep('images')).toBe('images')
    expect(nextStep('export')).toBe('export')
  })
  it('moves one step at a time and next/prev are inverse in the interior', () => {
    expect(nextStep('images')).toBe('page')
    expect(nextStep('page')).toBe('studies')
    expect(prevStep('preview')).toBe('studies')
    expect(prevStep('studies')).toBe('page')
    fc.assert(
      fc.property(fc.constantFrom(...STEPS), (s) => {
        expect(Math.abs(stepIndex(nextStep(s)) - stepIndex(s))).toBeLessThanOrEqual(1)
        expect(Math.abs(stepIndex(prevStep(s)) - stepIndex(s))).toBeLessThanOrEqual(1)
        if (s !== 'export' && s !== 'images') expect(prevStep(nextStep(s))).toBe(s)
      }),
    )
  })
})
