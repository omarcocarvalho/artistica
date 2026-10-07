import { act, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../../shared/i18n'
import type { PageModel } from '../types'
import { fakeStudyTiles } from '../test-support/fake-study-tiles'
import { drawTile, id, pageModel } from '../test-support/fixtures'
import { PagePreview, type PagePreviewProps } from './PagePreview'

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

const blur = { blurPct: 40, values: null }
const values = { blurPct: null, values: { count: 5, hue: 55, neutral: false } }
const crop = { x: 0, y: 0, w: 480, h: 640 }
const group = pageModel(
  [
    drawTile({ imageId: id('a'), trim: { x: 10, y: 10, w: 60, h: 80 }, lowDpi: true, crop }),
    drawTile({
      imageId: id('a'),
      trim: { x: 76, y: 10, w: 60, h: 80 },
      version: 'blurred',
      study: blur,
      lowDpi: true,
      crop,
    }),
    drawTile({
      imageId: id('a'),
      trim: { x: 142, y: 10, w: 60, h: 80 },
      version: 'values',
      study: values,
      lowDpi: true,
      crop,
    }),
  ],
  { groups: [{ imageId: id('a'), block: { x: 10, y: 10, w: 192, h: 80 } }] },
)

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

beforeEach(() => {
  drawSpy.mockClear()
  vi.restoreAllMocks()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    fakeCtx() as unknown as RenderingContext,
  )
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(420)
})

const bitmap = { width: 480, height: 640, close: vi.fn() } as unknown as ImageBitmap
const image = (): CanvasImageSource => ({ width: 1, height: 1 }) as unknown as CanvasImageSource

function props(
  f: ReturnType<typeof fakeStudyTiles>,
  model: PageModel,
  extra: Partial<PagePreviewProps> = {},
): PagePreviewProps {
  return {
    model,
    getSource: () => ({ bitmap, pxW: 480, pxH: 640 }),
    studyTiles: f.provider,
    selectedId: null,
    onSelect: vi.fn(),
    guides: true,
    label: 'Page 1',
    getName: () => 'pears.heic',
    ...extra,
  }
}

function show(f = fakeStudyTiles(), model = group) {
  const utils = render(<PagePreview {...props(f, model)} />)
  return { f, ...utils }
}

/** The tileImage callback of the latest drawPage call, for tile i. */
const lastTileImage = (i: number) => {
  const opts = drawSpy.mock.calls.at(-1)?.[3] as { tileImage: (i: number) => unknown }
  return opts.tileImage(i)
}

