import { fireEvent, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../test-utils'
import { CROP_STAGE_FALLBACK_PX, CropEditor, type CropEditorProps } from './CropEditor'

beforeAll(() => {
  // Some DOM shims drop clientX on pointer events; make sure the event class carries it.
  if (!('PointerEvent' in window)) {
    class PE extends MouseEvent {
      pointerId: number
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init)
        this.pointerId = init.pointerId ?? 1
      }
    }
    Object.assign(window, { PointerEvent: PE })
  }
})

// 400 x 300 source, stage fallback is 400 css px wide, so 1 css px = 1 source px.
const base = (over: Partial<CropEditorProps> = {}): CropEditorProps => ({
  bitmap: { width: 400, height: 300, close: () => undefined },
  pxW: 400,
  pxH: 300,
  crop: { x: 100, y: 100, w: 100, h: 100 },
  ratio: null,
  view: { rotation: 0, flipH: false, flipV: false },
  onChange: vi.fn(),
  ...over,
})

const seHandle = (c: HTMLElement): Element => {
  const el = c.querySelector('[data-handle="se"]')
  if (!el) throw new Error('no se handle')
  return el
}
const area = () => screen.getByRole('group', { name: 'Crop area' })
const drag = (el: Element, from: [number, number], to: [number, number]) => {
  fireEvent.pointerDown(el, { clientX: from[0], clientY: from[1], pointerId: 1, button: 0 })
  fireEvent.pointerMove(el, { clientX: to[0], clientY: to[1], pointerId: 1 })
  fireEvent.pointerUp(el, { clientX: to[0], clientY: to[1], pointerId: 1 })
}

