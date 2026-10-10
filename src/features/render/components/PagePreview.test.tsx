import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../../shared/i18n'
import { installFakeIntersectionObserver } from '../test-support/fake-intersection-observer'
import { drawTile, id, pageModel } from '../test-support/fixtures'
import type { StepLevelSlot } from '../pixels/render-tile'
import type { PageModel } from '../types'
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

const renderSpy = vi.hoisted(() => vi.fn())
vi.mock('../pixels/render-tile', async (orig) => {
  const actual = await orig<typeof import('../pixels/render-tile')>()
  return {
    ...actual,
    renderTile: (...a: Parameters<typeof actual.renderTile>) => {
      renderSpy(...a)
      return actual.renderTile(...a)
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

  it('keeps the low-DPI and scaled-to-fit chips and puts them in the block description (M5-R12)', () => {
    const base = arrangeProps()
    const blocks = [
      ...base.blocks,
      {
        id: 'b#2',
        imageId: id('b'),
        page: 1,
        rect: { x: 20, y: 80, w: 60, h: 40 },
        tileW: 60,
        fixed: false,
        name: 'pears.heic, 60 × 40 mm, page 2',
      },
      {
        id: 'c#0',
        imageId: id('c'),
        page: 0,
        rect: { x: 20, y: 80, w: 60, h: 40 },
        tileW: 60,
        fixed: false,
        name: 'other.jpg, 60 × 40 mm, page 1',
      },
      {
        id: 'b#1',
        imageId: id('b'),
        page: 0,
        rect: { x: 20, y: 150, w: 60, h: 40 },
        tileW: 60,
        fixed: false,
        name: 'pears.heic copy, 60 × 40 mm, page 1',
      },
      {
        id: 'b#0',
        imageId: id('b'),
        page: 0,
        rect: { x: 20, y: 80, w: 60, h: 40 },
        tileW: 60,
        fixed: false,
        name: 'pears.heic, 60 × 40 mm, page 1',
      },
    ]
    setup({ arrange: arrangeProps({ blocks }) })
    expect(screen.getByText('203 DPI')).toBeInTheDocument()
    expect(screen.getByText('Scaled to fit')).toBeInTheDocument()
    const instructions =
      'Use the arrow keys to move, Shift and the arrow keys to resize, Enter to swap with another photo.'
    expect(screen.getByRole('button', { name: /^pears\.heic, / })).toHaveAccessibleDescription(
      `${instructions} Low resolution: 203 DPI`,
    )
    expect(screen.getByRole('button', { name: /^portrait-anna/ })).toHaveAccessibleDescription(
      `${instructions} Scaled down to fit the page`,
    )
    expect(screen.getByRole('button', { name: /^pears\.heic copy/ })).toHaveAccessibleDescription(
      instructions,
    )
    expect(screen.getByRole('button', { name: /^other\.jpg/ })).toHaveAccessibleDescription(
      instructions,
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

describe('PagePreview keeps the step-down of each photo between redraws', () => {
  const bitmap = { width: 3000, height: 2000, close: vi.fn() } as unknown as ImageBitmap
  const tileOf = (imageId: string, w: number, y = 20) =>
    drawTile({
      imageId: id(imageId),
      trim: { x: 20, y, w, h: w / 2 },
      crop: { x: 0, y: 0, w: 2000, h: 1000 },
    })
  const fromBitmap = (drawImage: ReturnType<typeof vi.fn>) =>
    drawImage.mock.calls.filter((c) => c[0] === bitmap).length
  const slots = () =>
    renderSpy.mock.calls.map((c) => c[4] as StepLevelSlot<HTMLCanvasElement> | undefined)

  function mount(model: PageModel) {
    const drawImage = vi.fn()
    const ctx = fakeCtx()
    ctx.drawImage = drawImage
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as RenderingContext,
    )
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)
    renderSpy.mockClear()
    const props = {
      getSource: () => ({ bitmap, pxW: 3000, pxH: 2000 }),
      selectedId: null,
      onSelect: vi.fn(),
      guides: false,
      label: 'p',
    }
    const utils = render(<PagePreview {...props} model={model} />)
    const show = (next: PageModel) => {
      utils.rerender(<PagePreview {...props} model={next} />)
    }
    return { drawImage, show, ...utils }
  }

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('a tile drawn again at another size reads the photo once, from the kept step-down', () => {
    const { drawImage, show } = mount(pageModel([tileOf('a', 100)]))
    expect(fromBitmap(drawImage)).toBe(1)
    show(pageModel([tileOf('a', 96)]))
    expect(renderSpy).toHaveBeenCalledTimes(2)
    expect(slots()[1]).toBe(slots()[0])
    expect(fromBitmap(drawImage)).toBe(1)
  })

  it('two copies of one photo with different crops each keep their own step-down', () => {
    const lower = (w: number) =>
      drawTile({
        imageId: id('a'),
        trim: { x: 20, y: 80, w, h: w / 2 },
        crop: { x: 0, y: 500, w: 2000, h: 1000 },
      })
    const { drawImage, show } = mount(pageModel([tileOf('a', 100), lower(100)]))
    expect(fromBitmap(drawImage)).toBe(2)
    show(pageModel([tileOf('a', 96), lower(96)]))
    expect(renderSpy).toHaveBeenCalledTimes(4)
    expect(fromBitmap(drawImage)).toBe(2)
  })

  it('releases the kept step-down of a photo that leaves the page, and the rest on unmount', () => {
    const { show, unmount } = mount(pageModel([tileOf('a', 100), tileOf('b', 100, 80)]))
    const [a, b] = slots().map((slot) => slot?.levels.at(-1)?.canvas)
    expect(a?.width).toBeGreaterThan(0)
    expect(b?.width).toBeGreaterThan(0)
    show(pageModel([tileOf('a', 96)]))
    expect(b?.width).toBe(0)
    expect(a?.width).toBeGreaterThan(0)
    unmount()
    expect(a?.width).toBe(0)
  })

  it('releases the kept step-downs when the page goes far', () => {
    const io = installFakeIntersectionObserver()
    const { container } = mount(pageModel([tileOf('a', 100)], { index: 2 }))
    const sheet = container.querySelector('[role="group"]')
    if (!sheet) throw new Error('no sheet')
    io.set(sheet, true)
    const level = slots()[0]?.levels.at(-1)?.canvas
    expect(level?.width).toBeGreaterThan(0)
    io.set(sheet, false)
    expect(level?.width).toBe(0)
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
