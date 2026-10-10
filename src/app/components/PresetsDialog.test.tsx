import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useImages } from '../../features/images'
import { makeLoadedImage } from '../../features/images/test-utils'
import { useSettings } from '../../features/settings'
import { initI18n } from '../../shared/i18n'
import type { ImageId } from '../../shared/model/image'
import { DEFAULT_LINES } from '../../shared/model/lines'
import { DEFAULT_PAGE_SETUP } from '../../shared/model/page-setup'
import {
  buildPresetFile,
  MAX_PRESET_FILE_BYTES,
  MAX_PRESETS,
  presetFromSettings,
  type Preset,
} from '../../shared/model/preset'
import { DEFAULT_STUDY } from '../../shared/model/study'
import { stubDesktop } from '../test-utils'
import { PRESET_URL_REVOKE_MS } from './preset-file'
import { PresetsButton } from './PresetsButton'
import { TopBar } from './TopBar'

beforeAll(async () => {
  await initI18n()
})

function makePreset(name: string, over: Partial<Pick<Preset, 'pageSetup'>> = {}): Preset {
  return presetFromSettings(name, {
    pageSetup: over.pageSetup ?? DEFAULT_PAGE_SETUP,
    study: { ...DEFAULT_STUDY, versions: ['values'] },
    lines: { ...DEFAULT_LINES, thirds: true },
  })
}

const LETTER = makePreset('Letter landscape, bleed', {
  pageSetup: {
    ...DEFAULT_PAGE_SETUP,
    paper: 'Letter',
    orientation: 'landscape',
    bleed: { enabled: true, mm: 3 },
  },
})

function addPresets(...presets: Preset[]): void {
  for (const p of presets) expect(useSettings.getState().savePreset(p)).toBe('saved')
}

function loadPhotos(n: number): void {
  const images = Array.from({ length: n }, (_, i) =>
    makeLoadedImage({ id: `p${String(i)}` as ImageId, name: `secret-${String(i)}.jpg` }),
  )
  useImages.setState({ images, selectedId: images[0]?.id ?? null })
}

async function openDialog(user = userEvent.setup()) {
  render(<PresetsButton />)
  await user.click(screen.getByRole('button', { name: 'Presets' }))
  const dialog = await screen.findByRole('dialog', { name: 'Presets' })
  return { user, dialog }
}

function rowOf(name: string): HTMLElement {
  const row = screen.getByRole('list', { name: 'Saved presets' }).querySelectorAll('li')
  const match = Array.from(row).find((li) => within(li).queryByText(name) !== null)
  if (!match) throw new Error(`no row for ${name}`)
  return match
}

beforeEach(() => {
  stubDesktop(true)
  localStorage.clear()
  useSettings.getState().reset()
  useSettings.getState().setUnit('mm')
  useImages.setState({ images: [], selectedId: null, importing: 0 })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('the Presets button', () => {
  it('sits in the top bar before Export, on desktop and on the phone', () => {
    render(<TopBar onExport={vi.fn()} exportDisabledReason={null} />)
    const presets = screen.getByRole('button', { name: 'Presets' })
    const exportButton = screen.getByRole('button', { name: 'Export PDF' })
    expect(
      presets.compareDocumentPosition(exportButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    vi.unstubAllGlobals()
    stubDesktop(false)
    render(<TopBar onExport={vi.fn()} exportDisabledReason={null} />)
    expect(screen.getAllByRole('button', { name: 'Presets' })).toHaveLength(2)
  })

  it('opens the dialog "Presets", and focus returns to it on close', async () => {
    const { user } = await openDialog()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Presets' })).toHaveFocus()
  })

  it('is a bottom sheet on the phone', async () => {
    stubDesktop(false)
    const { dialog } = await openDialog()
    expect(dialog).toHaveClass('ds-sheet')
  })

  it('is a centred dialog on desktop', async () => {
    const { dialog } = await openDialog()
    expect(dialog).toHaveClass('ds-dialog')
  })
})

describe('an empty list', () => {
  it('shows the hint and the save button, and Export all is off', async () => {
    const { dialog } = await openDialog()
    expect(
      within(dialog).getByText(
        'Save your page setup, studies and lines under a name, then apply them in one go.',
      ),
    ).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'Save current settings…' })).toBeVisible()
    expect(within(dialog).queryByRole('list')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Export all' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Import…' })).toBeEnabled()
  })
})

