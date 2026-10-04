import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type SyntheticEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Callout, Icon, IconButton, ProgressBar } from '../../../shared/ui'
import { importErrorKeys } from '../errors'
import { MAX_DECODED_PIXELS, MAX_FILE_BYTES } from '../limits'
import { useImages } from '../store'
import type { ImportErrorCode, ImportOutcome } from '../types'

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif'
const limitVars = {
  maxMb: Math.round(MAX_FILE_BYTES / 1048576),
  maxMp: Math.round(MAX_DECODED_PIXELS / 1e6),
}

export interface ImportDropzoneProps {
  variant?: 'compact' | 'card'
  onOutcomes?: (outcomes: ImportOutcome[]) => void
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

type Issue =
  | { id: number; kind: 'error'; error: ImportErrorCode; source: string }
  | { id: number; kind: 'no-image' }
  | { id: number; kind: 'paste-hint' }

const hasFiles = (e: DragEvent | globalThis.DragEvent): boolean =>
  Array.from(e.dataTransfer?.types ?? []).some((t) => t === 'Files' || t === 'text/uri-list')

function IssueCallout({ issue, onDismiss }: { issue: Issue; onDismiss: () => void }) {
  const { t } = useTranslation(['images', 'errors'])
  let title: string
  let message: string
  let tone: 'danger' | 'warning' | 'info' = 'danger'
  if (issue.kind === 'error') {
    const keys = importErrorKeys(issue.error)
    const vars = { name: issue.source, ...limitVars }
    title = t(keys.title, vars)
    message = t(keys.message, vars)
  } else if (issue.kind === 'no-image') {
    title = t('images:dropzone.noImage.title')
    message = t('images:dropzone.noImage.message')
    tone = 'warning'
  } else {
    title = t('images:dropzone.pasteHint.title')
    message = t('images:dropzone.pasteHint.message')
    tone = 'info'
  }
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className="flex items-start gap-2">
      <div className="grow">
        <Callout tone={tone} title={title}>
          {message}
        </Callout>
      </div>
      <IconButton label={t('images:dropzone.dismiss')} icon="close" onClick={onDismiss} />
    </div>
  )
}

