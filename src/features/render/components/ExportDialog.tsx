import { useEffect, useId, useLayoutEffect, useReducer, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { mmToUnit, roundForUnit } from '../../../shared/model/units'
import { Button, Callout, Dialog, Icon, ProgressBar, buttonClasses } from '../../../shared/ui'
import { useSettings } from '../../settings'
import { EXPORT_ERROR_KEYS, isAbortError, toExportError } from '../export/errors'
import { exportPdf } from '../export/export-pdf'
import type { GetSource } from '../export/run-export'
import {
  INITIAL_EXPORT_STATE,
  exportReducer,
  exportSummary,
  pageSteps,
} from '../export/export-state'
import { pdfFileName, sanitizePdfFileName } from '../export/file-name'
import type { PageModel } from '../types'

export interface ExportDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly pages: readonly PageModel[]
  /** Paper name for the summary and the D10 file name, e.g. "A4", "Letter", "Custom". */
  readonly paperLabel: string
  readonly getSource: GetSource
}

/** export.html: summary → page-by-page progress → download, plus error and cancel states. */
export function ExportDialog({
  open,
  onOpenChange,
  pages,
  paperLabel,
  getSource,
}: ExportDialogProps) {
  const { t } = useTranslation('export')
  const unit = useSettings((s) => s.unit)
  const nameId = useId()
  const [state, dispatch] = useReducer(exportReducer, INITIAL_EXPORT_STATE)
  const defaultName = pdfFileName(paperLabel, new Date())
  const [fileName, setFileName] = useState(defaultName)
  const controller = useRef<AbortController | null>(null)
  const linkRef = useRef<HTMLAnchorElement | null>(null)
  const createRef = useRef<HTMLButtonElement | null>(null)
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const shownStatus = useRef(state.status)
  const url = state.status === 'done' ? state.url : null

  // Fresh default name each time the dialog opens.
  // (State adjusted during render, keyed on open/paperLabel, instead of in an effect.)
  const [nameKey, setNameKey] = useState({ open, paperLabel })
  if (nameKey.open !== open || nameKey.paperLabel !== paperLabel) {
    setNameKey({ open, paperLabel })
    if (open) setFileName(pdfFileName(paperLabel, new Date()))
    // A parent-driven close resets like the dialog's own close paths (the abort is in an effect).
    if (!open) dispatch({ type: 'cancel' })
  }

  // Revoke the object URL when it is replaced or the dialog unmounts.
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url)
    },
    [url],
  )

  // Abort a running export when the parent closes the dialog, in the same commit as the reset above
  // so a run that settles in between never creates an object URL.
  useLayoutEffect(() => {
    if (!open) {
      controller.current?.abort()
      controller.current = null
    }
  }, [open])

  // The focused button unmounts on every step change; move focus to the new step's main control.
  useEffect(() => {
    const changed = shownStatus.current !== state.status
    shownStatus.current = state.status
    if (!open || !changed) return
    if (state.status === 'running') cancelRef.current?.focus()
    else if (state.status === 'done') linkRef.current?.focus()
    else createRef.current?.focus()
  }, [open, state.status])

  // Abort a running export on unmount.
  useEffect(
    () => () => {
      controller.current?.abort()
    },
    [],
  )

  const start = (): void => {
    const ctrl = new AbortController()
    controller.current = ctrl
    dispatch({ type: 'start', pageCount: pages.length })
    void exportPdf(pages, getSource, {
      signal: ctrl.signal,
      onProgress: (progress) => {
        if (controller.current !== ctrl) return // stale run (cancelled or replaced)
        dispatch({ type: 'progress', progress })
      },
    }).then(
      (blob) => {
        if (controller.current !== ctrl || ctrl.signal.aborted) return // never create the URL
        dispatch({ type: 'done', url: URL.createObjectURL(blob) })
      },
      (e: unknown) => {
        if (controller.current !== ctrl || isAbortError(e)) return
        dispatch({ type: 'error', code: toExportError(e).code })
      },
    )
  }

  const cancel = (): void => {
    controller.current?.abort()
    controller.current = null
    dispatch({ type: 'cancel' })
  }

  const handleOpenChange = (next: boolean): void => {
    if (!next) cancel() // closing always stops the work and resets (revokes the URL via the effect)
    onOpenChange(next)
  }

  const summary = exportSummary(pages, paperLabel)
  const steps = pageSteps(state, pages.length)
  const bleedText =
    summary.bleedMm === null
      ? t('summary.off')
      : t('summary.length', { value: roundForUnit(mmToUnit(summary.bleedMm, unit), unit), unit })

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title={t('title')}
      closeLabel={t('close')}
      size="sm"
    >
      {/* Stays mounted in every state so screen readers pick up each change of its text. */}
      <p role="status" className={state.status === 'running' ? 'm-0 mb-3 text-sm' : 'sr-only'}>
        {state.status === 'running' ? (
          <strong>
            {t('progress.label', {
              page: state.progress.pageIndex + 1,
              total: state.progress.pageCount,
            })}
          </strong>
        ) : state.status === 'done' ? (
          t('done.title')
        ) : null}
      </p>
      {(state.status === 'ready' || state.status === 'error') && (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-ink-muted">{t('summary.pages')}</dt>
            <dd className="m-0 font-semibold">
              {t('summary.pagesValue', {
                pages: summary.pageCount,
                paper: summary.paperLabel,
                orientation: t(`summary.orientation.${summary.orientation}`),
              })}
            </dd>
            <dt className="text-ink-muted">{t('summary.tiles')}</dt>
            <dd className="m-0 font-semibold">
              {t('summary.tilesValue', { tiles: summary.tileCount, count: summary.imageCount })}
            </dd>
            <dt className="text-ink-muted">{t('summary.cropMarks')}</dt>
            <dd className="m-0 font-semibold">
              {summary.cropMarks ? t('summary.on') : t('summary.off')}
            </dd>
            <dt className="text-ink-muted">{t('summary.bleed')}</dt>
            <dd className="m-0 font-semibold">{bleedText}</dd>
            <dt className="text-ink-muted">{t('summary.quality')}</dt>
            <dd className="m-0 font-semibold">{t('summary.qualityValue')}</dd>
          </dl>
          <div className="ds-field">
            <label htmlFor={nameId}>{t('fileName')}</label>
            <input
              id={nameId}
              className="ds-input"
              value={fileName}
              onChange={(e) => {
                setFileName(e.target.value)
              }}
            />
          </div>
          {state.status === 'error' && (
            <Callout tone="danger" live>
              {t(EXPORT_ERROR_KEYS[state.code])}
            </Callout>
          )}
          {pages.length === 0 && <Callout tone="quiet">{t('errors:export.empty')}</Callout>}
          <Button
            ref={createRef}
            variant="primary"
            size="lg"
            block
            icon="download"
            disabled={pages.length === 0}
            onClick={start}
          >
            {state.status === 'error' ? t('retry') : t('create')}
          </Button>
        </div>
      )}

      {state.status === 'running' && (
        <div className="flex flex-col gap-3">
          <ProgressBar
            value={state.progress.fraction}
            label={t('progress.aria')}
            valueText={t('progress.label', {
              page: state.progress.pageIndex + 1,
              total: state.progress.pageCount,
            })}
          />
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {steps.map((step, i) => (
              <li key={i} data-state={step} className="group flex items-center gap-2 text-sm">
                <span
                  aria-hidden="true"
                  className="border-line-strong group-data-[state=active]:border-accent group-data-[state=done]:border-success group-data-[state=done]:bg-success h-[18px] w-[18px] flex-none rounded-full border-2 group-data-[state=active]:animate-spin group-data-[state=active]:border-t-transparent motion-reduce:animate-none"
                />
                {t('progress.page', { n: i + 1 })}
                <span className="sr-only">{t(`progress.state.${step}`)}</span>
              </li>
            ))}
          </ol>
          <p className="text-ink-muted m-0 text-xs">{t('progress.hint')}</p>
          <Button ref={cancelRef} onClick={cancel}>
            {t('cancel')}
          </Button>
        </div>
      )}

      {state.status === 'done' && (
        <div className="flex flex-col gap-3">
          <h3 className="font-display m-0 text-lg">
            {t('done.title')}{' '}
            <span className="font-hand text-accent" aria-hidden="true">
              {t('done.yay')}
            </span>
          </h3>
          {/* A link (not a button) so the browser's own download handling and long-press menus work. */}
          <a
            className={buttonClasses('primary', 'lg', { block: true })}
            ref={linkRef}
            href={state.url}
            download={sanitizePdfFileName(fileName, defaultName)}
          >
            <Icon name="download" />
            {t('done.download')}
          </a>
          <Callout tone="info" title={t('done.printTitle')}>
            {t('done.printBody')}
          </Callout>
          <Button
            variant="ghost"
            onClick={() => {
              dispatch({ type: 'reset' })
            }}
          >
            {t('done.again')}
          </Button>
        </div>
      )}
    </Dialog>
  )
}
