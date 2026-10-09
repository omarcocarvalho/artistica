import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useImages } from '../../images'
import type { ImageDescriptor, ImageId } from '../../../shared/model/image'
import { MAX_EDGE_DETAIL, MIN_EDGE_DETAIL, type LinesPatch } from '../../../shared/model/lines'
import { Badge, Button, Callout, Slider, Switch } from '../../../shared/ui'
import type { AiModel, GuideKind } from '../detect/store'
import { useDetailDraft } from './detail-draft'
import { useDetectionActions, type DetectionActions } from './detection-actions'
import { DownloadBox } from './DownloadBox'
import { formatMb, guideView, useGuideStatus, type GuideView } from './use-guide-status'

export const DETAIL_SETTLE_MS = 80

export interface GuidesSectionProps {
  readonly imageId: ImageId
  readonly headingLevel: 3 | 4
  readonly waiting: boolean
  /** Id of the import-wait hint while waiting. */
  readonly describedBy: string | undefined
  /** Speaks a status change through the panel's one live region. */
  readonly onAnnounce: (text: string) => void
}

const KINDS = ['edges', 'face', 'pose'] as const satisfies readonly GuideKind[]
const MODELS = ['face', 'pose'] as const satisfies readonly AiModel[]

type Translate = ReturnType<typeof useTranslation<'lines'>>['t']

/** What one guide's status says through the panel's live region. */
interface Spoken {
  readonly text: string | null
  /** `result`: a finished search is shown; `clear`: forget it; `keep`: leave it as it was. */
  readonly memo: 'result' | 'clear' | 'keep'
  /** Not spoken while the guide's last shown status is a result (owner Q19, default). */
  readonly quietAfterResult?: true
}

function announcement(t: Translate, kind: GuideKind, on: boolean, view: GuideView): Spoken {
  switch (view.view) {
    case 'box':
      return { text: t('guides.size', { mb: formatMb(view.bytes) }), memo: 'clear' }
    case 'downloading':
      return { text: kind === 'edges' ? null : t(`guides.${kind}.downloading`), memo: 'clear' }
    case 'running':
      // After a Detail change (or a crop) re-traces a shown outline, only the new result is
      // spoken; switching the outline on, or "Try again", speaks both (owner Q19, default).
      return kind === 'edges'
        ? { text: t('guides.edges.running'), memo: 'keep', quietAfterResult: true }
        : { text: t(`guides.${kind}.running`), memo: 'keep' }
    case 'found':
      return {
        text: kind === 'edges' ? t('guides.edges.done') : t(`guides.${kind}.found`),
        memo: 'result',
      }
    case 'none-found':
      return {
        text:
          kind === 'edges'
            ? t('guides.edges.none')
            : `${t(`guides.${kind}.none`)} ${t(`guides.${kind}.noneHint`)}`,
        memo: 'result',
      }
    case 'unsupported':
      return { text: t('guides.noWebGL'), memo: 'clear' }
    case 'idle':
      // On with no status yet: the new search has not started (e.g. a Detail just committed).
      return { text: null, memo: on ? 'keep' : 'clear' }
    case 'failed':
    case 'download-failed':
      return { text: null, memo: 'clear' }
  }
}

/** "Guides from the photo" (design/lines.html): edge outline, face construction and body pose. */
export function GuidesSection(props: GuidesSectionProps) {
  const actions = useDetectionActions()
  const image = useImages((s) => s.images.find((i) => i.id === props.imageId))
  if (!actions || !image) return null
  return <Guides {...props} image={image} actions={actions} />
}