describe('saving', () => {
  it('reveals a name field; an empty name keeps Save off with its hint', async () => {
    const { user, dialog } = await openDialog()
    await user.click(within(dialog).getByRole('button', { name: 'Save current settings…' }))
    const field = within(dialog).getByRole('textbox', { name: 'Preset name' })
    expect(field).toHaveFocus()
    expect(field).toHaveClass('ds-input')
    const save = within(dialog).getByRole('button', { name: 'Save' })
    expect(save).toHaveAttribute('aria-disabled', 'true')
    expect(save).toHaveAccessibleDescription('Give the preset a name.')
    await user.type(field, '   {Enter}')
    await user.click(save)
    expect(useSettings.getState().presets).toEqual([])
    await user.type(field, '​')
    expect(save).toHaveAttribute('aria-disabled', 'true')
  })

  it('refuses a name longer than 40 characters, counted in code points', async () => {
    const { user, dialog } = await openDialog()
    await user.click(within(dialog).getByRole('button', { name: 'Save current settings…' }))
    const field = within(dialog).getByRole('textbox', { name: 'Preset name' })
    await user.click(field)
    await user.paste('😀'.repeat(41))
    const save = within(dialog).getByRole('button', { name: 'Save' })
    expect(save).toHaveAttribute('aria-disabled', 'true')
    expect(save).toHaveAccessibleDescription('Use at most 40 characters.')
    await user.keyboard('{Backspace}{Backspace}')
    expect(save).not.toHaveAttribute('aria-disabled')
    await user.click(save)
    expect(useSettings.getState().presets.map((p) => p.name)).toEqual(['😀'.repeat(40)])
  })

  it('saves the current settings under the name, announces it and returns focus', async () => {
    useSettings.getState().setPageSetup({ paper: 'A3' })
    const { user, dialog } = await openDialog()
    await user.click(within(dialog).getByRole('button', { name: 'Save current settings…' }))
    await user.type(within(dialog).getByRole('textbox', { name: 'Preset name' }), ' Mine {Enter}')
    expect(useSettings.getState().presets.map((p) => [p.name, p.pageSetup.paper])).toEqual([
      ['Mine', 'A3'],
    ])
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('status')).toHaveTextContent('Saved Mine.')
    expect(within(dialog).getByRole('button', { name: 'Save current settings…' })).toHaveFocus()
    expect(rowOf('Mine')).toBeInTheDocument()
  })

  it('a taken name asks first: Replace it overwrites, Cancel goes back to the name', async () => {
    addPresets(makePreset('A4 value studies'))
    useSettings.getState().setPageSetup({ paper: 'A5' })
    const { user, dialog } = await openDialog()
    await user.click(within(dialog).getByRole('button', { name: 'Save current settings…' }))
    const field = within(dialog).getByRole('textbox', { name: 'Preset name' })
    await user.type(field, 'a4 VALUE studies{Enter}')
    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent('A preset with this name exists.')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(useSettings.getState().presets[0]?.pageSetup.paper).toBe('A4')

    await user.click(within(alert).getByRole('button', { name: 'Cancel' }))
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
    expect(field).toHaveFocus()
    expect(field).not.toHaveAttribute('aria-invalid')

    await user.keyboard('{Enter}')
    await user.click(
      within(await within(dialog).findByRole('alert')).getByRole('button', { name: 'Replace it' }),
    )
    expect(useSettings.getState().presets.map((p) => [p.name, p.pageSetup.paper])).toEqual([
      ['a4 VALUE studies', 'A5'],
    ])
    expect(within(dialog).getByRole('status')).toHaveTextContent('Replaced a4 VALUE studies.')
  })

  it('Cancel and Escape close the name field without closing the dialog', async () => {
    const { user, dialog } = await openDialog()
    const open = within(dialog).getByRole('button', { name: 'Save current settings…' })
    await user.click(open)
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Save current settings…' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Save current settings…' }))
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'Presets' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Save current settings…' })).toHaveFocus()
  })

  it(`with ${String(MAX_PRESETS)} presets, saving is off and says why`, async () => {
    addPresets(...Array.from({ length: MAX_PRESETS }, (_, i) => makePreset(`P${String(i)}`)))
    const { user, dialog } = await openDialog()
    const open = within(dialog).getByRole('button', { name: 'Save current settings…' })
    expect(open).toHaveAttribute('aria-disabled', 'true')
    expect(open).toHaveAccessibleDescription(
      'You have 20 presets, the most this device keeps. Delete one to save another.',
    )
    await user.click(open)
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument()
  })
})

