import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { CropRect } from '../../../shared/model/image'
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

  it('draws a smaller preview bitmap over the whole image and keeps crops in image pixels', () => {
    const drawImage = vi.fn()
    const setTransform = vi.fn()
    const ctx = { drawImage, setTransform, imageSmoothingQuality: 'low' }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as RenderingContext,
    )
    const bitmap = { width: 100, height: 75, close: () => undefined } as unknown as ImageBitmap
    const props = base({ bitmap })
    renderWithProviders(<CropEditor {...props} />)
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 400, 300)
    drag(area(), [150, 150], [180, 170])
    expect(props.onChange).toHaveBeenCalledWith({ x: 130, y: 120, w: 100, h: 100 })
    vi.restoreAllMocks()
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
    expect(area()).toBeInTheDocument()
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

  describe('single-pointer controls (WCAG 2.5.7)', () => {
    const BUTTONS: readonly [string, string, boolean][] = [
      ['Move left', 'ArrowLeft', false],
      ['Move up', 'ArrowUp', false],
      ['Move down', 'ArrowDown', false],
      ['Move right', 'ArrowRight', false],
      ['Narrower', 'ArrowLeft', true],
      ['Wider', 'ArrowRight', true],
      ['Shorter', 'ArrowUp', true],
      ['Taller', 'ArrowDown', true],
    ]
    const controls = () => screen.getByRole('group', { name: 'Crop position and size' })

    it('offers the eight steps as plain buttons in a named group, outside the draggable area', () => {
      renderWithProviders(<CropEditor {...base()} />)
      const group = controls()
      const position = within(group).getByRole('group', { name: 'Position' })
      const size = within(group).getByRole('group', { name: 'Size' })
      expect(
        within(position)
          .getAllByRole('button')
          .map((b) => b.getAttribute('aria-label')),
      ).toEqual(['Move left', 'Move up', 'Move down', 'Move right'])
      expect(
        within(size)
          .getAllByRole('button')
          .map((b) => b.getAttribute('aria-label')),
      ).toEqual(['Narrower', 'Wider', 'Shorter', 'Taller'])
      for (const b of within(group).getAllByRole('button')) {
        expect(b).toHaveAttribute('type', 'button')
        expect(area().contains(b)).toBe(false)
      }
    })

    it.each(BUTTONS)('%s commits once, by a click alone', async (name) => {
      const props = base()
      renderWithProviders(<CropEditor {...props} />)
      await userEvent.click(screen.getByRole('button', { name }))
      expect(props.onChange).toHaveBeenCalledTimes(1)
    })

    it.each([
      ['Move left', { x: 98, y: 100, w: 100, h: 100 }],
      ['Move up', { x: 100, y: 98, w: 100, h: 100 }],
      ['Move down', { x: 100, y: 102, w: 100, h: 100 }],
      ['Move right', { x: 102, y: 100, w: 100, h: 100 }],
      ['Narrower', { x: 100, y: 100, w: 98, h: 100 }],
      ['Wider', { x: 100, y: 100, w: 102, h: 100 }],
      ['Shorter', { x: 100, y: 100, w: 100, h: 98 }],
      ['Taller', { x: 100, y: 100, w: 100, h: 102 }],
    ])('%s moves or sizes the crop by one keyboard step', (name, want) => {
      const props = base()
      renderWithProviders(<CropEditor {...props} />)
      fireEvent.click(screen.getByRole('button', { name }))
      expect(props.onChange).toHaveBeenLastCalledWith(want)
    })

    const VIEWS = [
      { rotation: 0, flipH: false, flipV: false },
      { rotation: 90, flipH: false, flipV: false },
      { rotation: 180, flipH: true, flipV: false },
      { rotation: 270, flipH: false, flipV: true },
    ] as const
    it.each(VIEWS.flatMap((view) => [null, 1, 4 / 3].map((ratio) => ({ view, ratio }))))(
      'each button gives exactly the crop its key gives (rotation $view.rotation, ratio $ratio)',
      ({ view, ratio }) => {
        const props = base({ view, ratio, crop: { x: 120, y: 90, w: 120, h: 90 } })
        renderWithProviders(<CropEditor {...props} />)
        const onChange = props.onChange as ReturnType<typeof vi.fn>
        for (const [name, key, shiftKey] of BUTTONS) {
          fireEvent.keyDown(area(), { key, shiftKey })
          const byKey: unknown = onChange.mock.lastCall?.[0]
          fireEvent.click(screen.getByRole('button', { name }))
          expect(onChange.mock.lastCall?.[0], name).toEqual(byKey)
          expect(byKey, name).not.toEqual(props.crop)
        }
      },
    )

    it('keeps a locked shape when sizing by button', () => {
      const props = base({ ratio: 4 / 3, crop: { x: 100, y: 100, w: 120, h: 90 } })
      renderWithProviders(<CropEditor {...props} />)
      for (const name of ['Narrower', 'Wider', 'Shorter', 'Taller']) {
        fireEvent.click(screen.getByRole('button', { name }))
        const [crop] = (props.onChange as ReturnType<typeof vi.fn>).mock.lastCall as [CropRect]
        expect(crop.w / crop.h, name).toBeCloseTo(4 / 3, 9)
      }
    })

    it('stays inside the image at its edge, as the arrow keys do', () => {
      const corner = { x: 300, y: 200, w: 100, h: 100 }
      const props = base({ crop: corner })
      renderWithProviders(<CropEditor {...props} />)
      for (const name of ['Move right', 'Move down', 'Wider', 'Taller']) {
        fireEvent.click(screen.getByRole('button', { name }))
        expect(props.onChange, name).toHaveBeenLastCalledWith(corner)
      }
    })

    it('announces the new crop in the status region after each press, like a key press', async () => {
      function Controlled() {
        const [crop, setCrop] = useState<CropRect>({ x: 100, y: 100, w: 100, h: 100 })
        return <CropEditor {...base({ crop, onChange: setCrop })} />
      }
      renderWithProviders(<Controlled />)
      const status = screen.getByRole('status')
      await userEvent.click(screen.getByRole('button', { name: 'Move right' }))
      expect(status).toHaveTextContent('Crop 100 × 100 px at 102, 100')
      await userEvent.click(screen.getByRole('button', { name: 'Taller' }))
      expect(status).toHaveTextContent('Crop 100 × 102 px at 102, 100')
      fireEvent.keyDown(area(), { key: 'ArrowLeft' })
      expect(status).toHaveTextContent('Crop 100 × 102 px at 100, 100')
      expect(screen.getByRole('button', { name: 'Taller' })).toHaveFocus()
    })
  })
})