describe('CropEditor', () => {
  it('has a keyboard-reachable crop area with instructions', () => {
    renderWithProviders(<CropEditor {...base()} />)
    expect(area()).toHaveAttribute('tabindex', '0')
    const helpId = (area().getAttribute('aria-describedby') ?? '').split(' ')[0] ?? ''
    expect(document.getElementById(helpId)).toHaveTextContent(
      'Arrow keys move the crop area. Shift plus arrow keys resize it.',
    )
    expect(CROP_STAGE_FALLBACK_PX).toBe(400)
  })

  it('moves by dragging the box and commits once, on pointer up', () => {
    const props = base()
    renderWithProviders(<CropEditor {...props} />)
    const box = area()
    fireEvent.pointerDown(box, { clientX: 150, clientY: 150, pointerId: 1, button: 0 })
    fireEvent.pointerMove(box, { clientX: 180, clientY: 170, pointerId: 1 })
    expect(props.onChange).not.toHaveBeenCalled()
    fireEvent.pointerUp(box, { clientX: 180, clientY: 170, pointerId: 1 })
    expect(props.onChange).toHaveBeenCalledTimes(1)
    expect(props.onChange).toHaveBeenCalledWith({ x: 130, y: 120, w: 100, h: 100 })
  })

  it('cannot be dragged outside the image', () => {
    const props = base()
    renderWithProviders(<CropEditor {...props} />)
    drag(area(), [150, 150], [5000, 5000])
    expect(props.onChange).toHaveBeenCalledWith({ x: 300, y: 200, w: 100, h: 100 })
  })

  it('resizes from a corner handle (free)', () => {
    const props = base()
    const { container } = renderWithProviders(<CropEditor {...props} />)
    drag(seHandle(container), [200, 200], [240, 230])
    expect(props.onChange).toHaveBeenCalledWith({ x: 100, y: 100, w: 140, h: 130 })
  })

  it('keeps the aspect ratio when locked', () => {
    const props = base({ ratio: 1 })
    const { container } = renderWithProviders(<CropEditor {...props} />)
    drag(seHandle(container), [200, 200], [240, 215])
    const [crop] = (props.onChange as ReturnType<typeof vi.fn>).mock.calls[0] as [
      { w: number; h: number },
    ]
    expect(crop.w).toBeCloseTo(crop.h, 9)
    expect(crop.w).toBeCloseTo(140, 9)
  })

  it('maps pointer movement through the rotation (90 degrees: display right = source up)', () => {
    const props = base({ view: { rotation: 90, flipH: false, flipV: false } })
    renderWithProviders(<CropEditor {...props} />)
    drag(area(), [100, 100], [130, 100])
    // 300 x 400 displayed image fits the 400 px tall stage (max 420) with k = 300 / 315 image px per css px.
    const k = 300 / 315
    const [crop] = (props.onChange as ReturnType<typeof vi.fn>).mock.calls[0] as [
      { x: number; y: number },
    ]
    expect(crop.x).toBeCloseTo(100, 9)
    expect(crop.y).toBeCloseTo(100 - 30 * k, 9)
  })
  it('cancelling the gesture commits nothing', () => {
    const props = base()
    renderWithProviders(<CropEditor {...props} />)
    fireEvent.pointerDown(area(), { clientX: 150, clientY: 150, pointerId: 1, button: 0 })
    fireEvent.pointerMove(area(), { clientX: 200, clientY: 200, pointerId: 1 })
    fireEvent.pointerCancel(area(), { pointerId: 1 })
    expect(props.onChange).not.toHaveBeenCalled()
  })

  it('shows a text readout of the rectangle at all times (CR-E6)', () => {
    renderWithProviders(<CropEditor {...base()} />)
    expect(screen.getByRole('status')).toHaveTextContent('Crop 100 × 100 px at 100, 100')
    expect(screen.getByRole('group', { name: /crop/i })).toBeInTheDocument()
  })

  it('arrow keys move and Shift+arrows resize', () => {
    const props = base()
    renderWithProviders(<CropEditor {...props} />)
    fireEvent.keyDown(area(), { key: 'ArrowRight' })
    expect(props.onChange).toHaveBeenLastCalledWith({ x: 102, y: 100, w: 100, h: 100 })
    fireEvent.keyDown(area(), { key: 'ArrowDown', shiftKey: true })
    expect(props.onChange).toHaveBeenLastCalledWith({ x: 100, y: 100, w: 100, h: 102 })
    fireEvent.keyDown(area(), { key: 'ArrowLeft', shiftKey: true })
    expect(props.onChange).toHaveBeenLastCalledWith({ x: 100, y: 100, w: 98, h: 100 })
  })

  it('Shift+arrows shrink a locked-ratio crop too', () => {
    const props = base({ ratio: 1 })
    renderWithProviders(<CropEditor {...props} />)
    fireEvent.keyDown(area(), { key: 'ArrowLeft', shiftKey: true })
    const [crop] = (props.onChange as ReturnType<typeof vi.fn>).mock.lastCall as [
      { w: number; h: number },
    ]
    expect(crop.w).toBeCloseTo(98, 9)
    expect(crop.h).toBeCloseTo(98, 9)
  })

  it('ignores other keys and does not call preventDefault for them', () => {
    const props = base()
    renderWithProviders(<CropEditor {...props} />)
    const notPrevented = fireEvent.keyDown(area(), { key: 'a' })
    expect(notPrevented).toBe(true)
    expect(props.onChange).not.toHaveBeenCalled()
  })

  it('survives a 1 x 1 image and a degenerate crop', () => {
    const props = base({
      pxW: 1,
      pxH: 1,
      crop: { x: 0, y: 0, w: 1, h: 1 },
      bitmap: { width: 1, height: 1, close: () => undefined } as unknown as ImageBitmap,
    })
    renderWithProviders(<CropEditor {...props} />)
    fireEvent.keyDown(area(), { key: 'ArrowRight' })
    expect(props.onChange).toHaveBeenLastCalledWith({ x: 0, y: 0, w: 1, h: 1 })
  })

  it('hides the pointer-only handles from assistive technology', () => {
    const { container } = renderWithProviders(<CropEditor {...base()} />)
    const handles = container.querySelectorAll('[data-handle]')
    expect(handles).toHaveLength(8)
    handles.forEach((h) => expect(h).toHaveAttribute('aria-hidden', 'true'))
  })

  it('maps css movement to source with a stage scale other than 1', () => {
    const w = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(200)
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn()
        disconnect = vi.fn()
        unobserve = vi.fn()
      },
    )
    try {
      const props = base() // 400 x 300 in a 200 px stage: 1 css px = 2 source px
      renderWithProviders(<CropEditor {...props} />)
      drag(area(), [50, 50], [70, 60])
      expect(props.onChange).toHaveBeenCalledWith({ x: 140, y: 120, w: 100, h: 100 })
    } finally {
      w.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  it('ignores a second pointer while a drag is active', () => {
    const props = base()
    renderWithProviders(<CropEditor {...props} />)
    const box = area()
    fireEvent.pointerDown(box, { clientX: 150, clientY: 150, pointerId: 1, button: 0 })
    fireEvent.pointerDown(box, { clientX: 300, clientY: 300, pointerId: 2, button: 0 })
    fireEvent.pointerMove(box, { clientX: 500, clientY: 500, pointerId: 2 })
    fireEvent.pointerUp(box, { clientX: 500, clientY: 500, pointerId: 2 })
    expect(props.onChange).not.toHaveBeenCalled()
    fireEvent.pointerMove(box, { clientX: 160, clientY: 150, pointerId: 1 })
    fireEvent.pointerUp(box, { clientX: 160, clientY: 150, pointerId: 1 })
    expect(props.onChange).toHaveBeenCalledTimes(1)
    expect(props.onChange).toHaveBeenCalledWith({ x: 110, y: 100, w: 100, h: 100 })
  })

  it('treats lost pointer capture as a cancel', () => {
    const props = base()
    renderWithProviders(<CropEditor {...props} />)
    fireEvent.pointerDown(area(), { clientX: 150, clientY: 150, pointerId: 1, button: 0 })
    fireEvent.lostPointerCapture(area(), { pointerId: 1 })
    fireEvent.pointerUp(area(), { clientX: 200, clientY: 200, pointerId: 1 })
    expect(props.onChange).not.toHaveBeenCalled()
  })

  it('does not announce drafts and leaves modified arrows alone', () => {
    const props = base()
    renderWithProviders(<CropEditor {...props} />)
    fireEvent.pointerDown(area(), { clientX: 150, clientY: 150, pointerId: 1, button: 0 })
    fireEvent.pointerMove(area(), { clientX: 180, clientY: 170, pointerId: 1 })
    expect(screen.getByRole('status')).toHaveTextContent('Crop 100 × 100 px at 100, 100')
    expect(fireEvent.keyDown(area(), { key: 'ArrowRight', ctrlKey: true })).toBe(true)
    expect(fireEvent.keyDown(area(), { key: 'ArrowRight', altKey: true })).toBe(true)
    expect(fireEvent.keyDown(area(), { key: 'ArrowRight', metaKey: true })).toBe(true)
    expect(props.onChange).not.toHaveBeenCalled()
  })
})
