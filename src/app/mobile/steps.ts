import type { StepId } from '../state/useAppUi'

export const STEPS: readonly StepId[] = ['images', 'page', 'preview', 'export']

export function stepIndex(step: StepId): number {
  return STEPS.indexOf(step)
}
export function nextStep(step: StepId): StepId {
  return STEPS[Math.min(stepIndex(step) + 1, STEPS.length - 1)] ?? step
}
export function prevStep(step: StepId): StepId {
  return STEPS[Math.max(stepIndex(step) - 1, 0)] ?? step
}
