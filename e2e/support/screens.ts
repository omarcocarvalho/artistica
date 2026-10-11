import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'
import { AppPage } from './app.ts'
import { ArrangeArea } from './arrange.ts'
import { FIXTURES } from './fixtures.ts'
import { pseudoLocalize } from './l10n.ts'
import { PRESET_FIXTURES } from './presets.ts'

/** The pseudo-locale or one of the seven language codes. */
export type ScreenLanguage = string

/** One screen or state of the set M6-R26 reviews in every language. */
export interface Screen {
  readonly id: string
  readonly width: 'desktop' | 'phone'
  readonly description: string
}

export const SCREENS: readonly Screen[] = [
  { id: 'landing', width: 'desktop', description: 'Landing page' },
  { id: 'empty', width: 'desktop', description: 'Empty workspace' },
  {
    id: 'photos',
    width: 'desktop',
    description: 'Workspace with photos: copies and low-resolution badges, a photo selected',
  },
  { id: 'export-reason', width: 'desktop', description: 'Export unavailable: the reason tooltip' },
  { id: 'edit', width: 'desktop', description: 'Edit dialog: crop controls, two copies' },
  { id: 'edit-fixed', width: 'desktop', description: 'Edit dialog: fixed width' },
  {
    id: 'page',
    width: 'desktop',
    description: 'Page tab: custom paper, bleed, the gutter note',
  },
  { id: 'studies', width: 'desktop', description: 'Studies tab: every version' },
  {
    id: 'lines',
    width: 'desktop',
    description: 'Lines tab: every line, face and pose guides with the download box',
  },
  { id: 'presets-empty', width: 'desktop', description: 'Presets dialog: none saved' },
  { id: 'presets-saved', width: 'desktop', description: 'Presets dialog: one saved' },
  { id: 'presets-rename', width: 'desktop', description: 'Presets dialog: renaming' },
  { id: 'presets-apply', width: 'desktop', description: 'Presets dialog: the apply question' },
  { id: 'presets-delete', width: 'desktop', description: 'Presets dialog: the delete question' },
  { id: 'presets-refused', width: 'desktop', description: 'Presets dialog: an import refused' },
  { id: 'arrange', width: 'desktop', description: 'Arrange mode on' },
  { id: 'arrange-picked', width: 'desktop', description: 'Arrange mode: a photo picked up' },
  { id: 'export', width: 'desktop', description: 'Export dialog: the summary' },
  { id: 'export-done', width: 'desktop', description: 'Export dialog: the PDF is ready' },
  { id: 'import-errors', width: 'desktop', description: 'Import errors and notices' },
  { id: 'landing', width: 'phone', description: 'Landing page' },
  { id: 'empty', width: 'phone', description: 'Images step, empty' },
  { id: 'photos', width: 'phone', description: 'Images step with photos' },
  { id: 'edit', width: 'phone', description: 'Edit sheet' },
  { id: 'page', width: 'phone', description: 'Page step with bleed and the gutter note' },
  { id: 'studies', width: 'phone', description: 'Studies step: a study group and every line' },
  { id: 'presets', width: 'phone', description: 'Presets sheet' },
  { id: 'preview', width: 'phone', description: 'Preview step' },
  { id: 'arrange-sheet', width: 'phone', description: 'Arrange: the photo options sheet' },
  { id: 'export', width: 'phone', description: 'Export step, ready' },
  { id: 'export-done', width: 'phone', description: 'Export step, the PDF is ready' },
  { id: 'import-errors', width: 'phone', description: 'Import errors and notices' },
]

const PHOTOS = [FIXTURES.quadrantsJpg, FIXTURES.portraitJpg]

const english = new Map<string, Record<string, unknown>>()
function bundle(lang: string, ns: string): Record<string, unknown> | null {
  const key = `${lang}/${ns}`
  if (!english.has(key)) {
    try {
      const url = new URL(`../../src/locales/${lang}/${ns}.json`, import.meta.url)
      english.set(key, JSON.parse(readFileSync(url, 'utf8')) as Record<string, unknown>)
    } catch {
      return null
    }
  }
  return english.get(key) ?? null
}