describe('the list', () => {
  it('is a list of rows with the name, a summary and named actions', async () => {
    addPresets(makePreset('A4 value studies'), LETTER)
    const { dialog } = await openDialog()
    const list = within(dialog).getByRole('list', { name: 'Saved presets' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    const row = rowOf('A4 value studies')
    expect(row).toHaveTextContent('A4 · Auto · values 5 · thirds')
    expect(within(row).getByRole('button', { name: 'Apply A4 value studies' })).toHaveTextContent(
      'Apply',
    )
    expect(within(row).getByRole('button', { name: 'Rename A4 value studies' })).toBeVisible()
    expect(within(row).getByRole('button', { name: 'Delete A4 value studies' })).toBeVisible()
    expect(rowOf('Letter landscape, bleed')).toHaveTextContent(
      'Letter · Landscape · bleed 3 mm · values 5 · thirds',
    )
    expect(within(dialog).queryByText(/apply them in one go/)).not.toBeInTheDocument()
  })
})

describe('applying', () => {
  it('with no photos applies at once and announces it', async () => {
    addPresets(LETTER)
    const { user, dialog } = await openDialog()
    const apply = within(dialog).getByRole('button', { name: 'Apply Letter landscape, bleed' })
    await user.click(apply)
    expect(screen.queryByRole('dialog', { name: /Apply/ })).not.toBeInTheDocument()
    expect(useSettings.getState().pageSetup.paper).toBe('Letter')
    expect(within(dialog).getByRole('status')).toHaveTextContent('Applied Letter landscape, bleed.')
  })

  it('with photos loaded asks first; Cancel changes nothing, Apply applies to all of them', async () => {
    addPresets(LETTER)
    loadPhotos(6)
    const { user, dialog } = await openDialog()
    const apply = within(dialog).getByRole('button', { name: 'Apply Letter landscape, bleed' })
    await user.click(apply)
    const confirm = await screen.findByRole('dialog', {
      name: 'Apply “Letter landscape, bleed”?',
    })
    expect(confirm).toHaveTextContent(
      'It sets the page setup and the studies and lines of all 6 photos.',
    )
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Apply “/ })).not.toBeInTheDocument()
    })
    expect(apply).toHaveFocus()
    expect(useSettings.getState().pageSetup.paper).toBe('A4')

    await user.click(apply)
    await user.click(
      within(await screen.findByRole('dialog', { name: /Apply “/ })).getByRole('button', {
        name: 'Apply',
      }),
    )
    await waitFor(() => {
      expect(apply).toHaveFocus()
    })
    expect(useSettings.getState().pageSetup.paper).toBe('Letter')
    expect(useImages.getState().images.every((i) => i.study.versions.join() === 'values')).toBe(
      true,
    )
    expect(useImages.getState().images.every((i) => i.lines.thirds)).toBe(true)
    expect(within(dialog).getByRole('status')).toHaveTextContent('Applied Letter landscape, bleed.')
  })

  it('says "your photo" for a single photo', async () => {
    addPresets(LETTER)
    loadPhotos(1)
    const { user, dialog } = await openDialog()
    await user.click(within(dialog).getByRole('button', { name: 'Apply Letter landscape, bleed' }))
    expect(await screen.findByRole('dialog', { name: /Apply “/ })).toHaveTextContent(
      'It sets the page setup and the studies and lines of your photo.',
    )
  })

  it('is off while photos import, with the import-wait hint', async () => {
    addPresets(LETTER)
    useImages.setState({ importing: 1 })
    const { user, dialog } = await openDialog()
    const apply = within(dialog).getByRole('button', { name: 'Apply Letter landscape, bleed' })
    expect(apply).toHaveAttribute('aria-disabled', 'true')
    expect(apply).toHaveAccessibleDescription('Waiting for photos to finish importing…')
    await user.click(apply)
    expect(useSettings.getState().pageSetup.paper).toBe('A4')
    act(() => {
      useImages.setState({ importing: 0 })
    })
    expect(apply).not.toHaveAttribute('aria-disabled')
    expect(within(dialog).queryByText('Waiting for photos to finish importing…')).toBeNull()
  })

  it('an import that starts while the question is open refuses the apply', async () => {
    addPresets(LETTER)
    loadPhotos(2)
    const { user, dialog } = await openDialog()
    await user.click(within(dialog).getByRole('button', { name: 'Apply Letter landscape, bleed' }))
    const confirm = await screen.findByRole('dialog', { name: /Apply “/ })
    act(() => {
      useImages.setState({ importing: 1 })
    })
    await user.click(within(confirm).getByRole('button', { name: 'Apply' }))
    expect(useSettings.getState().pageSetup.paper).toBe('A4')
    expect(within(dialog).getByRole('status')).toHaveTextContent('')
  })
})

