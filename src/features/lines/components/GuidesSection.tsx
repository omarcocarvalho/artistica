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

function announcement(t: Translate, kind: GuideKind, view: GuideView): string | null {
  switch (view.view) {
    case 'box':
      return t('guides.size', { mb: formatMb(view.bytes) })
    case 'downloading':
      return kind === 'edges' ? null : t(`guides.${kind}.downloading`)
    case 'running':
      return t(`guides.${kind}.running`)
    case 'found':
      return kind === 'edges' ? t('guides.edges.done') : t(`guides.${kind}.found`)
    case 'none-found':
      return kind === 'edges'
        ? t('guides.edges.none')
        : `${t(`guides.${kind}.none`)} ${t(`guides.${kind}.noneHint`)}`
    case 'unsupported':
      return t('guides.noWebGL')
    case 'idle':
    case 'failed':
    case 'download-failed':
      return null
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
  useAnnounceChanges(
    id,
    KINDS.map((kind) => announcement(t, kind, views[kind])),
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
        <Callout
          tone="danger"
          live
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
        <Callout
          tone="danger"
          live
          title={t(`guides.${model}.downloadFailed`)}
          actions={retryAndOff}
        >
          {t('guides.failedHint')}
        </Callout>
      )
      break
    case 'failed':
      below = (
        <Callout tone="danger" live title={t(`guides.${model}.error`)} actions={retryAndOff}>
          {t('guides.errorHint')}
        </Callout>
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
  texts: readonly (string | null)[],
  onAnnounce: (text: string) => void,
): void {
  const key = JSON.stringify(texts)
  const previous = useRef<{ imageId: ImageId; key: string } | null>(null)
  useEffect(() => {
    const before = previous.current
    previous.current = { imageId, key }
    if (before?.imageId !== imageId) return
    const old = JSON.parse(before.key) as (string | null)[]
    const now = JSON.parse(key) as (string | null)[]
    const changed = now.filter((text, i): text is string => text !== null && text !== old[i])
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
    setDraft(null)
  }, [])
  useEffect(() => commit, [commit])

  const change = (pct: number) => {
    if (!Number.isInteger(pct) || pct < MIN_EDGE_DETAIL || pct > MAX_EDGE_DETAIL) return
    if (pending.current && pending.current.id !== imageId) commit()
    if (pending.current) clearTimeout(pending.current.timer)
    pending.current = { id: imageId, pct, timer: setTimeout(commit, DETAIL_SETTLE_MS) }
    setDraft({ id: imageId, pct })
  }
  return { value: draft?.id === imageId ? draft.pct : detailPct, change }
}