function lookup(tree: Record<string, unknown> | null, path: string): string | null {
  let node: unknown = tree
  for (const part of path.split('.')) {
    if (node === null || typeof node !== 'object') return null
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : null
}

/**
 * The text of `ns:key` as `lang` shows it: the locale file of the language, English for a missing
 * key, the pseudo-locale built from English. `{{var}}` values are filled as given.
 */
export function textIn(
  lang: ScreenLanguage,
  id: string,
  vars: Readonly<Record<string, string>> = {},
): string {
  const [ns = '', key = ''] = id.split(':')
  const source = lang === 'pseudo' || lang === 'en' ? 'en' : lang
  const value = lookup(bundle(source, ns), key) ?? lookup(bundle('en', ns), key)
  if (value === null) throw new Error(`no string ${id}`)
  const shown = lang === 'pseudo' ? pseudoLocalize(value) : value
  return shown.replace(/\{\{\s*([^,}\s]+)[^}]*\}\}/g, (_, name: string) => vars[name] ?? '')
}

/** Run in the language under test, before the probes, for text an event writes (M6-R16). */
export type Again = (
  t: (id: string, vars?: Readonly<Record<string, string>>) => string,
) => Promise<void>
/** Called at each state: switch to the language, run `again`, probe or capture, switch back. */
export type Visit = (id: string, again?: Again) => Promise<void>

export interface WalkOptions {
  /** Stop after this many screens (the shorter walk of the other browsers). */
  readonly limit?: number
}

class Stop extends Error {}

function limited(visit: Visit, limit: number | undefined): Visit {
  let seen = 0
  return async (id, again) => {
    if (limit !== undefined && seen >= limit) throw new Stop()
    seen++
    await visit(id, again)
  }
}

async function run(walk: () => Promise<void>): Promise<void> {
  try {
    await walk()
  } catch (error) {
    if (!(error instanceof Stop)) throw error
  }
}

async function importErrors(page: Page, t: Parameters<Again>[0]): Promise<void> {
  const notices = page.getByRole('region', { name: t('app:notices.region'), exact: true })
  const dismiss = notices.getByRole('button', { name: t('app:notices.dismiss'), exact: true })
  while ((await dismiss.count()) > 0) await dismiss.first().click()
  await new AppPage(page).upload([FIXTURES.notesPdf, FIXTURES.animatedGif])
  await expect(
    page.getByRole('alert').filter({ hasText: t('errors:images.unsupportedFormat.message') }),
  ).toBeVisible()
}

/** The landing page in `lang` (English for the pseudo-locale, which the landing page has not). */
export async function landingWalk(page: Page, lang: ScreenLanguage, visit: Visit): Promise<void> {
  const path = lang === 'pseudo' || lang === 'en' ? './' : `./${lang}/`
  await page.goto(path)
  await expect(page.locator('html')).toHaveAttribute('lang', lang === 'pseudo' ? 'en' : lang)
  await visit('landing')
}

