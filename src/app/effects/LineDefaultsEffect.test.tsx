import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useImages } from '../../features/images'
import { makeLoadedImage } from '../../features/images/test-utils'
import { useSettings } from '../../features/settings'
import type { ImageId } from '../../shared/model/image'
import { DEFAULT_LINES, type LineSettings } from '../../shared/model/lines'
import { DEFAULT_STUDY } from '../../shared/model/study'
import { LineDefaultsEffect } from './LineDefaultsEffect'
import { StudyDefaultsEffect } from './StudyDefaultsEffect'

const A = 'a' as ImageId
const B = 'b' as ImageId
const STYLE = { colour: '#1f3fbf', widthMm: 1.5, opacityPct: 60 }

beforeEach(() => {
  localStorage.clear()
  useSettings.getState().reset()
  useImages.setState({
    images: [makeLoadedImage({ id: A, name: 'a.jpg' }), makeLoadedImage({ id: B, name: 'b.jpg' })],
    selectedId: A,
    appliedLines: null,
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  useSettings.setState(useSettings.getInitialState(), true)
  useImages.setState(useImages.getInitialState(), true)
})

describe('LineDefaultsEffect', () => {
  describe('session defaults from a preset (M5-R6)', () => {
    const THIRDS: LineSettings = { ...DEFAULT_LINES, thirds: true, style: STYLE }

    it('does not overwrite a session default in the same update', () => {
      render(<LineDefaultsEffect />)
      act(() => {
        useSettings.getState().setLineDefaults(THIRDS)
        useImages.getState().setDefaultLines(THIRDS, { session: true })
      })
      expect(useImages.getState().getDefaults()).toMatchObject({
        lines: THIRDS,
        sessionLines: true,
      })
    })

    it('a change to other line defaults replaces it, every type off', () => {
      render(<LineDefaultsEffect />)
      act(() => {
        useSettings.getState().setLineDefaults(THIRDS)
        useImages.getState().setDefaultLines(THIRDS, { session: true })
      })
      act(() => {
        useSettings.getState().setLineDefaults({ ...THIRDS, style: { ...STYLE, opacityPct: 30 } })
      })
      expect(useImages.getState().getDefaults()).toMatchObject({
        lines: { ...DEFAULT_LINES, style: { ...STYLE, opacityPct: 30 } },
        sessionLines: false,
      })
    })
  })

  it('hands the saved defaults to the images store on start, every type off (owner Q7, default)', () => {
    useSettings.getState().setLineDefaults({
      ...DEFAULT_LINES,
      thirds: true,
      grid: { on: true, cols: 3, rows: 3 },
      style: STYLE,
    })
    const spy = vi.spyOn(useImages.getState(), 'setDefaultLines')
    render(<LineDefaultsEffect />)
    expect(spy).toHaveBeenLastCalledWith({
      ...DEFAULT_LINES,
      grid: { on: false, cols: 3, rows: 3 },
      style: STYLE,
    })
  })

  it('remembers the selected image’s style, grid size and corner, never its types (owner Q7, default)', () => {
    const spy = vi.spyOn(useImages.getState(), 'setDefaultLines')
    render(<LineDefaultsEffect />)
    act(() => {
      useImages.getState().updateLines(A, { thirds: true, centre: true })
    })
    expect(useSettings.getState().lineDefaults).toEqual(DEFAULT_LINES)
    act(() => {
      useImages.getState().updateLines(A, {
        style: STYLE,
        grid: { cols: 6 },
        spiral: { corner: 'bottomRight' },
      })
    })
    const expected: LineSettings = {
      ...DEFAULT_LINES,
      grid: { on: false, cols: 6, rows: DEFAULT_LINES.grid.rows },
      spiral: { on: false, corner: 'bottomRight' },
      style: STYLE,
    }
    expect(useSettings.getState().lineDefaults).toEqual(expected)
    expect(spy).toHaveBeenLastCalledWith(expected)
  })

  it('a type toggle alone writes nothing to storage (setLineDefaults is a no-op on equal values)', () => {
    render(<LineDefaultsEffect />)
    const before = useSettings.getState().lineDefaults
    const setItem = vi.spyOn(localStorage, 'setItem')
    act(() => {
      useImages.getState().updateLines(A, { golden: true })
    })
    expect(useSettings.getState().lineDefaults).toBe(before)
    expect(setItem).not.toHaveBeenCalled()
  })

  it('ignores edits to an image that is not selected, and selection changes', () => {
    render(<LineDefaultsEffect />)
    const set = vi.spyOn(useSettings.getState(), 'setLineDefaults')
    act(() => {
      useImages.getState().updateLines(B, { style: STYLE })
    })
    act(() => {
      useImages.getState().select(B)
    })
    act(() => {
      useImages.getState().select(null)
    })
    act(() => {
      useImages.getState().updateLines(B, { style: { opacityPct: 20 } })
    })
    expect(set).not.toHaveBeenCalled()
    expect(useSettings.getState().lineDefaults).toEqual(DEFAULT_LINES)
  })

  it('compares the newly selected image with its own earlier state when the selection and images change together', () => {
    useImages.getState().updateLines(B, { style: STYLE })
    render(<LineDefaultsEffect />)
    const set = vi.spyOn(useSettings.getState(), 'setLineDefaults')
    act(() => {
      useImages.setState((s) => ({ images: s.images.filter((i) => i.id !== A), selectedId: B }))
    })
    expect(set).not.toHaveBeenCalled()
    expect(useSettings.getState().lineDefaults).toEqual(DEFAULT_LINES)
  })

  it('"Apply lines to all" makes the applied lines the defaults, types excepted (owner Q7, default)', () => {
    render(<LineDefaultsEffect />)
    useImages.getState().updateLines(B, { thirds: true, style: STYLE })
    act(() => {
      useImages.getState().applyLinesToAll(B)
    })
    expect(useSettings.getState().lineDefaults).toEqual({ ...DEFAULT_LINES, style: STYLE })
  })

  it('an apply that also changes the selected image writes the defaults once', () => {
    render(<LineDefaultsEffect />)
    useImages.getState().updateLines(B, { thirds: true, style: STYLE })
    const set = vi.spyOn(useSettings.getState(), 'setLineDefaults')
    act(() => {
      useImages.getState().applyLinesToAll(B)
    })
    expect(useImages.getState().images.find((i) => i.id === A)?.lines.style).toEqual(STYLE)
    expect(set).toHaveBeenCalledTimes(1)
  })

  it('a newly added image that becomes selected writes nothing', () => {
    render(<LineDefaultsEffect />)
    const set = vi.spyOn(useSettings.getState(), 'setLineDefaults')
    const C = 'c' as ImageId
    act(() => {
      useImages.setState((s) => ({
        images: [
          ...s.images,
          {
            ...makeLoadedImage({ id: C, name: 'c.jpg' }),
            lines: { ...DEFAULT_LINES, style: STYLE },
          },
        ],
        selectedId: C,
      }))
    })
    expect(set).not.toHaveBeenCalled()
    expect(useSettings.getState().lineDefaults).toEqual(DEFAULT_LINES)
  })

  it('"Apply lines to all" leaves the study defaults alone (owner Q8)', () => {
    render(
      <>
        <LineDefaultsEffect />
        <StudyDefaultsEffect />
      </>,
    )
    useImages.getState().updateStudy(B, { blurPct: 70, values: { count: 7 } })
    useImages.getState().updateLines(B, { thirds: true, style: STYLE })
    const studyDefaults = useSettings.getState().studyDefaults
    const setStudyDefaults = vi.spyOn(useSettings.getState(), 'setStudyDefaults')
    const setItem = vi.spyOn(localStorage, 'setItem')
    act(() => {
      useImages.getState().applyLinesToAll(B)
    })
    expect(useSettings.getState().lineDefaults.style).toEqual(STYLE)
    expect(useSettings.getState().studyDefaults).toBe(studyDefaults)
    expect(setStudyDefaults).not.toHaveBeenCalled()
    expect(setItem).toHaveBeenCalledTimes(1)
    expect(useImages.getState().images.find((i) => i.id === A)?.study).toEqual(DEFAULT_STUDY)
  })

  it('an apply that changes no image still counts as last used', () => {
    useImages.setState((s) => ({
      images: s.images.map((i) => ({ ...i, lines: { ...i.lines, style: STYLE } })),
    }))
    render(<LineDefaultsEffect />)
    act(() => {
      expect(useImages.getState().applyLinesToAll(A)).toBe(0)
    })
    expect(useSettings.getState().lineDefaults.style).toEqual(STYLE)
  })

  it('reacts to an apply only when a new apply is recorded: clear() keeps the last one and writes nothing', () => {
    render(<LineDefaultsEffect />)
    act(() => {
      useImages.getState().updateLines(A, { style: STYLE })
      useImages.getState().applyLinesToAll(A)
    })
    useSettings.getState().setLineDefaults(DEFAULT_LINES)
    const set = vi.spyOn(useSettings.getState(), 'setLineDefaults')
    act(() => {
      useImages.getState().clear()
    })
    expect(set).not.toHaveBeenCalled()
    expect(useSettings.getState().lineDefaults).toEqual(DEFAULT_LINES)
  })

  it('stops listening once unmounted', () => {
    const { unmount } = render(<LineDefaultsEffect />)
    unmount()
    act(() => {
      useImages.getState().updateLines(A, { style: STYLE })
    })
    expect(useSettings.getState().lineDefaults).toEqual(DEFAULT_LINES)
  })
})
