import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useImages } from '../../images'
import { makeLoadedImage } from '../../images/test-utils'
import { initI18n } from '../../../shared/i18n'
import type { ImageId } from '../../../shared/model/image'
import { DEFAULT_LINES, type LineSettings } from '../../../shared/model/lines'
import {
  detectionKey,
  INITIAL_DETECTIONS,
  useDetections,
  type DetectionStatus,
  type GuideKind,
} from '../detect/store'
import type { DetectionActions } from './detection-actions'
import { DetectionsProvider } from './detections-context'
import { useDetailDraft } from './detail-draft'
import { LinesPanel, type LinesPanelProps } from './LinesPanel'

const A = 'a' as ImageId
const B = 'b' as ImageId
const WAITING = 'Waiting for photos to finish importing…'
const DOWNLOAD = 'Download & turn on'
const NO_WEBGL = 'Face and pose guides need WebGL, which this browser has turned off.'

const with_ = (over: Partial<LineSettings>): LineSettings => ({ ...DEFAULT_LINES, ...over })
const EDGES_ON = with_({ edges: { on: true, detailPct: 50 } })
const FACE_ON = with_({ face: true })
const POSE_ON = with_({ pose: true })
const ALL_ON = with_({ edges: { on: true, detailPct: 50 }, face: true, pose: true })

function seed(a: LineSettings = DEFAULT_LINES, b: LineSettings = DEFAULT_LINES) {
  useImages.setState({
    images: [
      makeLoadedImage({ id: A, name: 'a.jpg', lines: a }),
      makeLoadedImage({ id: B, name: 'b.jpg', lines: b }),
    ],
    selectedId: A,
    importing: 0,
  })
}
const image = (id: ImageId = A) => {
  const img = useImages.getState().images.find((i) => i.id === id)
  if (!img) throw new Error('no image')
  return img
}
const lines = (id: ImageId = A) => image(id).lines

function setStatus(kind: GuideKind, status: DetectionStatus | null, id: ImageId = A) {
  act(() => {
    useDetections.setState((s) => {
      const next = new Map(s.status)
      const key = detectionKey(kind, image(id))
      if (status === null) next.delete(key)
      else next.set(key, status)
      return { status: next }
    })
  })
}

function fakeActions(over: Partial<DetectionActions> = {}): DetectionActions {
  return {
    download: vi.fn<DetectionActions['download']>(),
    retry: vi.fn<DetectionActions['retry']>(),
    landmarksSupported: true,
    ...over,
  }
}

function renderPanel(props: Partial<LinesPanelProps> = {}, actions = fakeActions()) {
  const view = render(
    <DetectionsProvider value={actions}>
      <LinesPanel imageId={A} {...props} />
    </DetectionsProvider>,
  )
  const rerender = (next: Partial<LinesPanelProps>) => {
    view.rerender(
      <DetectionsProvider value={actions}>
        <LinesPanel imageId={A} {...props} {...next} />
      </DetectionsProvider>,
    )
  }
  return { ...view, rerender, actions }
}

const section = () => screen.getByRole('region', { name: 'Guides from the photo' })
/** design/errors.html E6: the alert holds the message only; its buttons sit beside it. */
const expectAlertWithoutActions = (alert: HTMLElement) => {
  expect(within(alert).queryAllByRole('button')).toHaveLength(0)
  expect(alert).not.toHaveTextContent('Try again Turn off')
  expect(alert).not.toHaveTextContent(/Turn off (face|pose) guides/)
}
const liveRegion = () => {
  const regions = screen.getAllByRole('status')
  expect(regions).toHaveLength(1)
  const [region] = regions
  if (!region) throw new Error('no status region')
  expect(region).toHaveAttribute('aria-live', 'polite')
  return region
}

let fetchSpy: ReturnType<typeof vi.fn>
beforeAll(async () => {
  await initI18n()
})
beforeEach(() => {
  seed()
  useDetections.setState(INITIAL_DETECTIONS, true)
  fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  useDetailDraft.setState({ pending: false })
})