describe('deleting', () => {
  it('asks with the name and Cancel/Delete; then focus moves to the next row’s Apply', async () => {
    addPresets(makePreset('One'), makePreset('Two'), makePreset('Three'))
    const { user, dialog } = await openDialog()
    await user.click(within(dialog).getByRole('button', { name: 'Delete One' }))
    const confirm = await screen.findByRole('dialog', { name: 'Delete “One”?' })
    expect(within(confirm).getByRole('button', { name: 'Cancel' })).toBeVisible()
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: 'Delete One' })).toHaveFocus()
    })
    expect(useSettings.getState().presets).toHaveLength(3)

    await user.click(within(dialog).getByRole('button', { name: 'Delete One' }))
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Delete “One”?' })).getByRole('button', {
        name: 'Delete',
      }),
    )
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: 'Apply Two' })).toHaveFocus()
    })
    expect(useSettings.getState().presets.map((p) => p.name)).toEqual(['Two', 'Three'])
    expect(within(dialog).getByRole('status')).toHaveTextContent('Deleted One.')
  })

  it('moves focus to "Save current settings…" when the last row goes', async () => {
    addPresets(makePreset('One'), makePreset('Two'))
    const { user, dialog } = await openDialog()
    await user.click(within(dialog).getByRole('button', { name: 'Delete Two' }))
    await user.click(
      within(await screen.findByRole('dialog', { name: /Delete “/ })).getByRole('button', {
        name: 'Delete',
      }),
    )
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: 'Save current settings…' })).toHaveFocus()
    })
  })

  it('Escape in the question closes only the question', async () => {
    addPresets(makePreset('One'))
    const { user, dialog } = await openDialog()
    await user.click(within(dialog).getByRole('button', { name: 'Delete One' }))
    await screen.findByRole('dialog', { name: /Delete “/ })
    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Delete “/ })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('dialog', { name: 'Presets' })).toBeInTheDocument()
    expect(useSettings.getState().presets).toHaveLength(1)
  })
})

