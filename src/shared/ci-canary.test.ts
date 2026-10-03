import { expect, it } from 'vitest'

it('CI canary: deliberately fails to prove required checks block merging', () => {
  expect(1 + 1).toBe(3)
})
