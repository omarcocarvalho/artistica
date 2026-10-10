import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useImages } from '../../features/images'
import { makeLoadedImage } from '../../features/images/test-utils'
import { useSettings } from '../../features/settings'
import type { ImageId } from '../../shared/model/image'
import { DEFAULT_LINES } from '../../shared/model/lines'
import { DEFAULT_STUDY } from '../../shared/model/study'
import { LineDefaultsEffect } from './LineDefaultsEffect'
import { StudyDefaultsEffect } from './StudyDefaultsEffect'

const A = 'a' as ImageId
const B = 'b' as ImageId

beforeEach(() => {
  localStorage.clear()
  useSettings.getState().reset()
  useImages.setState({
    images: [makeLoadedImage({ id: A, name: 'a.jpg' }), makeLoadedImage({ id: B, name: 'b.jpg' })],
    selectedId: A,
  })
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('StudyDefaultsEffect', () => {
  describe('session defaults from a preset (M5-R6)', () => {
    const PRESET_STUDY = {
      versions: ['original', 'values'] as const,
      blurPct: 25,
      values: { count: 4, hue: 230, neutral: false },
    }

    it('does not overwrite a session default in the same update', () => {
      render(<StudyDefaultsEffect />)
      act(() => {
        useSettings.getState().setStudyDefaults({ blurPct: 25, values: PRESET_STUDY.values })
        useImages
          .getState()
          .setDefaultStudy(
            { ...PRESET_STUDY, versions: [...PRESET_STUDY.versions] },
            { session: true },
          )
      })
      expect(useImages.getState().getDefaults()).toMatchObject({
        study: PRESET_STUDY,
        sessionStudy: true,
      })
    })

    it('a change to other study defaults replaces it, Original only', () => {
      render(<StudyDefaultsEffect />)
      act(() => {
        useSettings.getState().setStudyDefaults({ blurPct: 25, values: PRESET_STUDY.values })
        useImages
          .getState()
          .setDefaultStudy(
            { ...PRESET_STUDY, versions: [...PRESET_STUDY.versions] },
            { session: true },
          )
      })
      act(() => {
        useSettings.getState().setStudyDefaults({ blurPct: 26, values: PRESET_STUDY.values })
      })
      expect(useImages.getState().getDefaults()).toMatchObject({
        study: { versions: ['original'], blurPct: 26, values: PRESET_STUDY.values },
        sessionStudy: false,
      })
    })
  })

  it('hands the saved defaults to the images store on start, with Original only (owner Q1/Q5, default)', () => {
    useSettings
      .getState()
      .setStudyDefaults({ blurPct: 70, values: { count: 9, hue: 195, neutral: false } })
    const spy = vi.spyOn(useImages.getState(), 'setDefaultStudy')
    render(<StudyDefaultsEffect />)
    expect(spy).toHaveBeenLastCalledWith({
      versions: ['original'],
      blurPct: 70,
      values: { count: 9, hue: 195, neutral: false },
    })
  })

  it('writes defaults only when the selected image’s blur or values change (owner Q5, default)', () => {
    render(<StudyDefaultsEffect />)
    const set = vi.spyOn(useSettings.getState(), 'setStudyDefaults')
    act(() => {
      useImages.getState().updateStudy(A, { versions: ['original', 'blurred'] })
    })
    expect(set).not.toHaveBeenCalled()
    act(() => {
      useImages.getState().updateStudy(A, { blurPct: 63 })
    })
    expect(set).toHaveBeenLastCalledWith({ blurPct: 63, values: DEFAULT_STUDY.values })
    act(() => {
      useImages.getState().updateStudy(A, { values: { neutral: true } })
    })
    expect(set).toHaveBeenLastCalledWith({
      blurPct: 63,
      values: { ...DEFAULT_STUDY.values, neutral: true },
    })
    act(() => {
      useImages.getState().updateStudy(B, { blurPct: 12 })
    })
    act(() => {
      useImages.getState().select(B)
    })
    act(() => {
      useImages.getState().select(null)
    })
    expect(set).toHaveBeenCalledTimes(2)
  })

  it('compares the newly selected image with its own earlier state when the selection and images change together', () => {
    useImages.getState().updateStudy(B, { blurPct: 12 })
    render(<StudyDefaultsEffect />)
    const set = vi.spyOn(useSettings.getState(), 'setStudyDefaults')
    act(() => {
      useImages.setState((s) => ({ images: s.images.filter((i) => i.id !== A), selectedId: B }))
    })
    expect(set).not.toHaveBeenCalled()
    expect(useSettings.getState().studyDefaults.blurPct).toBe(DEFAULT_STUDY.blurPct)
  })

  it('images imported after a change start with the new parameters and Original only', () => {
    const spy = vi.spyOn(useImages.getState(), 'setDefaultStudy')
    render(<StudyDefaultsEffect />)
    act(() => {
      useImages
        .getState()
        .updateStudy(A, { versions: ['original', 'values'], values: { count: 3 } })
    })
    expect(spy).toHaveBeenLastCalledWith({
      versions: ['original'],
      blurPct: DEFAULT_STUDY.blurPct,
      values: { ...DEFAULT_STUDY.values, count: 3 },
    })
  })

  it('"Apply to all" makes the applied study the defaults, versions excepted (owner M2-1)', () => {
    const spy = vi.spyOn(useImages.getState(), 'setDefaultStudy')
    render(<StudyDefaultsEffect />)
    act(() => {
      useImages.getState().updateStudy(A, { blurPct: 30 })
    })
    useImages.setState((s) => ({
      images: s.images.map((i) =>
        i.id === B
          ? {
              ...i,
              study: {
                versions: ['original', 'blurred'],
                blurPct: 70,
                values: { count: 7, hue: 120, neutral: true },
              },
            }
          : i,
      ),
    }))
    act(() => {
      useImages.getState().select(B)
    })
    expect(useSettings.getState().studyDefaults.blurPct).toBe(30)
    act(() => {
      useImages.getState().applyStudyToAll(B)
    })
    expect(useSettings.getState().studyDefaults).toEqual({
      blurPct: 70,
      values: { count: 7, hue: 120, neutral: true },
    })
    expect(spy).toHaveBeenLastCalledWith({
      versions: ['original'],
      blurPct: 70,
      values: { count: 7, hue: 120, neutral: true },
    })
  })

  it('"Apply to all" leaves the line defaults alone (owner Q8)', () => {
    render(
      <>
        <StudyDefaultsEffect />
        <LineDefaultsEffect />
      </>,
    )
    useImages.getState().updateLines(B, {
      thirds: true,
      style: { colour: '#1f3fbf', widthMm: 1.5, opacityPct: 60 },
    })
    useImages.getState().updateStudy(B, { blurPct: 70 })
    const lineDefaults = useSettings.getState().lineDefaults
    const setLineDefaults = vi.spyOn(useSettings.getState(), 'setLineDefaults')
    const setItem = vi.spyOn(localStorage, 'setItem')
    act(() => {
      useImages.getState().applyStudyToAll(B)
    })
    expect(useSettings.getState().studyDefaults.blurPct).toBe(70)
    expect(useSettings.getState().lineDefaults).toBe(lineDefaults)
    expect(setLineDefaults).not.toHaveBeenCalled()
    expect(setItem).toHaveBeenCalledTimes(1)
    expect(useImages.getState().images.find((i) => i.id === A)?.lines).toEqual(DEFAULT_LINES)
  })

  it('an apply that changes no image still counts as last used (owner M2-1)', () => {
    useImages.setState((s) => ({
      images: s.images.map((i) => ({ ...i, study: { ...i.study, blurPct: 70 } })),
      selectedId: B,
    }))
    useSettings.getState().setStudyDefaults({ blurPct: 30, values: DEFAULT_STUDY.values })
    render(<StudyDefaultsEffect />)
    act(() => {
      expect(useImages.getState().applyStudyToAll(B)).toBe(0)
    })
    expect(useSettings.getState().studyDefaults.blurPct).toBe(70)
  })

  it('keeps writing nothing image-derived: only numbers reach the settings', () => {
    render(<StudyDefaultsEffect />)
    act(() => {
      useImages.getState().updateStudy(A, { values: { hue: 300 } })
    })
    expect(Object.keys(useSettings.getState().studyDefaults).sort()).toEqual(['blurPct', 'values'])
    expect(useSettings.getState().studyDefaults.values.hue).toBe(300)
  })

  it('stops listening once unmounted', () => {
    const { unmount } = render(<StudyDefaultsEffect />)
    unmount()
    act(() => {
      useImages.getState().updateStudy(A, { blurPct: 90 })
    })
    expect(useSettings.getState().studyDefaults.blurPct).toBe(DEFAULT_STUDY.blurPct)
  })
})