describe('PagePreview study tiles', () => {
  it('wants exactly the study tiles of the page, in order', () => {
    const { f } = show()
    expect(f.wanted().map((r) => r.slot)).toEqual(['a|blurred|0:1', 'a|values|0:2'])
  })

  it('never draws the original pixels in a study tile’s place: missing until ready (M2-R12)', () => {
    show()
    expect(lastTileImage(0)).not.toBeNull()
    expect(lastTileImage(1)).toBeNull()
    expect(lastTileImage(2)).toBeNull()
  })

  it('draws a study tile from the provider and redraws when it becomes ready', () => {
    const { f } = show()
    const ready = image()
    const before = drawSpy.mock.calls.length
    const key = f.wanted()[0]?.key ?? ''
    act(() => {
      f.resolve(key, ready)
    })
    expect(drawSpy.mock.calls.length).toBeGreaterThan(before)
    expect(lastTileImage(1)).toBe(ready)
    expect(lastTileImage(2)).toBeNull()
  })

  it('draws the stale slot image while a re-keyed tile renders', () => {
    const f = fakeStudyTiles()
    const old = image()
    f.setStale('a|blurred|0:1', old)
    show(f)
    expect(lastTileImage(1)).toBe(old)
  })

  it('re-wants on every model change and releases on unmount', () => {
    const { f, rerender, unmount } = show()
    const changed = pageModel(
      group.tiles.map((t) =>
        t.version === 'blurred' ? { ...t, study: { blurPct: 90, values: null } } : t,
      ),
      { groups: group.groups },
    )
    const firstKey = f.wanted()[0]?.key
    rerender(<PagePreview {...props(f, changed)} />)
    expect(f.wanted()[0]?.key).not.toBe(firstKey)
    expect(f.released).toEqual([])
    unmount()
    expect(f.released).toHaveLength(1)
    expect(f.listenerCount()).toBe(0)
  })

  it('wants nothing (still once) when the page has no study tiles', () => {
    const f = fakeStudyTiles()
    show(f, pageModel([drawTile()]))
    expect(f.wants.size).toBe(1)
    expect(f.wanted()).toEqual([])
  })

  it('releases from the old provider when the provider changes', () => {
    const { f, rerender } = show()
    const next = fakeStudyTiles()
    rerender(<PagePreview {...props(next, group)} />)
    expect(f.released).toHaveLength(1)
    expect(f.listenerCount()).toBe(0)
    expect(next.wanted()).toHaveLength(2)
  })

  it('marks the sheet busy while study tiles are pending', () => {
    const { f } = show()
    const sheet = screen.getByRole('group', { name: 'Page 1' })
    expect(sheet).toHaveAttribute('aria-busy', 'true')
    act(() => {
      for (const r of f.wanted()) f.resolve(r.key, image())
    })
    expect(sheet).not.toHaveAttribute('aria-busy')
  })

  it('is not busy for a page of originals', () => {
    show(fakeStudyTiles(), pageModel([drawTile()]))
    expect(screen.getByRole('group', { name: 'Page 1' })).not.toHaveAttribute('aria-busy')
  })

  it('names study tiles "<name>, <Version>" and keeps the plain name for the original (M2-R14)', () => {
    show()
    expect(screen.getByRole('button', { name: 'pears.heic' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'pears.heic, Blurred' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'pears.heic, Values' })).toBeInTheDocument()
  })

  it('shows a version chip on every tile of a group, hidden from assistive tech', () => {
    show()
    for (const label of ['Original', 'Blurred', 'Values']) {
      const chip = screen.getByText(label)
      expect(chip.closest('[aria-hidden="true"]')).not.toBeNull()
    }
  })

  it('marks every tile of the selected image pressed, with one name tag for the group', () => {
    const f = fakeStudyTiles()
    render(<PagePreview {...props(f, group, { selectedId: id('a') })} />)
    for (const name of ['pears.heic', 'pears.heic, Blurred', 'pears.heic, Values'])
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByText('pears.heic')).toHaveLength(1)
  })

  it('shows no version chip on a tile that is not in a group', () => {
    show(fakeStudyTiles(), pageModel([drawTile({ trim: { x: 10, y: 10, w: 60, h: 80 } })]))
    expect(screen.queryByText('Original')).toBeNull()
  })

  it('shows the low-DPI chip on the first tile only but describes every tile (M2-R13)', () => {
    show()
    expect(screen.getAllByText(/^\d+ DPI$/)).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'pears.heic' })).toHaveTextContent(/\d+ DPI/)
    for (const name of ['pears.heic', 'pears.heic, Blurred', 'pears.heic, Values'])
      expect(screen.getByRole('button', { name })).toHaveAccessibleDescription(/Low resolution/)
  })

  it('shows the scaled-to-fit chip on the first tile only but describes every tile (M2-R13)', () => {
    const scaled = pageModel(
      group.tiles.map((t) => ({ ...t, lowDpi: false, scaledToFit: true })),
      { groups: group.groups },
    )
    show(fakeStudyTiles(), scaled)
    expect(screen.getAllByText('Scaled to fit')).toHaveLength(1)
    for (const name of ['pears.heic', 'pears.heic, Blurred', 'pears.heic, Values'])
      expect(screen.getByRole('button', { name })).toHaveAccessibleDescription(/Scaled down/)
  })

  it('without a provider, study tiles draw the missing fill and the page still works', () => {
    render(
      <PagePreview
        model={group}
        getSource={() => ({ bitmap, pxW: 480, pxH: 640 })}
        selectedId={null}
        onSelect={vi.fn()}
        guides={false}
        label="p"
      />,
    )
    expect(lastTileImage(0)).not.toBeNull()
    expect(lastTileImage(1)).toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(3)
    expect(screen.getByRole('group', { name: 'p' })).not.toHaveAttribute('aria-busy')
  })
})
