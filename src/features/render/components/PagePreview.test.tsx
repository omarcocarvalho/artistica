import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../../shared/i18n'
import { drawTile, id, pageModel } from '../test-support/fixtures'
import { PagePreview } from './PagePreview'
import { createSheetRegistry, type ArrangeProps } from './arrange-types'

const drawSpy = vi.hoisted(() => vi.fn())
vi.mock('../preview/draw-page', async (orig) => {
  const actual = await orig<typeof import('../preview/draw-page')>()
  return {
    ...actual,
    drawPage: (...a: Parameters<typeof actual.drawPage>) => {
      drawSpy(...a)
      actual.drawPage(...a)
    },
  }
})

beforeAll(async () => {
  await initI18n()
})

const model = pageModel([
  drawTile({ imageId: id('a'), trim: { x: 20, y: 20, w: 100, h: 50 }, scaledToFit: true }),
  drawTile({
    imageId: id('b'),
    trim: { x: 20, y: 80, w: 60, h: 40 },
    lowDpi: true,
    crop: { x: 0, y: 0, w: 480, h: 320 },
  }),
])

function setup(props: Partial<Parameters<typeof PagePreview>[0]> = {}) {
  const onSelect = vi.fn()
  render(
    <PagePreview
      model={model}
      getSource={() => undefined}
      selectedId={null}
      onSelect={onSelect}
      guides
      label="Page 1 of 2 · A4 portrait"
      getName={(i) => (i === id('a') ? 'portrait-anna.jpg' : 'pears.heic')}
      {...props}
    />,
  )
  return { onSelect, user: userEvent.setup() }
}