describe('GuidesSection', () => {
  describe('placement', () => {
    it('renders after Composition and before Line style, with the heading "Guides from the photo" and the "On device" badge', () => {
      renderPanel()
      expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
        'Composition',
        'Guides from the photo',
        'Line style',
      ])
      const regions = screen.getAllByRole('region').map((r) => r.getAttribute('aria-labelledby'))
      const names = regions.map((id) => (id ? document.getElementById(id)?.textContent : null))
      expect(names).toEqual(['Composition', 'Guides from the photo', 'Line style'])
      const badge = within(section()).getByText('On device')
      expect(badge).toHaveClass('ds-badge', 'ds-badge--success')
      expect(badge.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
      expect(screen.getByRole('heading', { name: 'Guides from the photo' })).not.toContainElement(
        badge,
      )
    })

    it('follows headingLevel', () => {
      renderPanel({ headingLevel: 4 })
      expect(screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual([
        'Composition',
        'Guides from the photo',
        'Line style',
      ])
      expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
    })

    it('lists Edge outline, Face construction and Body pose, all off by default', () => {
      renderPanel()
      const switches = within(section()).getAllByRole('switch')
      expect(switches.map((s) => s.getAttribute('aria-checked'))).toEqual([
        'false',
        'false',
        'false',
      ])
      expect(switches).toEqual([
        screen.getByRole('switch', { name: 'Edge outline' }),
        screen.getByRole('switch', { name: 'Face construction' }),
        screen.getByRole('switch', { name: 'Body pose' }),
      ])
    })

    it("no image selected → the section isn't shown (the panel shows its hint)", () => {
      renderPanel({ imageId: null })
      expect(screen.getByText('Add a photo, or select one, to draw lines on it.')).toBeVisible()
      expect(screen.queryByText('Guides from the photo')).not.toBeInTheDocument()
    })

    it("isn't shown outside a DetectionsProvider", () => {
      render(<LinesPanel imageId={A} />)
      expect(screen.queryByText('Guides from the photo')).not.toBeInTheDocument()
      expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2)
    })
  })

  describe('switches', () => {
    it.each([
      ['Edge outline', (l: LineSettings) => l.edges.on],
      ['Face construction', (l: LineSettings) => l.face],
      ['Body pose', (l: LineSettings) => l.pose],
    ] as const)('%s turns its own guide on and off for this image only', async (name, read) => {
      const user = userEvent.setup()
      renderPanel()
      const sw = screen.getByRole('switch', { name })
      await user.click(sw)
      expect(read(lines(A))).toBe(true)
      expect(sw).toHaveAttribute('aria-checked', 'true')
      expect(read(lines(B))).toBe(false)
      const others = with_({})
      expect({ ...lines(A), edges: others.edges, face: false, pose: false }).toEqual(others)
      await user.click(sw)
      expect(read(lines(A))).toBe(false)
    })
  })

  describe('Edge outline', () => {
    it('reveals the Detail slider (1–100, value text "50%") only when on', async () => {
      const user = userEvent.setup()
      renderPanel()
      expect(screen.queryByRole('slider', { name: 'Detail' })).not.toBeInTheDocument()
      await user.click(screen.getByRole('switch', { name: 'Edge outline' }))
      const detail = screen.getByRole('slider', { name: 'Detail' })
      expect(detail).toHaveAttribute('min', '1')
      expect(detail).toHaveAttribute('max', '100')
      expect(detail).toHaveValue('50')
      expect(detail).toHaveAttribute('aria-valuetext', '50%')
      expect(within(section()).getByText('50%')).toBeVisible()
    })

    it('commits the detail 80 ms after it settles: one updateLines per settled value', () => {
      vi.useFakeTimers()
      seed(EDGES_ON)
      const spy = vi.spyOn(useImages.getState(), 'updateLines')
      renderPanel()
      const detail = screen.getByRole('slider', { name: 'Detail' })
      fireEvent.change(detail, { target: { value: '60' } })
      fireEvent.change(detail, { target: { value: '70' } })
      expect(detail).toHaveAttribute('aria-valuetext', '70%')
      act(() => {
        vi.advanceTimersByTime(79)
      })
      expect(spy).not.toHaveBeenCalled()
      fireEvent.change(detail, { target: { value: '72' } })
      act(() => {
        vi.advanceTimersByTime(79)
      })
      expect(spy).not.toHaveBeenCalled()
      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(spy).toHaveBeenCalledOnce()
      expect(spy).toHaveBeenCalledWith(A, { edges: { detailPct: 72 } })
      expect(lines(A).edges.detailPct).toBe(72)
      expect(detail).toHaveAttribute('aria-valuetext', '72%')
      fireEvent.change(detail, { target: { value: '30' } })
      act(() => {
        vi.advanceTimersByTime(80)
      })
      expect(spy).toHaveBeenCalledTimes(2)
      expect(spy).toHaveBeenLastCalledWith(A, { edges: { detailPct: 30 } })
      spy.mockRestore()
    })

    it('marks the detail as a draft from the change until its commit, and on unmount', () => {
      vi.useFakeTimers()
      seed(EDGES_ON)
      const { unmount } = renderPanel()
      const detail = screen.getByRole('slider', { name: 'Detail' })
      expect(useDetailDraft.getState().pending).toBe(false)
      fireEvent.change(detail, { target: { value: '60' } })
      expect(useDetailDraft.getState().pending).toBe(true)
      act(() => {
        vi.advanceTimersByTime(79)
      })
      expect(useDetailDraft.getState().pending).toBe(true)
      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(lines(A).edges.detailPct).toBe(60)
      expect(useDetailDraft.getState().pending).toBe(false)

      fireEvent.change(detail, { target: { value: '70' } })
      expect(useDetailDraft.getState().pending).toBe(true)
      unmount()
      expect(lines(A).edges.detailPct).toBe(70)
      expect(useDetailDraft.getState().pending).toBe(false)
    })

    it('a pending detail goes to the image it was set on, even if another is selected meanwhile', () => {
      vi.useFakeTimers()
      seed(EDGES_ON, EDGES_ON)
      const { rerender } = renderPanel()
      fireEvent.change(screen.getByRole('slider', { name: 'Detail' }), { target: { value: '90' } })
      act(() => {
        useImages.setState({ selectedId: B })
      })
      rerender({ imageId: B })
      expect(screen.getByRole('slider', { name: 'Detail' })).toHaveAttribute(
        'aria-valuetext',
        '50%',
      )
      act(() => {
        vi.advanceTimersByTime(80)
      })
      expect(lines(A).edges.detailPct).toBe(90)
      expect(lines(B).edges.detailPct).toBe(50)
    })

    it("moving the next image's detail before the first settles keeps both values", () => {
      vi.useFakeTimers()
      seed(EDGES_ON, EDGES_ON)
      const { rerender } = renderPanel()
      fireEvent.change(screen.getByRole('slider', { name: 'Detail' }), { target: { value: '90' } })
      rerender({ imageId: B })
      fireEvent.change(screen.getByRole('slider', { name: 'Detail' }), { target: { value: '20' } })
      expect(lines(A).edges.detailPct).toBe(90)
      act(() => {
        vi.advanceTimersByTime(80)
      })
      expect(lines(A).edges.detailPct).toBe(90)
      expect(lines(B).edges.detailPct).toBe(20)
    })

    it.each(['0', '101', '50.5'])('ignores the raw value %s', (raw) => {
      vi.useFakeTimers()
      seed(with_({ edges: { on: true, detailPct: 40 } }))
      const spy = vi.spyOn(useImages.getState(), 'updateLines')
      renderPanel()
      const detail = screen.getByRole('slider', { name: 'Detail' })
      Object.defineProperty(detail, 'value', { configurable: true, get: () => raw })
      fireEvent.change(detail)
      act(() => {
        vi.advanceTimersByTime(80)
      })
      expect(spy).not.toHaveBeenCalled()
      expect(detail).toHaveAttribute('aria-valuetext', '40%')
      spy.mockRestore()
    })

    it('a pending detail is committed when the panel closes', () => {
      vi.useFakeTimers()
      seed(EDGES_ON)
      const { unmount } = renderPanel()
      fireEvent.change(screen.getByRole('slider', { name: 'Detail' }), { target: { value: '15' } })
      unmount()
      expect(lines(A).edges.detailPct).toBe(15)
    })

    it('shows "Tracing the outline…", then "Outline traced."', () => {
      seed(EDGES_ON)
      renderPanel()
      setStatus('edges', { state: 'running' })
      expect(within(section()).getByText('Tracing the outline…')).toBeVisible()
      setStatus('edges', { state: 'done', found: 12 })
      expect(within(section()).queryByText('Tracing the outline…')).not.toBeInTheDocument()
      expect(within(section()).getByText('Outline traced.')).toBeVisible()
    })

    it('says when the outline finds no edges at this Detail (owner Q16, default)', () => {
      seed(EDGES_ON)
      renderPanel()
      const region = liveRegion()
      setStatus('edges', { state: 'running' })
      setStatus('edges', { state: 'done', found: 0 })
      const none = 'No edges found at this Detail. Try a higher Detail.'
      expect(within(section()).getByText(none)).toBeVisible()
      expect(within(section()).queryByText('Outline traced.')).not.toBeInTheDocument()
      expect(region).toHaveTextContent(none)
    })

    it('a failure is an alert, "Couldn\'t trace the outline.", with Try again', async () => {
      const user = userEvent.setup()
      seed(EDGES_ON)
      const { actions } = renderPanel()
      setStatus('edges', { state: 'failed', reason: 'error' })
      const alert = within(section()).getByRole('alert')
      expect(alert).toHaveTextContent("Couldn't trace the outline.")
      expectAlertWithoutActions(alert)
      await user.click(within(section()).getByRole('button', { name: 'Try again' }))
      expect(actions.retry).toHaveBeenCalledWith('edges', A)
      expect(lines(A).edges.on).toBe(true)
    })

    it("reads the status of the image's current detail and crop", () => {
      seed(EDGES_ON)
      renderPanel()
      act(() => {
        useDetections.setState({
          status: new Map([
            [
              detectionKey('edges', {
                ...image(),
                lines: with_({ edges: { on: true, detailPct: 80 } }),
              }),
              { state: 'running' },
            ],
          ]),
        })
      })
      expect(within(section()).queryByText('Tracing the outline…')).not.toBeInTheDocument()
    })
  })

  describe.each([
    {
      kind: 'face' as const,
      model: 'face' as const,
      on: FACE_ON,
      sw: 'Face construction',
      why: "Face guides use a small AI model. It's saved on this device and runs offline. Your photos are never uploaded.",
      bytes: 15_200_000,
      size: 'One-time download: 15.2 MB',
      progress: 'Face model download',
      downloading: 'Downloading face model…',
      running: 'Finding faces…',
      found: 'Face guides on. Brow, eye, nose and chin lines added.',
      none: 'No face found in this image.',
      noneHint: 'Face guides work best with a clear front or ¾ view.',
      failed: "Couldn't download the face model",
      turnOff: 'Turn off face guides',
      error: "Couldn't look for faces in this image",
      read: (l: LineSettings) => l.face,
    },
    {
      kind: 'pose' as const,
      model: 'pose' as const,
      on: POSE_ON,
      sw: 'Body pose',
      why: "Pose lines use a small AI model. It's saved on this device and runs offline. Your photos are never uploaded.",
      bytes: 20_900_000,
      size: 'One-time download: 20.9 MB',
      progress: 'Pose model download',
      downloading: 'Downloading pose model…',
      running: 'Finding the pose…',
      found: 'Pose lines on.',
      none: 'No person found in this image.',
      noneHint: 'Pose lines work best when the whole body is in view.',
      failed: "Couldn't download the pose model",
      turnOff: 'Turn off pose guides',
      error: "Couldn't look for a person in this image",
      read: (l: LineSettings) => l.pose,
    },
  ])('$sw', (c) => {
    it('on with the model absent shows the download box with the size from bytesToDownload, and fetches nothing', () => {
      seed(c.on)
      const { actions } = renderPanel()
      setStatus(c.kind, { state: 'needs-download', bytes: c.bytes })
      expect(within(section()).getByText(c.size)).toBeVisible()
      expect(within(section()).getByText(c.why)).toBeVisible()
      const button = within(section()).getByRole('button', { name: DOWNLOAD })
      expect(button).toHaveAccessibleDescription(expect.stringContaining(c.size))
      expect(actions.download).not.toHaveBeenCalled()
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('"Download & turn on" calls download with its model', async () => {
      const user = userEvent.setup()
      seed(c.on)
      const { actions } = renderPanel()
      setStatus(c.kind, { state: 'needs-download', bytes: c.bytes })
      await user.click(within(section()).getByRole('button', { name: DOWNLOAD }))
      expect(actions.download).toHaveBeenCalledExactlyOnceWith(c.model)
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('while downloading: a named progressbar with its value and "4.1 of … MB"', () => {
      seed(c.on)
      renderPanel()
      setStatus(c.kind, { state: 'downloading', loaded: 4_100_000, total: c.bytes })
      const bar = within(section()).getByRole('progressbar', { name: c.progress })
      expect(bar).toHaveAttribute('aria-valuenow', String(Math.round((4_100_000 / c.bytes) * 100)))
      const total = (c.bytes / 1e6).toFixed(1)
      // Spoken once, by the bar, in words; the visible "MB" line is hidden from screen readers.
      expect(bar).toHaveAttribute('aria-valuetext', `4.1 of ${total} megabytes`)
      const visible = within(section()).getByText(`4.1 of ${total} MB`)
      expect(visible).toBeVisible()
      expect(visible).toHaveAttribute('aria-hidden', 'true')
      // No continuous announcement of the progress (owner Q18, default).
      expect(bar).not.toHaveAttribute('aria-live')
      expect(bar.closest('[aria-live], [role="status"], [role="alert"]')).toBeNull()
      expect(visible.closest('[aria-live], [role="status"], [role="alert"]')).toBeNull()
      expect(within(section()).getByText(c.downloading)).toBeVisible()
      expect(within(section()).queryByRole('button', { name: DOWNLOAD })).not.toBeInTheDocument()
    })

    it("a download whose size isn't known yet shows an indeterminate bar", () => {
      seed(c.on)
      renderPanel()
      setStatus(c.kind, { state: 'downloading', loaded: 0, total: 0 })
      const bar = within(section()).getByRole('progressbar', { name: c.progress })
      expect(bar).not.toHaveAttribute('aria-valuenow')
      expect(bar).not.toHaveAttribute('aria-valuetext')
    })

    it('switching the guide off during the download cancels it (the switch stays usable)', async () => {
      const user = userEvent.setup()
      seed(c.on)
      renderPanel()
      setStatus(c.kind, { state: 'downloading', loaded: 1, total: c.bytes })
      const sw = screen.getByRole('switch', { name: c.sw })
      expect(sw).toBeEnabled()
      await user.click(sw)
      expect(c.read(lines(A))).toBe(false)
      expect(within(section()).queryByRole('progressbar')).not.toBeInTheDocument()
    })

    it('statuses: running, then found', () => {
      seed(c.on)
      renderPanel()
      setStatus(c.kind, { state: 'running' })
      expect(within(section()).getByText(c.running)).toBeVisible()
      setStatus(c.kind, { state: 'done', found: 2 })
      expect(within(section()).getByText(c.found)).toBeVisible()
      expect(within(section()).queryByText(c.running)).not.toBeInTheDocument()
    })

    it('nothing found: the warning note, with the switch still on (owner Q7, default)', () => {
      seed(c.on)
      renderPanel()
      setStatus(c.kind, { state: 'done', found: 0 })
      const note = within(section()).getByText(c.none).closest('.ds-note')
      expect(note).toHaveClass('ds-note--warning')
      expect(note).toHaveTextContent(c.noneHint)
      expect(screen.getByRole('switch', { name: c.sw })).toHaveAttribute('aria-checked', 'true')
      expect(c.read(lines(A))).toBe(true)
      expect(within(section()).queryByText(c.found)).not.toBeInTheDocument()
    })

    it.each(['download', 'integrity'] as const)(
      'download failure (%s): an alert with Try again and Turn off',
      async (reason) => {
        const user = userEvent.setup()
        seed(c.on)
        const { actions } = renderPanel()
        setStatus(c.kind, { state: 'failed', reason })
        const alert = within(section()).getByRole('alert')
        expect(alert).toHaveTextContent(c.failed)
        expect(alert).toHaveTextContent(
          'Check your connection and try again. Other lines still work.',
        )
        expectAlertWithoutActions(alert)
        await user.click(within(section()).getByRole('button', { name: 'Try again' }))
        expect(actions.retry).toHaveBeenCalledExactlyOnceWith(c.kind, A)
        expect(c.read(lines(A))).toBe(true)
        await user.click(within(section()).getByRole('button', { name: c.turnOff }))
        expect(c.read(lines(A))).toBe(false)
        expect(within(section()).queryByRole('alert')).not.toBeInTheDocument()
      },
    )

    it('a detection error: an alert with Try again and Turn off', async () => {
      const user = userEvent.setup()
      seed(c.on)
      const { actions } = renderPanel()
      setStatus(c.kind, { state: 'failed', reason: 'error' })
      const alert = within(section()).getByRole('alert')
      expect(alert).toHaveTextContent(c.error)
      // owner Q16, default
      expect(alert).toHaveTextContent('Try again. Other lines still work.')
      expect(alert).not.toHaveTextContent(c.failed)
      expectAlertWithoutActions(alert)
      await user.click(within(section()).getByRole('button', { name: 'Try again' }))
      expect(actions.retry).toHaveBeenCalledExactlyOnceWith(c.kind, A)
      expect(within(section()).getByRole('button', { name: c.turnOff })).toBeVisible()
    })

    it('with the model cached, switching on shows no box', async () => {
      const user = userEvent.setup()
      renderPanel()
      await user.click(screen.getByRole('switch', { name: c.sw }))
      setStatus(c.kind, { state: 'running' })
      expect(within(section()).queryByRole('button', { name: DOWNLOAD })).not.toBeInTheDocument()
      expect(within(section()).queryByText(/One-time download/)).not.toBeInTheDocument()
      expect(within(section()).getByText(c.running)).toBeVisible()
    })

    it("shows nothing below the switch while it's off, whatever the store holds", () => {
      renderPanel()
      setStatus(c.kind, { state: 'failed', reason: 'download' }, A)
      expect(within(section()).queryByRole('alert')).not.toBeInTheDocument()
    })

    describe('a browser without WebGL (owner Q15, default)', () => {
      it('shows the WebGL note in place of the download box, offers no download, keeps the switch on', () => {
        seed(c.on)
        const { actions } = renderPanel({}, fakeActions({ landmarksSupported: false }))
        setStatus(c.kind, { state: 'needs-download', bytes: c.bytes })
        expect(within(section()).getByText(NO_WEBGL)).toBeVisible()
        expect(within(section()).queryByRole('button', { name: DOWNLOAD })).not.toBeInTheDocument()
        expect(within(section()).queryByText(c.size)).not.toBeInTheDocument()
        expect(screen.getByRole('switch', { name: c.sw })).toHaveAttribute('aria-checked', 'true')
        expect(actions.download).not.toHaveBeenCalled()
        expect(fetchSpy).not.toHaveBeenCalled()
      })

      it('shows the same note when the engine reports unsupported', () => {
        seed(c.on)
        renderPanel()
        setStatus(c.kind, { state: 'failed', reason: 'unsupported' })
        expect(within(section()).getByText(NO_WEBGL)).toBeVisible()
        expect(within(section()).queryByRole('alert')).not.toBeInTheDocument()
        expect(
          within(section()).queryByRole('button', { name: 'Try again' }),
        ).not.toBeInTheDocument()
      })
    })
  })

  describe('a browser without WebGL (owner Q15, default)', () => {
    it('keeps the edge outline available', async () => {
      const user = userEvent.setup()
      seed(with_({ face: true, pose: true }))
      renderPanel({}, fakeActions({ landmarksSupported: false }))
      expect(within(section()).getAllByText(NO_WEBGL)).toHaveLength(2)
      const edge = screen.getByRole('switch', { name: 'Edge outline' })
      expect(edge).toBeEnabled()
      await user.click(edge)
      expect(lines(A).edges.on).toBe(true)
      setStatus('edges', { state: 'running' })
      expect(within(section()).getByText('Tracing the outline…')).toBeVisible()
    })
  })

  describe('twins and other images', () => {
    it('shows the status of the selected image only', () => {
      seed(FACE_ON, FACE_ON)
      useImages.setState((s) => ({
        images: s.images.map((i) => (i.id === B ? { ...i, contentHash: 'other' } : i)),
      }))
      renderPanel()
      setStatus('face', { state: 'running' }, B)
      expect(within(section()).queryByText('Finding faces…')).not.toBeInTheDocument()
    })
  })

  describe('while photos are importing (M3 Q9)', () => {
    it('disables every control with the waiting hint', () => {
      seed(ALL_ON)
      useImages.setState({ importing: 1 })
      renderPanel()
      setStatus('face', { state: 'needs-download', bytes: 1_000_000 })
      setStatus('pose', { state: 'failed', reason: 'download' })
      setStatus('edges', { state: 'failed', reason: 'error' })
      const controls = [
        ...within(section()).getAllByRole('switch'),
        within(section()).getByRole('slider', { name: 'Detail' }),
        ...within(section()).getAllByRole('button'),
      ]
      expect(controls).toHaveLength(3 + 1 + 4)
      for (const control of controls) {
        expect(control).toBeDisabled()
        expect(control).toHaveAccessibleDescription(expect.stringContaining(WAITING))
      }
    })

    it('enables them again once the import ends', () => {
      seed(ALL_ON)
      useImages.setState({ importing: 1 })
      renderPanel()
      setStatus('face', { state: 'needs-download', bytes: 1_000_000 })
      act(() => {
        useImages.setState({ importing: 0 })
      })
      for (const control of [
        ...within(section()).getAllByRole('switch'),
        within(section()).getByRole('slider', { name: 'Detail' }),
        within(section()).getByRole('button', { name: DOWNLOAD }),
      ]) {
        expect(control).toBeEnabled()
      }
    })

    it('moves focus from a guide control that becomes disabled to the hint, and back after', () => {
      seed(FACE_ON)
      renderPanel()
      setStatus('face', { state: 'needs-download', bytes: 1_000_000 })
      const button = within(section()).getByRole('button', { name: DOWNLOAD })
      button.focus()
      act(() => {
        useImages.setState({ importing: 1 })
      })
      expect(document.activeElement).toBe(screen.getByText(WAITING))
      act(() => {
        useImages.setState({ importing: 0 })
      })
      expect(document.activeElement).toBe(button)
    })
  })

  describe('announcements', () => {
    it('one polite live region announces status changes once', () => {
      seed(FACE_ON)
      renderPanel()
      const region = liveRegion()
      expect(region).toBeEmptyDOMElement()
      setStatus('face', { state: 'needs-download', bytes: 15_200_000 })
      expect(region).toHaveTextContent('One-time download: 15.2 MB')
      setStatus('face', { state: 'downloading', loaded: 0, total: 15_200_000 })
      expect(region).toHaveTextContent('Downloading face model…')
      const before = region.innerHTML
      setStatus('face', { state: 'downloading', loaded: 5_000_000, total: 15_200_000 })
      expect(region.innerHTML).toBe(before)
      setStatus('face', { state: 'running' })
      expect(region).toHaveTextContent('Finding faces…')
      setStatus('face', { state: 'done', found: 0 })
      expect(region).toHaveTextContent(
        'No face found in this image. Face guides work best with a clear front or ¾ view.',
      )
      expect(liveRegion()).toBe(region)
    })

    it('leaves failures to their alert, so nothing is announced twice', () => {
      seed(FACE_ON)
      renderPanel()
      const region = liveRegion()
      setStatus('face', { state: 'running' })
      setStatus('face', { state: 'failed', reason: 'download' })
      expect(region).toHaveTextContent('Finding faces…')
      expect(region).not.toHaveTextContent("Couldn't download")
      expect(screen.getByRole('alert')).toHaveTextContent("Couldn't download the face model")
    })

    it('announces the WebGL note (owner Q15, default)', async () => {
      const user = userEvent.setup()
      renderPanel({}, fakeActions({ landmarksSupported: false }))
      const region = liveRegion()
      await user.click(screen.getByRole('switch', { name: 'Body pose' }))
      expect(region).toHaveTextContent(NO_WEBGL)
    })

    it("announces the edge outline's progress when it's switched on", async () => {
      const user = userEvent.setup()
      renderPanel()
      const region = liveRegion()
      await user.click(screen.getByRole('switch', { name: 'Edge outline' }))
      setStatus('edges', { state: 'running' })
      expect(region).toHaveTextContent(/^Tracing the outline…$/)
      setStatus('edges', { state: 'done', found: 3 })
      expect(region).toHaveTextContent(/^Outline traced\.$/)
    })

    describe('after a Detail change, only the result is announced (owner Q19, default)', () => {
      const setDetail = (pct: number) => {
        act(() => {
          useImages.getState().updateLines(A, { edges: { detailPct: pct } })
        })
      }

      it.each([
        [3, 'Outline traced.'],
        [0, 'No edges found at this Detail. Try a higher Detail.'],
      ] as const)('found %i → "%s", never "Tracing the outline…"', (found, result) => {
        seed(EDGES_ON)
        renderPanel()
        const region = liveRegion()
        setStatus('edges', { state: 'done', found: 3 })
        const before = region.firstChild
        setDetail(60)
        expect(lines(A).edges.detailPct).toBe(60)
        setStatus('edges', { state: 'running' })
        // The visible status still says so; the region keeps its last announcement.
        expect(within(section()).getByText('Tracing the outline…')).toBeVisible()
        expect(region.firstChild).toBe(before)
        expect(region).not.toHaveTextContent('Tracing the outline…')
        setStatus('edges', { state: 'done', found })
        expect(region).toHaveTextContent(new RegExp(`^${result.replace(/\./g, '\\.')}$`))
        expect(region.firstChild).not.toBe(before)
      })

      it('also when the panel opens on a traced outline', () => {
        seed(EDGES_ON)
        setStatus('edges', { state: 'done', found: 3 })
        renderPanel()
        const region = liveRegion()
        setDetail(70)
        setStatus('edges', { state: 'running' })
        expect(region).toBeEmptyDOMElement()
        setStatus('edges', { state: 'done', found: 3 })
        expect(region).toHaveTextContent(/^Outline traced\.$/)
      })

      it('switching the outline off and on again announces both messages', async () => {
        const user = userEvent.setup()
        seed(EDGES_ON)
        renderPanel()
        const region = liveRegion()
        setStatus('edges', { state: 'done', found: 3 })
        const sw = screen.getByRole('switch', { name: 'Edge outline' })
        await user.click(sw)
        // No result kept for this Detail: switching on traces it again.
        setStatus('edges', null)
        await user.click(sw)
        setStatus('edges', { state: 'running' })
        expect(region).toHaveTextContent(/^Tracing the outline…$/)
        setStatus('edges', { state: 'done', found: 3 })
        expect(region).toHaveTextContent(/^Outline traced\.$/)
      })

      it('"Try again" after a failure announces both messages', () => {
        seed(EDGES_ON)
        renderPanel()
        const region = liveRegion()
        setStatus('edges', { state: 'done', found: 3 })
        setDetail(60)
        setStatus('edges', { state: 'failed', reason: 'error' })
        setStatus('edges', { state: 'running' })
        expect(region).toHaveTextContent(/^Tracing the outline…$/)
      })
    })

    it('joins two changes that land together into one announcement', () => {
      seed(ALL_ON)
      renderPanel()
      const region = liveRegion()
      act(() => {
        useDetections.setState({
          status: new Map([
            [detectionKey('face', image()), { state: 'running' }],
            [detectionKey('pose', image()), { state: 'running' }],
          ]),
        })
      })
      expect(region).toHaveTextContent('Finding faces… Finding the pose…')
      expect(region.children).toHaveLength(1)
    })

    it('announces only the guide that changed', () => {
      seed(ALL_ON)
      renderPanel()
      const region = liveRegion()
      setStatus('face', { state: 'running' })
      setStatus('pose', { state: 'running' })
      expect(region).toHaveTextContent(/^Finding the pose…$/)
      setStatus('edges', { state: 'running' })
      expect(region).toHaveTextContent(/^Tracing the outline…$/)
    })

    it('says nothing on first render or when another image is selected', () => {
      seed(FACE_ON, POSE_ON)
      setStatus('face', { state: 'running' }, A)
      setStatus('pose', { state: 'done', found: 1 }, B)
      const { rerender } = renderPanel()
      const region = liveRegion()
      expect(within(section()).getByText('Finding faces…')).toBeVisible()
      expect(region).toBeEmptyDOMElement()
      rerender({ imageId: B })
      expect(within(section()).getByText('Pose lines on.')).toBeVisible()
      expect(region).toBeEmptyDOMElement()
    })

    it.each<{
      readonly name: string
      readonly webgl: boolean
      readonly face: DetectionStatus
      readonly pose: DetectionStatus
      readonly edges: DetectionStatus
      readonly shown: readonly string[]
    }>([
      {
        name: 'face and pose found, the outline running',
        webgl: true,
        face: { state: 'done', found: 1 },
        pose: { state: 'done', found: 1 },
        edges: { state: 'running' },
        shown: [
          'Face guides on. Brow, eye, nose and chin lines added.',
          'Pose lines on.',
          'Tracing the outline…',
        ],
      },
      {
        name: 'nothing found, a download, the outline traced',
        webgl: true,
        face: { state: 'done', found: 0 },
        pose: { state: 'downloading', loaded: 1, total: 2_000_000 },
        edges: { state: 'done', found: 1 },
        shown: ['No face found in this image.', 'Downloading pose model…', 'Outline traced.'],
      },
      {
        name: 'face and pose running, no edges found',
        webgl: true,
        face: { state: 'running' },
        pose: { state: 'running' },
        edges: { state: 'done', found: 0 },
        shown: [
          'Finding faces…',
          'Finding the pose…',
          'No edges found at this Detail. Try a higher Detail.',
        ],
      },
      {
        name: 'the WebGL note (owner Q15, default)',
        webgl: false,
        face: { state: 'needs-download', bytes: 1 },
        pose: { state: 'failed', reason: 'unsupported' },
        edges: { state: 'running' },
        shown: [NO_WEBGL, 'Tracing the outline…'],
      },
    ])('the visible statuses are not live regions themselves: $name', (c) => {
      seed(ALL_ON)
      renderPanel({}, fakeActions({ landmarksSupported: c.webgl }))
      setStatus('face', c.face)
      setStatus('pose', c.pose)
      setStatus('edges', c.edges)
      for (const text of c.shown) expect(within(section()).getAllByText(text)[0]).toBeVisible()
      expect(section().querySelectorAll('[aria-live], [role="status"]')).toHaveLength(0)
    })

    it('shares the region with "Apply lines to all images"', async () => {
      const user = userEvent.setup()
      seed(EDGES_ON)
      renderPanel()
      const region = liveRegion()
      await user.click(screen.getByRole('button', { name: 'Apply lines to all images' }))
      expect(region).toHaveTextContent('Line settings copied to 1 image.')
      setStatus('edges', { state: 'running' })
      expect(region).toHaveTextContent('Tracing the outline…')
      expect(region).not.toHaveTextContent('copied')
    })
  })

  describe('focus', () => {
    it('moves to the switch when "Download & turn on" gives way to the progress', async () => {
      const user = userEvent.setup()
      seed(FACE_ON)
      renderPanel()
      setStatus('face', { state: 'needs-download', bytes: 15_200_000 })
      await user.click(within(section()).getByRole('button', { name: DOWNLOAD }))
      setStatus('face', { state: 'downloading', loaded: 0, total: 15_200_000 })
      expect(document.activeElement).toBe(screen.getByRole('switch', { name: 'Face construction' }))
    })

    it.each([
      ['Try again', true],
      ['Turn off pose guides', false],
    ] as const)('moves to the switch when "%s" disappears', async (name, on) => {
      const user = userEvent.setup()
      seed(POSE_ON)
      renderPanel()
      setStatus('pose', { state: 'failed', reason: 'download' })
      await user.click(within(section()).getByRole('button', { name }))
      if (on) setStatus('pose', { state: 'running' })
      expect(lines(A).pose).toBe(on)
      expect(document.activeElement).toBe(screen.getByRole('switch', { name: 'Body pose' }))
    })

    it('moves to the Edge outline switch when its Try again disappears', async () => {
      const user = userEvent.setup()
      seed(EDGES_ON)
      renderPanel()
      setStatus('edges', { state: 'failed', reason: 'error' })
      await user.click(within(section()).getByRole('button', { name: 'Try again' }))
      setStatus('edges', { state: 'running' })
      expect(document.activeElement).toBe(screen.getByRole('switch', { name: 'Edge outline' }))
    })

    it('stays where it is when the user has moved on', async () => {
      const user = userEvent.setup()
      seed(FACE_ON)
      renderPanel()
      setStatus('face', { state: 'needs-download', bytes: 15_200_000 })
      await user.click(within(section()).getByRole('button', { name: DOWNLOAD }))
      const apply = screen.getByRole('button', { name: 'Apply lines to all images' })
      apply.focus()
      setStatus('face', { state: 'downloading', loaded: 0, total: 15_200_000 })
      expect(document.activeElement).toBe(apply)
    })
  })

  describe('keyboard', () => {
    it('Tab reaches the section after Composition; Space toggles; Enter downloads', async () => {
      const user = userEvent.setup()
      const { actions } = renderPanel()
      screen.getByRole('switch', { name: 'Centre lines' }).focus()
      await user.tab()
      expect(document.activeElement).toBe(screen.getByRole('switch', { name: 'Edge outline' }))
      await user.keyboard(' ')
      expect(lines(A).edges.on).toBe(true)
      await user.tab()
      expect(document.activeElement).toBe(screen.getByRole('slider', { name: 'Detail' }))
      await user.tab()
      expect(document.activeElement).toBe(screen.getByRole('switch', { name: 'Face construction' }))
      await user.keyboard(' ')
      setStatus('face', { state: 'needs-download', bytes: 15_200_000 })
      await user.tab()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: DOWNLOAD }))
      await user.keyboard('{Enter}')
      expect(actions.download).toHaveBeenCalledExactlyOnceWith('face')
      await user.tab()
      expect(document.activeElement).toBe(screen.getByRole('switch', { name: 'Body pose' }))
    })
  })
})