function Guides({
  image,
  actions,
  headingLevel,
  waiting,
  describedBy,
  onAnnounce,
}: GuidesSectionProps & { readonly image: ImageDescriptor; readonly actions: DetectionActions }) {
  const { t } = useTranslation('lines')
  const Heading = headingLevel === 4 ? 'h4' : 'h3'
  const headingId = useId()
  const { id, lines } = image
  const patch = (p: LinesPatch) => {
    useImages.getState().updateLines(id, p)
  }

  const views: Record<GuideKind, GuideView> = {
    edges: guideView('edges', lines.edges.on, useGuideStatus('edges', image), true),
    face: guideView('face', lines.face, useGuideStatus('face', image), actions.landmarksSupported),
    pose: guideView('pose', lines.pose, useGuideStatus('pose', image), actions.landmarksSupported),
  }
  const on: Record<GuideKind, boolean> = {
    edges: lines.edges.on,
    face: lines.face,
    pose: lines.pose,
  }
  useAnnounceChanges(
    id,
    KINDS.map((kind) => announcement(t, kind, on[kind], views[kind])),
    onAnnounce,
  )
  const detail = useSettledDetail(id, lines.edges.detailPct)

  const shared = { image, actions, waiting, describedBy, patch }
  return (
    <section className="border-line flex flex-col gap-3 border-b py-4" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center gap-2">
        <Heading id={headingId} className="font-display text-base">
          {t('guides.heading')}
        </Heading>
        <Badge tone="success" icon="shield">
          {t('guides.onDevice')}
        </Badge>
      </div>

      <GuideGroup>
        <Switch
          label={t('type.edges')}
          checked={lines.edges.on}
          disabled={waiting}
          describedBy={describedBy}
          onCheckedChange={(on) => {
            patch({ edges: { on } })
          }}
        />
        {lines.edges.on && (
          <>
            <Slider
              label={t('guides.detail.label')}
              value={detail.value}
              min={MIN_EDGE_DETAIL}
              max={MAX_EDGE_DETAIL}
              disabled={waiting}
              describedBy={describedBy}
              onValueChange={detail.change}
              formatValue={(pct) => t('guides.detail.value', { pct })}
            />
            <EdgeStatus view={views.edges} {...shared} />
          </>
        )}
      </GuideGroup>

      {MODELS.map((model) => (
        <LandmarkGuide key={model} model={model} view={views[model]} {...shared} />
      ))}
    </section>
  )
}

interface PartProps {
  readonly image: ImageDescriptor
  readonly actions: DetectionActions
  readonly view: GuideView
  readonly waiting: boolean
  readonly describedBy: string | undefined
  readonly patch: (p: LinesPatch) => void
}

function EdgeStatus({ image, actions, view, waiting, describedBy }: PartProps) {
  const { t } = useTranslation('lines')
  switch (view.view) {
    case 'running':
      return <p className="text-ink-muted text-sm">{t('guides.edges.running')}</p>
    case 'found':
      return <p className="text-ink-muted text-sm">{t('guides.edges.done')}</p>
    case 'none-found':
      return <p className="text-ink-muted text-sm">{t('guides.edges.none')}</p>
    case 'failed':
      return (
        <Failure
          title={t('guides.edges.failed')}
          actions={
            <Button
              variant="secondary"
              disabled={waiting}
              aria-describedby={describedBy}
              onClick={() => {
                actions.retry('edges', image.id)
              }}
            >
              {t('guides.tryAgain')}
            </Button>
          }
        />
      )
    default:
      return null
  }
}

function LandmarkGuide({
  model,
  image,
  actions,
  view,
  waiting,
  describedBy,
  patch,
}: PartProps & { readonly model: AiModel }) {
  const { t } = useTranslation('lines')
  const on = image.lines[model]
  const retryAndOff = (
    <>
      <Button
        variant="secondary"
        disabled={waiting}
        aria-describedby={describedBy}
        onClick={() => {
          actions.retry(model, image.id)
        }}
      >
        {t('guides.tryAgain')}
      </Button>
      <Button
        variant="ghost"
        disabled={waiting}
        aria-describedby={describedBy}
        onClick={() => {
          patch({ [model]: false })
        }}
      >
        {t(`guides.${model}.turnOff`)}
      </Button>
    </>
  )

  let below = null
  switch (view.view) {
    case 'box':
    case 'downloading':
      below = (
        <DownloadBox
          model={model}
          state={view}
          disabled={waiting}
          describedBy={describedBy}
          onDownload={() => {
            actions.download(model)
          }}
        />
      )
      break
    case 'running':
      below = <p className="text-ink-muted text-sm">{t(`guides.${model}.running`)}</p>
      break
    case 'found':
      below = <Callout tone="success">{t(`guides.${model}.found`)}</Callout>
      break
    case 'none-found':
      below = (
        <Callout tone="warning" title={t(`guides.${model}.none`)}>
          {t(`guides.${model}.noneHint`)}
        </Callout>
      )
      break
    case 'download-failed':
      below = (
        <Failure title={t(`guides.${model}.downloadFailed`)} actions={retryAndOff}>
          {t('guides.failedHint')}
        </Failure>
      )
      break
    case 'failed':
      below = (
        <Failure title={t(`guides.${model}.error`)} actions={retryAndOff}>
          {t('guides.errorHint')}
        </Failure>
      )
      break
    case 'unsupported':
      below = <Callout tone="warning">{t('guides.noWebGL')}</Callout>
      break
    case 'idle':
      break
  }

  return (
    <GuideGroup>
      <Switch
        label={t(`type.${model}`)}
        checked={on}
        disabled={waiting}
        describedBy={describedBy}
        onCheckedChange={(next) => {
          patch({ [model]: next })
        }}
      />
      {below}
    </GuideGroup>
  )
}

