import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useImages } from '../features/images'
import { makeLoadedImage } from '../features/images/test-utils'
import { useSettings } from '../features/settings'
import type { ImageId } from '../shared/model/image'
import { DEFAULT_LINES, withoutLineTypes, type LineSettings } from '../shared/model/lines'
import { DEFAULT_PAGE_SETUP, type PageSetup } from '../shared/model/page-setup'
import { presetFromSettings, type Preset } from '../shared/model/preset'
import { DEFAULT_STUDY, type StudySettings } from '../shared/model/study'
import { LineDefaultsEffect } from './effects/LineDefaultsEffect'
import { StudyDefaultsEffect } from './effects/StudyDefaultsEffect'
import { applyPreset, presetFromCurrent } from './presets'

const A = 'a' as ImageId
const B = 'b' as ImageId

const pageSetup: PageSetup = {
  ...DEFAULT_PAGE_SETUP,
  paper: 'Letter',
  orientation: 'landscape',
  bleed: { enabled: true, mm: 3 },
}
const study: StudySettings = {
  versions: ['original', 'values'],
  blurPct: 25,
  values: { count: 4, hue: 230, neutral: false },
}
const lines: LineSettings = {
  ...DEFAULT_LINES,
  thirds: true,
  style: { colour: '#1f3fbf', widthMm: 0.5, opacityPct: 60 },
}
const preset: Preset = presetFromSettings('A4 value studies', { pageSetup, study, lines })

function loadPhotos(): void {
  useImages.setState({
    images: [makeLoadedImage({ id: A, name: 'a.jpg' }), makeLoadedImage({ id: B, name: 'b.jpg' })],
    selectedId: A,
  })
}

function mountEffects() {
  return render(
    <>
      <StudyDefaultsEffect />
      <LineDefaultsEffect />
    </>,
  )
}

