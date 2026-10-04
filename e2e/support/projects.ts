import { test } from '@playwright/test'

/** Skip every test in the calling file/describe unless the project name is listed. */
export function runOnly(...names: string[]): void {
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(!names.includes(testInfo.project.name), `runs only in: ${names.join(', ')}`)
  })
}