describe('renaming', () => {
  it('turns the name into a field in place; Enter commits and focus returns to Rename', async () => {
    addPresets(makePreset('A4 value studies'), makePreset('Other'))
    const { user, dialog } = await openDialog()
    await user.click(within(dialog).getByRole('button', { name: 'Rename A4 value studies' }))
    const field = within(dialog).getByRole('textbox', { name: 'New name for A4 value studies' })
    expect(field).toHaveValue('A4 value studies')
    expect(field).toHaveFocus()
    await user.clear(field)
    await user.type(field, 'A4 values, 7 tones{Enter}')
    expect(useSettings.getState().presets.map((p) => p.name)).toEqual([
      'A4 values, 7 tones',
      'Other',
    ])
    expect(within(dialog).getByRole('button', { name: 'Rename A4 values, 7 tones' })).toHaveFocus()
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      'Renamed A4 value studies to A4 values, 7 tones.',
    )
  })

  it('Escape cancels without closing the dialog', async () => {
    addPresets(makePreset('One'))
    const { user, dialog } = await openDialog()
    await user.click(within(dialog).getByRole('button', { name: 'Rename One' }))
    await user.type(within(dialog).getByRole('textbox', { name: 'New name for One' }), 'x')
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'Presets' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Rename One' })).toHaveFocus()
    expect(useSettings.getState().presets.map((p) => p.name)).toEqual(['One'])
  })

  it('refuses a name another preset has, and an empty name', async () => {
    addPresets(makePreset('One'), makePreset('Two'))
    const { user, dialog } = await openDialog()
    await user.click(within(dialog).getByRole('button', { name: 'Rename One' }))
    const field = within(dialog).getByRole('textbox', { name: 'New name for One' })
    await user.clear(field)
    const save = within(dialog).getByRole('button', { name: 'Save' })
    expect(save).toHaveAttribute('aria-disabled', 'true')
    expect(save).toHaveAccessibleDescription('Give the preset a name.')
    await user.type(field, 'two{Enter}')
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'A preset with this name exists.',
    )
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(useSettings.getState().presets.map((p) => p.name)).toEqual(['One', 'Two'])
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(within(dialog).getByRole('button', { name: 'Rename One' })).toHaveFocus()
  })
})

describe('Export all', () => {
  it('downloads every preset as artistica-presets-<local date>.json and revokes the URL', async () => {
    addPresets(makePreset('One'), LETTER)
    loadPhotos(2)
    const blobs: Blob[] = []
    URL.createObjectURL = vi.fn((b: Blob) => {
      blobs.push(b)
      return 'blob:presets'
    })
    const revoke = vi.fn()
    URL.revokeObjectURL = revoke
    const downloads: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.download)
    })
    const { dialog } = await openDialog()
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] })
    vi.setSystemTime(new Date(2026, 9, 10, 23, 30))
    within(dialog).getByRole('button', { name: 'Export all' }).click()
    expect(downloads).toEqual(['artistica-presets-2026-10-10.json'])
    expect(blobs[0]?.type).toBe('application/json')
    const text = (await blobs[0]?.text()) ?? ''
    expect(text).toBe(buildPresetFile(useSettings.getState().presets))
    expect(text).not.toContain('secret-')
    vi.advanceTimersByTime(PRESET_URL_REVOKE_MS)
    expect(revoke).toHaveBeenCalledWith('blob:presets')
  })
})