/** Every desktop screen of the set, built in English (M6-R26). */
export async function desktopWalk(
  page: Page,
  visit: Visit,
  options: WalkOptions = {},
): Promise<void> {
  const v = limited(visit, options.limit)
  const app = new AppPage(page)
  await run(async () => {
    await app.goto()
    await v('empty')
    await app.upload(PHOTOS)
    await app.expectImages(PHOTOS.length)
    await app.expectPreviewSettled()
    await app.editButton('quadrants.jpg').click()
    const edit = page.getByRole('dialog')
    await expect(app.cropArea).toBeVisible()
    await edit.getByRole('button', { name: 'More copies' }).click()
    await page.keyboard.press('Escape')
    await expect(edit).toHaveCount(0)
    await app.selectButton('portrait.jpg').click()
    await v('photos')

    await app.removeAll()
    await app.exportButton.focus()
    await expect(page.getByRole('tooltip')).toBeVisible()
    await v('export-reason')
    await page.keyboard.press('Escape')
    await app.upload(PHOTOS)
    await app.expectImages(PHOTOS.length)
    await app.expectPreviewSettled()

    await app.editButton('quadrants.jpg').click()
    await expect(app.cropArea).toBeVisible()
    await edit.getByRole('button', { name: 'More copies' }).click()
    await v('edit')
    await edit.getByRole('radio', { name: 'Fixed' }).click()
    await v('edit-fixed')
    await edit.getByRole('radio', { name: 'Auto' }).click()
    await page.keyboard.press('Escape')
    await expect(edit).toHaveCount(0)

    await app.setPaper('Custom…')
    await app.setSwitch('Gutter between images', false)
    await app.setSwitch('Bleed', true)
    await v('page')
    await app.setPaper('A4')

    await app.openStudiesTab()
    await app.setVersions(['Original', 'Blurred', 'Values', 'Blur + Values'])
    await app.expectPreviewSettled()
    await v('studies')
    await app.setVersions(['Original'])

    await app.openLinesTab()
    await app.setAllLineSwitches(true)
    await app.setGuide('face', true)
    await app.setGuide('pose', true)
    await v('lines')
    await app.setGuide('face', false)
    await app.setGuide('pose', false)
    await app.setAllLineSwitches(false)

    await app.openPresets()
    await v('presets-empty')
    await app.savePreset('A4 values')
    // The dialog's name is translated too, so text written at an event is found by role.
    const dialog = page.getByRole('dialog')
    await v('presets-saved', async (t) => {
      await dialog.getByRole('button', { name: t('presets:save.open'), exact: true }).click()
      await dialog.getByLabel(t('presets:save.name'), { exact: true }).fill('Values 2')
      await dialog.getByRole('button', { name: t('presets:save.submit'), exact: true }).click()
      await expect(dialog.getByRole('status')).toContainText('Values 2')
    })
    await app.presetAction('Rename', 'A4 values').click()
    await v('presets-rename')
    await page.keyboard.press('Escape')
    await app.presetAction('Apply', 'A4 values').click()
    const ask = page.getByRole('dialog', { name: 'Apply “A4 values”?' })
    await expect(ask).toBeVisible()
    await v('presets-apply')
    await ask.getByRole('button', { name: 'Cancel' }).click()
    await app.presetAction('Delete', 'A4 values').click()
    const del = page.getByRole('dialog', { name: /Delete/ })
    await expect(del).toBeVisible()
    await v('presets-delete')
    await del.getByRole('button', { name: 'Cancel' }).click()
    await v('presets-refused', async (t) => {
      const chooser = page.waitForEvent('filechooser')
      await dialog.getByRole('button', { name: t('presets:import.button'), exact: true }).click()
      await (await chooser).setFiles(PRESET_FIXTURES.notJson)
      await expect(dialog.getByRole('alert')).toContainText(t('presets:import.error.notPresets'))
    })
    await app.closePresets()

    const arrange = new ArrangeArea(page)
    await arrange.enter()
    await v('arrange')
    await arrange.block('portrait.jpg').focus()
    await page.keyboard.press('Enter')
    await arrange.expectAnnouncement(/picked up/i)
    await v('arrange-picked')
    await page.keyboard.press('Escape')
    await arrange.exit()

    await app.exportButton.click()
    const exp = page.getByRole('dialog')
    await expect(exp.getByRole('button', { name: /create pdf/i })).toBeVisible()
    await v('export')
    await exp.getByRole('button', { name: /create pdf/i }).click()
    await expect(exp.getByRole('link', { name: /download pdf/i })).toBeVisible({ timeout: 60_000 })
    await v('export-done')
    await page.keyboard.press('Escape')

    await v('import-errors', (t) => importErrors(page, t))
  })
}

/** Every phone step and sheet of the set, built in English (M6-R26). */
export async function phoneWalk(
  page: Page,
  visit: Visit,
  options: WalkOptions = {},
): Promise<void> {
  const v = limited(visit, options.limit)
  const app = new AppPage(page)
  await run(async () => {
    await app.goto()
    await v('empty')
    await app.upload(PHOTOS)
    await app.expectImages(PHOTOS.length)
    await v('photos')
    await app.editButton('quadrants.jpg').click()
    const sheet = page.getByRole('dialog')
    await expect(app.cropArea).toBeVisible()
    await v('edit')
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(sheet).toHaveCount(0)

    await app.goToStep('Page')
    await app.setSwitch('Gutter between images', false)
    await app.setSwitch('Bleed', true)
    await v('page')
    await app.goToStep('Studies')
    await app.setVersions(['Original', 'Values'])
    await app.setAllLineSwitches(true)
    await v('studies')
    await app.setAllLineSwitches(false)
    await app.setVersions(['Original'])

    await app.openPresets()
    await v('presets')
    await app.closePresets()

    await app.goToStep('Preview')
    await app.expectPreviewSettled()
    await v('preview')
    const arrange = new ArrangeArea(page)
    await arrange.enter()
    await arrange.block('portrait.jpg').click()
    await page.getByRole('button', { name: 'Photo options' }).click()
    await expect(sheet).toBeVisible()
    await v('arrange-sheet')
    await sheet.getByRole('button', { name: 'Done' }).click()
    await arrange.exit()

    await app.goToStep('Export')
    await v('export')
    await app.exportStep.getByRole('button', { name: /create pdf/i }).click()
    await expect(app.exportStep.getByRole('link', { name: /download pdf/i })).toBeVisible({
      timeout: 60_000,
    })
    await v('export-done')
    await app.goToStep('Images')
    await v('import-errors', (t) => importErrors(page, t))
  })
}
