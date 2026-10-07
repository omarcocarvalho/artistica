import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useImages } from '../../features/images'
import { makeLoadedImage } from '../../features/images/test-utils'
import { useSettings } from '../../features/settings'
import type { ImageId } from '../../shared/model/image'
import { DEFAULT_STUDY } from '../../shared/model/study'
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