describe('PagePreview', () => {
  it('labels the page group with the given label', () => {
    setup()
    expect(screen.getByRole('group', { name: 'Page 1 of 2 · A4 portrait' })).toBeInTheDocument()
  })

  it('exposes every tile as a button named after its image', () => {
    setup()
    expect(screen.getByRole('button', { name: 'portrait-anna.jpg' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'pears.heic' })).toBeInTheDocument()
  })

  it('falls back to "Image N" without getName', () => {
    setup({ getName: undefined })
    expect(screen.getByRole('button', { name: 'Image 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Image 2' })).toBeInTheDocument()
  })

  it('selects on click (D6)', async () => {
    const { onSelect, user } = setup()
    await user.click(screen.getByRole('button', { name: 'pears.heic' }))
    expect(onSelect).toHaveBeenCalledWith(id('b'))
  })

  it('selects with the keyboard (Tab + Enter, Space)', async () => {
    const { onSelect, user } = setup()
    await user.tab()
    expect(screen.getByRole('button', { name: 'portrait-anna.jpg' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenLastCalledWith(id('a'))
    await user.tab()
    await user.keyboard(' ')
    expect(onSelect).toHaveBeenLastCalledWith(id('b'))
  })

  it('marks the selected tile pressed', () => {
    setup({ selectedId: id('a') })
    expect(screen.getByRole('button', { name: 'portrait-anna.jpg' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'pears.heic' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('shows the low-DPI chip with the source DPI and describes the tile with it', () => {
    setup()
    expect(screen.getByText('203 DPI')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'pears.heic' })).toHaveAccessibleDescription(
      'Low resolution: 203 DPI',
    )
  })

  it('shows the "Scaled to fit" chip only on scaled tiles and describes the tile with it (CR-X1)', () => {
    setup()
    expect(screen.getAllByText('Scaled to fit')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'portrait-anna.jpg' })).toHaveAccessibleDescription(
      'Scaled down to fit the page',
    )
  })

  it('positions tile buttons in % of the sheet', () => {
    setup()
    const btn = screen.getByRole('button', { name: 'portrait-anna.jpg' })
    expect(btn.style.left).toBe(`${String((20 / 210) * 100)}%`)
    expect(btn.style.width).toBe(`${String((100 / 210) * 100)}%`)
  })

  it('keeps the canvas out of the accessibility tree', () => {
    const { container } = render(
      <PagePreview
        model={model}
        getSource={() => undefined}
        selectedId={null}
        onSelect={vi.fn()}
        guides={false}
        label="p"
      />,
    )
    expect(container.querySelector('canvas')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('PagePreview redraws', () => {
  it('does not redraw when only the getSource identity changes', () => {
    const draw = drawSpy
    draw.mockClear()
    const ctx = fakeCtx()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as RenderingContext,
    )
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)
    const props = { model, selectedId: null, onSelect: vi.fn(), guides: true, label: 'p' }
    const { rerender } = render(<PagePreview {...props} getSource={() => undefined} />)
    const before = draw.mock.calls.length
    expect(before).toBeGreaterThan(0)
    rerender(<PagePreview {...props} getSource={() => undefined} />)
    expect(draw.mock.calls.length).toBe(before)
    rerender(<PagePreview {...props} guides={false} getSource={() => undefined} />)
    expect(draw.mock.calls.length).toBe(before + 1)
    vi.restoreAllMocks()
  })
})

describe('PagePreview with a preview bitmap smaller than the image', () => {
  it('draws the same region of the image from the smaller bitmap', () => {
    const drawImage = vi.fn()
    const ctx = fakeCtx()
    ctx.drawImage = drawImage
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as RenderingContext,
    )
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)
    const bitmap = { width: 750, height: 500, close: vi.fn() } as unknown as ImageBitmap
    const tile = drawTile({
      imageId: id('a'),
      trim: { x: 20, y: 20, w: 100, h: 50 },
      crop: { x: 400, y: 200, w: 2000, h: 1000 },
      rotation: 180,
    })
    render(
      <PagePreview
        model={pageModel([tile])}
        getSource={() => ({ bitmap, pxW: 3000, pxH: 2000 })}
        selectedId={null}
        onSelect={vi.fn()}
        guides={false}
        label="p"
      />,
    )
    const fromBitmap = drawImage.mock.calls.filter((c) => c[0] === bitmap)
    expect(fromBitmap).toHaveLength(1)
    expect(fromBitmap[0]?.slice(1, 5)).toEqual([100, 50, 500, 250])
    vi.restoreAllMocks()
  })
})

function arrangeProps(over: Partial<ArrangeProps> = {}): ArrangeProps {
  return {
    blocks: [
      {
        id: 'a#0',
        imageId: id('a'),
        page: 0,
        rect: { x: 20, y: 20, w: 100, h: 50 },
        tileW: 100,
        fixed: false,
        name: 'portrait-anna.jpg, 100 × 50 mm, page 1',
      },
    ],
    content: { x: 10, y: 10, w: 190, h: 277 },
    gutter: 5,
    selected: null,
    pickedUp: null,
    focusId: null,
    sheets: createSheetRegistry(),
    onSelect: vi.fn(),
    onFocused: vi.fn(),
    onPreview: vi.fn(() => ({ ok: false }) as const),
    onCommit: vi.fn(() => true),
    onPickUp: vi.fn(),
    ...over,
  }
}

describe('PagePreview in Arrange mode', () => {
  it('renders movable blocks instead of the tile buttons', () => {
    setup({ arrange: arrangeProps() })
    expect(screen.queryByRole('button', { name: 'pears.heic' })).toBeNull()
    const block = screen.getByRole('button', { name: 'portrait-anna.jpg, 100 × 50 mm, page 1' })
    expect(block).toHaveAttribute('aria-roledescription', 'movable photo')
  })

  it('keeps the sheet full width and scopes the arrange styles to it', () => {
    setup({ arrange: arrangeProps() })
    expect(screen.getByRole('group', { name: 'Page 1 of 2 · A4 portrait' })).toHaveClass(
      'relative',
      'w-full',
      'arrange-layer',
    )
  })

  it('registers its sheet so a drag can land on it', () => {
    const sheets = createSheetRegistry()
    const register = vi.spyOn(sheets, 'register')
    setup({ arrange: arrangeProps({ sheets }) })
    expect(register).toHaveBeenCalledWith(
      0,
      screen.getByRole('group', { name: 'Page 1 of 2 · A4 portrait' }),
    )
  })

  it('does not redraw the canvas during 50 pointer moves (M5-R19)', () => {
    drawSpy.mockClear()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      fakeCtx() as unknown as RenderingContext,
    )
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(420)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 420,
      height: 594,
      right: 420,
      bottom: 594,
    } as DOMRect)
    const arrange = arrangeProps()
    setup({ arrange })
    const draws = drawSpy.mock.calls.length
    expect(draws).toBeGreaterThan(0)
    const block = screen.getByRole('button', { name: /^portrait-anna/ })
    fireEvent.pointerDown(block, { pointerId: 1, button: 0, clientX: 60, clientY: 60 })
    for (let i = 1; i <= 50; i++)
      fireEvent.pointerMove(document, { pointerId: 1, clientX: 60 + i * 2, clientY: 60 + i })
    expect(arrange.onPreview).toHaveBeenCalled()
    expect(drawSpy.mock.calls.length).toBe(draws)
    expect(arrange.onCommit).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})

function fakeCtx() {
  return new Proxy<Record<string, unknown>>(
    {},
    {
      get: (t, k: string) => t[k] ?? (() => undefined),
      set: (t, k: string, v) => {
        t[k] = v
        return true
      },
    },
  )
}
