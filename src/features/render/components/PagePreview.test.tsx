import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../../shared/i18n'
import { drawTile, id, pageModel } from '../test-support/fixtures'
import { PagePreview } from './PagePreview'

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
      getBitmap={() => undefined}
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
        getBitmap={() => undefined}
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
  it('does not redraw when only the getBitmap identity changes', () => {
    const draw = drawSpy
    draw.mockClear()
    const ctx = fakeCtx()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as RenderingContext,
    )
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)
    const props = { model, selectedId: null, onSelect: vi.fn(), guides: true, label: 'p' }
    const { rerender } = render(<PagePreview {...props} getBitmap={() => undefined} />)
    const before = draw.mock.calls.length
    expect(before).toBeGreaterThan(0)
    rerender(<PagePreview {...props} getBitmap={() => undefined} />)
    expect(draw.mock.calls.length).toBe(before)
    rerender(<PagePreview {...props} guides={false} getBitmap={() => undefined} />)
    expect(draw.mock.calls.length).toBe(before + 1)
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