/**
 * A failure: the alert holds the message only, and its buttons follow it outside the alert
 * (design/errors.html E6), so the alert is not read out with the buttons' names.
 */
function Failure({
  title,
  actions,
  children,
}: {
  readonly title: string
  readonly actions: ReactNode
  readonly children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <Callout tone="danger" live title={title}>
        {children}
      </Callout>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  )
}

function GuideGroup({ children }: { readonly children: ReactNode }) {
  const group = useRef<HTMLDivElement>(null)
  const focused = useRef<Element | null>(null)
  useLayoutEffect(() => {
    const last = focused.current
    if (!last || last.isConnected) return
    focused.current = null
    const active = document.activeElement
    if (active !== null && active !== document.body) return
    group.current?.querySelector<HTMLElement>('[role="switch"]')?.focus()
  })
  return (
    <div
      ref={group}
      className="flex flex-col gap-3"
      onFocus={(e: FocusEvent) => {
        focused.current = e.target
      }}
    >
      {children}
    </div>
  )
}

function useAnnounceChanges(
  imageId: ImageId,
  spoken: readonly Spoken[],
  onAnnounce: (text: string) => void,
): void {
  const key = JSON.stringify(spoken)
  const previous = useRef<{
    imageId: ImageId
    texts: readonly (string | null)[]
    /** Per guide: its last shown status is a result. */
    result: readonly boolean[]
  } | null>(null)
  useEffect(() => {
    const now = JSON.parse(key) as Spoken[]
    const before = previous.current?.imageId === imageId ? previous.current : null
    previous.current = {
      imageId,
      texts: now.map((s) => s.text),
      result: now.map(
        (s, i) => s.memo === 'result' || (s.memo === 'keep' && (before?.result[i] ?? false)),
      ),
    }
    if (!before) return
    const changed = now.flatMap((s, i) =>
      s.text !== null &&
      s.text !== before.texts[i] &&
      !(s.quietAfterResult && before.result[i] === true)
        ? [s.text]
        : [],
    )
    if (changed.length > 0) onAnnounce(changed.join(' '))
  }, [imageId, key, onAnnounce])
}

function useSettledDetail(imageId: ImageId, detailPct: number) {
  const [draft, setDraft] = useState<{ id: ImageId; pct: number } | null>(null)
  const pending = useRef<{ id: ImageId; pct: number; timer: ReturnType<typeof setTimeout> } | null>(
    null,
  )
  const commit = useCallback(() => {
    const p = pending.current
    if (!p) return
    clearTimeout(p.timer)
    pending.current = null
    useImages.getState().updateLines(p.id, { edges: { detailPct: p.pct } })
    useDetailDraft.setState({ pending: false })
    setDraft(null)
  }, [])
  useEffect(() => commit, [commit])

  const change = (pct: number) => {
    if (!Number.isInteger(pct) || pct < MIN_EDGE_DETAIL || pct > MAX_EDGE_DETAIL) return
    if (pending.current && pending.current.id !== imageId) commit()
    if (pending.current) clearTimeout(pending.current.timer)
    pending.current = { id: imageId, pct, timer: setTimeout(commit, DETAIL_SETTLE_MS) }
    useDetailDraft.setState({ pending: true })
    setDraft({ id: imageId, pct })
  }
  return { value: draft?.id === imageId ? draft.pct : detailPct, change }
}
