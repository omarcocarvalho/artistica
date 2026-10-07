import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useImages } from '../../features/images'
import { makeLoadedImage } from '../../features/images/test-utils'
import { useSettings } from '../../features/settings'
import type { ImageId } from '../../shared/model/image'
import { DEFAULT_LINES, type LineSettings } from '../../shared/model/lines'
import { LineDefaultsEffect } from './LineDefaultsEffect'

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
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
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