export function ImportDropzone({ variant = 'compact', onOutcomes }: ImportDropzoneProps) {
  const { t } = useTranslation('images')
  const importing = useImages((s) => s.importing)

  const fileInput = useRef<HTMLInputElement>(null)
  const urlInput = useRef<HTMLInputElement>(null)
  const nextIssue = useRef(1)
  const urlId = useId()
  const urlErrId = useId()
  const [issues, setIssues] = useState<Issue[]>([])
  const [dragging, setDragging] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [urlError, setUrlError] = useState<{ error: ImportErrorCode; source: string } | null>(null)
  const [urlBusy, setUrlBusy] = useState(false)

  // A file dropped just outside the zone must not navigate away (that would lose every loaded photo).
  useEffect(() => {
    const guard = (e: globalThis.DragEvent): void => {
      if (hasFiles(e)) e.preventDefault()
    }
    window.addEventListener('dragover', guard)
    window.addEventListener('drop', guard)
    return () => {
      window.removeEventListener('dragover', guard)
      window.removeEventListener('drop', guard)
    }
  }, [])

  const addIssue = (issue: DistributiveOmit<Issue, 'id'>): void => {
    const id = nextIssue.current++
    setIssues((list) => [...list, { ...issue, id }])
  }
  const report = (outcomes: ImportOutcome[]): void => {
    onOutcomes?.(outcomes)
    for (const o of outcomes)
      if (!o.ok) addIssue({ kind: 'error', error: o.error, source: o.source })
  }
  const fromTransfer = async (dt: DataTransfer): Promise<void> => {
    const outcomes = await useImages.getState().addFromClipboard(dt) // the store reads dt synchronously
    if (outcomes.length === 0) addIssue({ kind: 'no-image' })
    else report(outcomes)
  }

  const onPick = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length > 0) report(await useImages.getState().addFiles(files))
  }

  const onPasteClick = async (): Promise<void> => {
    try {
      const items = await navigator.clipboard.read()
      const dt = new DataTransfer()
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith('image/'))
        if (imageType)
          dt.items.add(new File([await item.getType(imageType)], 'image', { type: imageType }))
        else if (item.types.includes('text/plain'))
          dt.setData('text/plain', await (await item.getType('text/plain')).text())
      }
      await fromTransfer(dt)
    } catch {
      addIssue({ kind: 'paste-hint' })
    }
  }

  const onZoneDrop = (e: DragEvent<HTMLElement>): void => {
    e.preventDefault()
    setDragging(false)
    void fromTransfer(e.dataTransfer)
  }

  const submitUrl = async (e: SyntheticEvent): Promise<void> => {
    e.preventDefault()
    if (url.trim() === '' || urlBusy) return
    setUrlBusy(true)
    setUrlError(null)
    const outcome = await useImages.getState().addFromUrl(url)
    setUrlBusy(false)
    onOutcomes?.([outcome])
    if (outcome.ok) {
      setUrl('')
      setLinkOpen(false)
    } else {
      setUrlError({ error: outcome.error, source: outcome.source })
    }
  }

  const openLink = (): void => {
    setLinkOpen(true)
    queueMicrotask(() => urlInput.current?.focus())
  }

  const card = variant === 'card'
  const buttonSize = card ? 'lg' : 'md'
  const urlKeys = urlError ? importErrorKeys(urlError.error) : null

  return (
    <section
      data-dropzone
      data-over={dragging || undefined}
      onDragEnter={(e) => {
        if (hasFiles(e)) setDragging(true)
      }}
      onDragOver={(e) => {
        if (hasFiles(e)) e.preventDefault()
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={onZoneDrop}
      className={
        card
          ? 'rounded-sketch border-line-strong bg-surface text-ink data-[over]:border-accent data-[over]:bg-accent-soft border-2 border-dashed p-10 text-center'
          : 'text-ink-muted data-[over]:text-on-accent-soft flex flex-col gap-2'
      }
    >
      <input
        ref={fileInput}
        type="file"
        hidden
        multiple
        accept={ACCEPT}
        onChange={(e) => void onPick(e)}
      />

      {card && (
        <>
          <svg
            viewBox="0 0 160 110"
            width="160"
            height="110"
            className="mx-auto mb-4"
            aria-hidden="true"
            focusable="false"
          >
            <rect
              x="22"
              y="18"
              width="62"
              height="82"
              rx="3"
              transform="rotate(-8 53 59)"
              fill="#fff"
              stroke="currentColor"
              strokeWidth="2"
            />
            <rect
              x="70"
              y="10"
              width="62"
              height="82"
              rx="3"
              transform="rotate(6 101 51)"
              fill="#fff"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle cx="101" cy="40" r="10" fill="#e2b13c" />
            <path
              d="M78 80 l14-18 10 10 14-20 12 28"
              fill="none"
              stroke="#b0432a"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            <path
              d="M30 70 c8-10 18-6 22 2 s14 8 22-4"
              fill="none"
              stroke="#2f4c9e"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <h2 className="font-display text-xl">{t('dropzone.title')}</h2>
          <p className="text-ink-muted mx-0 mt-2 mb-6">{t('dropzone.hint')}</p>
        </>
      )}

      <div
        role="group"
        aria-label={t('dropzone.groupLabel')}
        className={card ? 'flex flex-wrap justify-center gap-2' : 'grid grid-cols-3 gap-2'}
      >
        <Button
          variant={card ? 'primary' : 'secondary'}
          size={buttonSize}
          onClick={() => fileInput.current?.click()}
        >
          <Icon name="upload" />
          {t(card ? 'dropzone.uploadHero' : 'dropzone.upload')}
        </Button>
        <Button variant="secondary" size={buttonSize} onClick={() => void onPasteClick()}>
          <Icon name="paste" />
          {t('dropzone.paste')}
        </Button>
        <Button variant="secondary" size={buttonSize} onClick={openLink} aria-expanded={linkOpen}>
          <Icon name="link" />
          {t(card ? 'dropzone.linkHero' : 'dropzone.link')}
        </Button>
      </div>

      {linkOpen && (
        <form
          onSubmit={(e) => void submitUrl(e)}
          noValidate
          className="mt-3 flex flex-col gap-2 text-left"
        >
          <label htmlFor={urlId} className="text-ink text-sm font-medium">
            {t('dropzone.url.label')}
          </label>
          <div className="flex gap-2">
            <input
              ref={urlInput}
              id={urlId}
              type="text"
              inputMode="url"
              autoComplete="off"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
              }}
              placeholder={t('dropzone.url.placeholder')}
              aria-invalid={urlError ? true : undefined}
              aria-describedby={urlError ? urlErrId : undefined}
              className="border-line-strong bg-surface text-ink min-h-10 grow rounded-md border px-3 text-base"
            />
            <Button type="submit" variant="primary" disabled={urlBusy}>
              {t('dropzone.url.submit')}
            </Button>
          </div>
          {urlError && urlKeys && (
            <div id={urlErrId} role="alert">
              <Callout
                tone="danger"
                title={t(urlKeys.title, { name: urlError.source, ...limitVars })}
              >
                {t(urlKeys.message, { name: urlError.source, ...limitVars })}
              </Callout>
              {urlError.error === 'cors' && (
                <div className="mt-2 flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setUrl('')
                      setUrlError(null)
                      urlInput.current?.focus()
                    }}
                  >
                    {t('dropzone.url.tryAnother')}
                  </Button>
                  <Button variant="primary" onClick={() => fileInput.current?.click()}>
                    {t('dropzone.url.uploadInstead')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </form>
      )}

      {!card && (
        <p className="rounded-sketch border-line-strong border-2 border-dashed p-2.5 text-center text-sm">
          {dragging ? t('dropzone.dropActive') : t('dropzone.dropMini')}
        </p>
      )}
      {card && dragging && <p className="text-accent mt-4">{t('dropzone.dropActive')}</p>}

      {importing > 0 && (
        <div className="mt-3 text-left" role="status" aria-live="polite">
          <ProgressBar value={null} label={t('dropzone.importingLabel')} />
          <span className="text-sm">{t('dropzone.importing', { count: importing })}</span>
        </div>
      )}

      {card && (
        <>
          <p className="text-ink-subtle mt-5 text-sm">{t('dropzone.formats')}</p>
          <p className="text-success mt-2 text-sm">{t('dropzone.privacy')}</p>
        </>
      )}

      {issues.length > 0 && (
        <div className="mt-3 flex flex-col gap-2 text-left">
          {issues.map((issue) => (
            <IssueCallout
              key={issue.id}
              issue={issue}
              onDismiss={() => {
                setIssues((l) => l.filter((i) => i.id !== issue.id))
              }}
            />
          ))}
        </div>
      )}
    </section>
  )
}