describe('Import', () => {
  function fileInput(dialog: HTMLElement): HTMLInputElement {
    const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')
    if (!input) throw new Error('no file input')
    return input
  }

  it('opens a hidden .json file chooser that is not the photo dropzone', async () => {
    const { user, dialog } = await openDialog()
    const input = fileInput(dialog)
    expect(input).toHaveAttribute('accept', '.json,application/json')
    expect(input).not.toBeVisible()
    expect(input.multiple).toBe(false)
    const click = vi.spyOn(input, 'click')
    await user.click(within(dialog).getByRole('button', { name: 'Import…' }))
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('imports, renames clashes and reports the result; never fetches or adds a photo', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    addPresets(makePreset('A4'))
    const text = buildPresetFile([makePreset('A4'), makePreset('B'), makePreset('C')])
    const { user, dialog } = await openDialog()
    await user.upload(fileInput(dialog), new File([text], 'p.json', { type: 'application/json' }))
    const status = within(dialog).getByRole('status')
    await waitFor(() => {
      expect(status).toHaveTextContent('Imported 3 presets.')
    })
    expect(status).toHaveTextContent('1 was renamed: A4 → A4 (2).')
    expect(useSettings.getState().presets.map((p) => p.name)).toEqual(['A4', 'A4 (2)', 'B', 'C'])
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(useImages.getState().images).toEqual([])
    expect(fileInput(dialog).value).toBe('')
  })

  it('reports skipped and adjusted presets', async () => {
    const good = JSON.parse(buildPresetFile([makePreset('A'), makePreset('B')])) as {
      presets: Record<string, unknown>[]
    }
    const [a, b] = good.presets
    const raw = {
      format: 'artistica-presets',
      version: 1,
      presets: [
        a,
        { ...b, study: { ...(b?.study as object), blurPct: 900 } },
        { name: 'broken' },
        { pageSetup: {} },
      ],
    }
    const { user, dialog } = await openDialog()
    await user.upload(fileInput(dialog), new File([JSON.stringify(raw)], 'p.json'))
    const status = within(dialog).getByRole('status')
    await waitFor(() => {
      expect(status).toHaveTextContent('Imported 2 presets.')
    })
    expect(status).toHaveTextContent("2 were skipped: they weren't valid.")
    expect(status).toHaveTextContent('1 preset had a value out of range, which was adjusted.')
  })

  it('reports presets that did not fit under the device limit', async () => {
    addPresets(...Array.from({ length: MAX_PRESETS - 1 }, (_, i) => makePreset(`P${String(i)}`)))
    const { user, dialog } = await openDialog()
    await user.upload(
      fileInput(dialog),
      new File([buildPresetFile([makePreset('X'), makePreset('Y'), makePreset('Z')])], 'p.json'),
    )
    const status = within(dialog).getByRole('status')
    await waitFor(() => {
      expect(status).toHaveTextContent('Imported 1 preset.')
    })
    expect(status).toHaveTextContent("2 weren't added: this device keeps at most 20 presets.")
  })

  it.each([
    [
      'too large',
      new File(['x'.repeat(MAX_PRESET_FILE_BYTES + 1)], 'big.json'),
      'This file is too large to be a presets file.',
    ],
    ['not JSON', new File(['nope'], 'p.json'), "This file isn't a presets file from Artistica."],
    [
      'a settings envelope',
      new File([JSON.stringify({ state: {}, version: 5 })], 'p.json'),
      "This file isn't a presets file from Artistica.",
    ],
    [
      'a newer version',
      new File(
        [JSON.stringify({ format: 'artistica-presets', version: 2, presets: [] })],
        'p.json',
      ),
      'This file was made by a newer version of Artistica. Update the page and try again.',
    ],
    [
      'empty',
      new File(
        [JSON.stringify({ format: 'artistica-presets', version: 1, presets: [] })],
        'p.json',
      ),
      'No presets were found in this file.',
    ],
  ])('refuses a file that is %s with an alert', async (_label, file, message) => {
    const { user, dialog } = await openDialog()
    await user.upload(fileInput(dialog), file)
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message)
    expect(useSettings.getState().presets).toEqual([])
  })

  it('a later success clears an earlier error', async () => {
    const { user, dialog } = await openDialog()
    await user.upload(fileInput(dialog), new File(['nope'], 'p.json'))
    await within(dialog).findByRole('alert')
    await user.upload(fileInput(dialog), new File([buildPresetFile([makePreset('A')])], 'p.json'))
    await waitFor(() => {
      expect(within(dialog).getByRole('status')).toHaveTextContent('Imported 1 preset.')
    })
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('reopening', () => {
  it('starts clean: no open field and no old message', async () => {
    addPresets(makePreset('One'))
    const { user, dialog } = await openDialog()
    await user.click(within(dialog).getByRole('button', { name: 'Apply One' }))
    await user.click(within(dialog).getByRole('button', { name: 'Rename One' }))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await user.click(screen.getByRole('button', { name: 'Presets' }))
    const again = await screen.findByRole('dialog', { name: 'Presets' })
    expect(within(again).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(again).getByRole('status')).toHaveTextContent('')
  })
})
