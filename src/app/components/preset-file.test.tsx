import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_LINES } from '../../shared/model/lines'
import { DEFAULT_PAGE_SETUP } from '../../shared/model/page-setup'
import {
  buildPresetFile,
  MAX_PRESET_FILE_BYTES,
  presetFromSettings,
} from '../../shared/model/preset'
import { DEFAULT_STUDY } from '../../shared/model/study'
import { downloadJson, PRESET_URL_REVOKE_MS, presetFileName, readPresetFile } from './preset-file'

const preset = presetFromSettings('A4', {
  pageSetup: DEFAULT_PAGE_SETUP,
  study: DEFAULT_STUDY,
  lines: DEFAULT_LINES,
})

describe('presetFileName', () => {
  it('names the file with the local date, zero-padded', () => {
    expect(presetFileName(new Date(2026, 9, 10, 23, 59))).toBe('artistica-presets-2026-10-10.json')
    expect(presetFileName(new Date(2027, 0, 3, 0, 1))).toBe('artistica-presets-2027-01-03.json')
  })
})

describe('downloadJson', () => {
  const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:presets')
  const revokeObjectURL = vi.fn()
  beforeEach(() => {
    vi.useFakeTimers()
    createObjectURL.mockClear()
    revokeObjectURL.mockClear()
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('clicks a temporary download link for a JSON blob, then revokes the URL', async () => {
    const clicked: { download: string; href: string; connected: boolean }[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({ download: this.download, href: this.href, connected: this.isConnected })
    })
    downloadJson('artistica-presets-2026-10-10.json', '{"a":1}\n')
    expect(clicked).toEqual([
      { download: 'artistica-presets-2026-10-10.json', href: 'blob:presets', connected: true },
    ])
    expect(document.querySelector('a[download]')).toBeNull()
    const blob = createObjectURL.mock.calls[0]?.[0]
    expect(blob?.type).toBe('application/json')
    expect(await blob?.text()).toBe('{"a":1}\n')
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(PRESET_URL_REVOKE_MS)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:presets')
  })
})

describe('readPresetFile', () => {
  it('refuses a file over the size limit by its size, without reading it', async () => {
    const file = new File(['x'.repeat(MAX_PRESET_FILE_BYTES + 1)], 'big.json')
    const text = vi.spyOn(file, 'text')
    expect(await readPresetFile(file)).toEqual({ ok: false, error: 'too-large' })
    expect(text).not.toHaveBeenCalled()
  })

  it('reads a file at the limit and parses it', async () => {
    const body = buildPresetFile([preset])
    const file = new File([body.padEnd(MAX_PRESET_FILE_BYTES, ' ')], 'p.json')
    expect(file.size).toBe(MAX_PRESET_FILE_BYTES)
    expect(await readPresetFile(file)).toEqual({
      ok: true,
      presets: [preset],
      skipped: 0,
      adjusted: 0,
    })
  })

  it('reports a file that cannot be read as not a presets file', async () => {
    const file = new File(['{}'], 'p.json')
    vi.spyOn(file, 'text').mockRejectedValue(new DOMException('gone', 'NotReadableError'))
    expect(await readPresetFile(file)).toEqual({ ok: false, error: 'not-json' })
  })

  it('passes parse errors through', async () => {
    expect(await readPresetFile(new File(['nope'], 'p.json'))).toEqual({
      ok: false,
      error: 'not-json',
    })
  })
})
