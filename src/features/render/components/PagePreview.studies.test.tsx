import { act, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../../shared/i18n'
import { DEFAULT_LINES, type LinesPatch, patchLines } from '../../../shared/model/lines'
import { tileLinesFor } from '../page-model/tile-lines'
import type { PageModel, TileLines } from '../types'
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

const renderSpy = vi.hoisted(() => vi.fn())
const releaseSpy = vi.hoisted(() => vi.fn())
vi.mock('../pixels/render-tile', async (orig) => {
  const actual = await orig<typeof import('../pixels/render-tile')>()
  return {
    ...actual,
    renderTile: (...a: Parameters<typeof actual.renderTile>) => {
      renderSpy(...a)
      return actual.renderTile(...a)
    },
    releaseCanvas: (...a: Parameters<typeof actual.releaseCanvas>) => {
      releaseSpy(...a)
      actual.releaseCanvas(...a)
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
  renderSpy.mockClear()
  releaseSpy.mockClear()
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

  it('renders only the original tiles on the main thread; study tiles never enter the tile cache', () => {
    const { f } = show()
    expect(renderSpy).toHaveBeenCalledTimes(1)
    act(() => {
      for (const r of f.wanted()) f.resolve(r.key, image())
    })
    expect(renderSpy).toHaveBeenCalledTimes(1)
  })

  it('wants study tiles and reports busy before the sheet is measured', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(0)
    const { f } = show()
    expect(drawSpy).not.toHaveBeenCalled()
    expect(f.wanted()).toHaveLength(2)
    expect(screen.getByRole('group', { name: 'Page 1' })).toHaveAttribute('aria-busy', 'true')
  })

  it('keeps its wants and one subscription after a StrictMode remount', () => {
    const f = fakeStudyTiles()
    render(
      <StrictMode>
        <PagePreview {...props(f, group)} />
      </StrictMode>,
    )
    expect(f.wanted()).toHaveLength(2)
    expect(f.listenerCount()).toBe(1)
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

  it('names the image, without a version, on the tag of a group that has no original', () => {
    const studiesOnly = pageModel(group.tiles.slice(1), { groups: group.groups })
    render(<PagePreview {...props(fakeStudyTiles(), studiesOnly, { selectedId: id('a') })} />)
    expect(screen.getByText('pears.heic')).toHaveAttribute('aria-hidden', 'true')
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

  it('redraws a line-only change from the cached tiles: no tile render, release or new study key (M3-R5)', () => {
    const linesFor = (patch: LinesPatch): TileLines[] =>
      group.tiles.flatMap(
        (t, i) => tileLinesFor(patchLines(DEFAULT_LINES, patch), t.trim, false, i) ?? [],
      )
    expect(linesFor({ thirds: true })).toHaveLength(3)
    const { f, rerender } = show()
    const keys = f.wanted().map((r) => r.key)
    const draws = drawSpy.mock.calls.length
    expect(renderSpy).toHaveBeenCalledTimes(1)
    for (const lines of [
      linesFor({ thirds: true }),
      linesFor({
        thirds: true,
        spiral: { on: true },
        style: { colour: '#102030', opacityPct: 40 },
      }),
      [],
    ]) {
      const changed = { ...group, lines }
      rerender(<PagePreview {...props(f, changed)} />)
      expect(drawSpy.mock.calls.at(-1)?.[1]).toBe(changed)
      expect(f.wanted().map((r) => r.key)).toEqual(keys)
    }
    expect(drawSpy.mock.calls.length).toBe(draws + 3)
    expect(renderSpy).toHaveBeenCalledTimes(1)
    expect(releaseSpy).not.toHaveBeenCalled()
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