beforeEach(() => {
  localStorage.clear()
  useSettings.getState().reset()
  useImages.setState({ images: [], selectedId: null, importing: 0 })
  useImages.getState().setDefaultStudy(DEFAULT_STUDY)
  useImages.getState().setDefaultLines(DEFAULT_LINES)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('presetFromCurrent (M5-R2)', () => {
  it('reads the page setup and the selected photo’s study and lines, with guides off', () => {
    loadPhotos()
    useSettings.getState().setPageSetup(pageSetup)
    useImages.getState().updateStudy(A, study)
    useImages.getState().updateLines(A, { ...lines, face: true, edges: { on: true } })
    useImages.getState().updateStudy(B, { blurPct: 90 })
    const p = presetFromCurrent('  Mine ')
    expect(p).toEqual(presetFromSettings('Mine', { pageSetup, study, lines }))
    expect(p.name).toBe('Mine')
    expect(p.lines.face).toBe(false)
    expect(p.lines.edges.on).toBe(false)
  })

  it('reads the images store’s defaults when no photo is selected', () => {
    loadPhotos()
    useImages.getState().updateStudy(A, { blurPct: 90 })
    useImages.setState({ selectedId: null })
    useImages.getState().setDefaultStudy(study, { session: true })
    useImages.getState().setDefaultLines(lines)
    const p = presetFromCurrent('Defaults')
    expect(p.study).toEqual(study)
    expect(p.lines).toEqual(lines)
    expect(p.pageSetup).toEqual(DEFAULT_PAGE_SETUP)
  })

  it('holds only the whitelisted keys', () => {
    loadPhotos()
    expect(Object.keys(presetFromCurrent('P')).sort()).toEqual([
      'lines',
      'name',
      'pageSetup',
      'study',
    ])
  })
})

describe('applyPreset (M5-R6)', () => {
  it('runs in order: page setup, remembered defaults, session defaults, then apply to all', () => {
    loadPhotos()
    const settings = useSettings.getState()
    const images = useImages.getState()
    const spies = {
      setPageSetup: vi.spyOn(settings, 'setPageSetup'),
      setStudyDefaults: vi.spyOn(settings, 'setStudyDefaults'),
      setLineDefaults: vi.spyOn(settings, 'setLineDefaults'),
      setDefaultStudy: vi.spyOn(images, 'setDefaultStudy'),
      setDefaultLines: vi.spyOn(images, 'setDefaultLines'),
      applyStudyToAll: vi.spyOn(images, 'applyStudyToAll'),
      applyLinesToAll: vi.spyOn(images, 'applyLinesToAll'),
    }
    expect(applyPreset(preset)).toBe('applied')
    const order = Object.entries(spies)
      .flatMap(([name, spy]) => spy.mock.invocationCallOrder.map((at) => ({ name, at })))
      .sort((a, b) => a.at - b.at)
      .map((c) => c.name)
    expect(order).toEqual(Object.keys(spies))
    expect(spies.setPageSetup).toHaveBeenCalledWith(preset.pageSetup)
    expect(spies.setStudyDefaults).toHaveBeenCalledWith({ blurPct: 25, values: study.values })
    expect(spies.setLineDefaults).toHaveBeenCalledWith(preset.lines)
    expect(spies.setDefaultStudy).toHaveBeenCalledWith(preset.study, { session: true })
    expect(spies.setDefaultLines).toHaveBeenCalledWith(preset.lines, { session: true })
  })

  it('sets the page setup, the remembered defaults without versions or types, and every photo', () => {
    loadPhotos()
    useImages.getState().updateLines(B, { face: true, grid: { on: true } })
    applyPreset(preset)
    const s = useSettings.getState()
    expect(s.pageSetup).toEqual(preset.pageSetup)
    expect(s.studyDefaults).toEqual({ blurPct: 25, values: study.values })
    expect(s.lineDefaults).toEqual(withoutLineTypes(preset.lines))
    for (const img of useImages.getState().images) {
      expect(img.study).toEqual(preset.study)
      expect(img.lines).toEqual(preset.lines)
    }
  })

  it('applies from the first photo when none is selected', () => {
    loadPhotos()
    useImages.setState({ selectedId: null })
    applyPreset(preset)
    expect(useImages.getState().images.map((i) => i.study)).toEqual([preset.study, preset.study])
  })

  it('with no photos it applies nothing to all and leaves the session defaults', () => {
    const apply = vi.spyOn(useImages.getState(), 'applyStudyToAll')
    expect(applyPreset(preset)).toBe('applied')
    expect(apply).not.toHaveBeenCalled()
    expect(useImages.getState().getDefaults()).toEqual({
      study: preset.study,
      lines: preset.lines,
      sessionStudy: true,
      sessionLines: true,
    })
  })

  it('a photo added later starts with the preset’s versions and line types: the effects keep the session default', () => {
    mountEffects()
    act(() => {
      applyPreset(preset)
    })
    expect(useSettings.getState().studyDefaults.blurPct).toBe(25)
    expect(useImages.getState().getDefaults()).toEqual({
      study: preset.study,
      lines: preset.lines,
      sessionStudy: true,
      sessionLines: true,
    })
  })

  it('keeps the session default with photos loaded too', () => {
    loadPhotos()
    mountEffects()
    act(() => {
      applyPreset(preset)
    })
    expect(useImages.getState().getDefaults()).toMatchObject({
      study: preset.study,
      lines: preset.lines,
      sessionStudy: true,
      sessionLines: true,
    })
  })

  it('keeps the session default when the remembered defaults were already the preset’s', () => {
    useSettings.getState().setStudyDefaults({ blurPct: 25, values: study.values })
    useSettings.getState().setLineDefaults(lines)
    mountEffects()
    act(() => {
      applyPreset(preset)
    })
    expect(useImages.getState().getDefaults()).toMatchObject({
      sessionStudy: true,
      sessionLines: true,
    })
  })

  it('a later change of the study defaults from the Studies tab ends the session study default', () => {
    loadPhotos()
    mountEffects()
    act(() => {
      applyPreset(preset)
    })
    act(() => {
      useImages.getState().updateStudy(A, { blurPct: 12 })
    })
    expect(useImages.getState().getDefaults()).toMatchObject({
      study: { versions: ['original'], blurPct: 12, values: study.values },
      sessionStudy: false,
      sessionLines: true,
    })
  })

  it('a later change of the line defaults ends the session lines default', () => {
    loadPhotos()
    mountEffects()
    act(() => {
      applyPreset(preset)
    })
    act(() => {
      useImages.getState().updateLines(A, { style: { opacityPct: 30 } })
    })
    const d = useImages.getState().getDefaults()
    expect(d.sessionLines).toBe(false)
    expect(d.sessionStudy).toBe(true)
    expect(d.lines).toEqual(
      withoutLineTypes({ ...preset.lines, style: { ...preset.lines.style, opacityPct: 30 } }),
    )
  })

  it('is refused while a photo is importing, and changes nothing', () => {
    loadPhotos()
    useImages.setState({ importing: 1 })
    const before = { settings: useSettings.getState(), images: useImages.getState().images }
    expect(applyPreset(preset)).toBe('importing')
    expect(useSettings.getState()).toBe(before.settings)
    expect(useImages.getState().images).toBe(before.images)
    expect(useImages.getState().getDefaults().sessionStudy).toBe(false)
  })

  it('never touches unit, theme or language', () => {
    useSettings.getState().setUnit('in')
    useSettings.getState().setTheme('dark')
    useSettings.getState().setLanguage('ja')
    loadPhotos()
    applyPreset(preset)
    expect(useSettings.getState()).toMatchObject({ unit: 'in', theme: 'dark', language: 'ja' })
  })
})
