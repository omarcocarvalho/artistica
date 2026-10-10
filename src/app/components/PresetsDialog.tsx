import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type SubmitEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useImages } from '../../features/images'
import { useSettings } from '../../features/settings'
import {
  buildPresetFile,
  MAX_PRESET_NAME,
  MAX_PRESETS,
  presetName,
  type Preset,
  type PresetImportError,
} from '../../shared/model/preset'
import { BottomSheet, Button, Callout, Dialog, useImportWait } from '../../shared/ui'
import type { ModalSurfaceProps } from '../../shared/ui/ModalSurface'
import { useIsDesktop } from '../hooks/useIsDesktop'
import { applyPreset, presetFromCurrent } from '../presets'
import { downloadJson, presetFileName, readPresetFile } from './preset-file'
import { presetSummary, type I18nT } from './preset-summary'

export interface PresetsDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

type Editing =
  | { readonly kind: 'none' }
  | { readonly kind: 'save'; readonly value: string; readonly conflict: boolean }
  | {
      readonly kind: 'rename'
      readonly from: string
      readonly value: string
      readonly conflict: boolean
    }

type Confirm =
  | { readonly kind: 'apply'; readonly preset: Preset; readonly open: boolean }
  | {
      readonly kind: 'delete'
      readonly name: string
      readonly index: number
      readonly open: boolean
    }

type Report =
  | { readonly kind: 'status'; readonly title?: string; readonly text: string }
  | { readonly kind: 'error'; readonly text: string; readonly seq: number }

type FocusTarget = { readonly kind: 'save' } | { readonly kind: 'rename'; readonly name: string }

type NameProblem = 'empty' | 'too-long' | null

const NONE: Editing = { kind: 'none' }

const ERROR_KEYS: Record<PresetImportError, string> = {
  'too-large': 'import.error.tooLarge',
  'not-json': 'import.error.notPresets',
  'not-presets': 'import.error.notPresets',
  'newer-version': 'import.error.newerVersion',
  empty: 'import.error.empty',
}

/** A name of only spaces, controls or invisible format characters counts as empty. */
function nameProblem(raw: string): NameProblem {
  if (!/[^\p{C}\p{Z}]/u.test(raw)) return 'empty'
  return presetName(raw) === null ? 'too-long' : null
}

function NameField({
  label,
  value,
  conflict,
  inputRef,
  onChange,
  onCancel,
  onSubmit,
  submitLabel,
  cancelLabel,
  conflictActions,
}: {
  label: string
  value: string
  conflict: boolean
  inputRef: RefObject<HTMLInputElement | null>
  onChange: (value: string) => void
  onCancel: () => void
  onSubmit: () => void
  submitLabel: string
  cancelLabel: string
  conflictActions?: ReactNode
}) {
  const { t } = useTranslation('presets')
  const id = useId()
  const hintId = `${id}-hint`
  const conflictId = `${id}-conflict`
  const problem = nameProblem(value)
  useLayoutEffect(() => {
    inputRef.current?.focus()
  }, [inputRef])
  const hint =
    problem === 'empty'
      ? t('save.needName')
      : problem === 'too-long'
        ? t('save.tooLong', { max: MAX_PRESET_NAME })
        : null
  const describedBy = conflict ? conflictId : hint !== null ? hintId : undefined
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (problem === null) onSubmit()
  }
  return (
    <form className="flex flex-col gap-2" onSubmit={submit}>
      <div className="ds-field">
        <label htmlFor={id}>{label}</label>
        <input
          ref={inputRef}
          id={id}
          className="ds-input"
          value={value}
          autoComplete="off"
          aria-invalid={conflict || undefined}
          aria-describedby={describedBy}
          onChange={(e) => {
            onChange(e.target.value)
          }}
        />
      </div>
      {hint !== null ? (
        <span id={hintId} className="ds-field-hint">
          {hint}
        </span>
      ) : null}
      {conflict ? (
        <Callout
          id={conflictId}
          tone="warning"
          live
          role="alert"
          title={t('save.exists')}
          actions={conflictActions}
        />
      ) : null}
      {conflict && conflictActions !== undefined ? null : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            variant="primary"
            aria-disabled={problem !== null || undefined}
            aria-describedby={hint !== null ? hintId : undefined}
          >
            {submitLabel}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
        </div>
      )}
    </form>
  )
}

/** Centred on desktop, a bottom sheet on the phone (as the edit sheet), without the edit sheet's Done. */
function PresetsSurface({ desktop, ...props }: ModalSurfaceProps & { desktop: boolean }) {
  return desktop ? <Dialog size="sm" {...props} /> : <BottomSheet {...props} />
}

export function PresetsDialog({ open, onOpenChange }: PresetsDialogProps) {
  const { t } = useTranslation('presets')
  const isDesktop = useIsDesktop()
  const presets = useSettings((s) => s.presets)
  const unit = useSettings((s) => s.unit)
  const photoCount = useImages((s) => s.images.length)
  const importing = useImages((s) => s.importing > 0)
  const { hintId: waitId, hintRef: waitRef } = useImportWait(importing)
  const [editing, setEditing] = useState<Editing>(NONE)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (!open) {
      setEditing(NONE)
      setConfirm(null)
      setReport(null)
    }
  }

  const fullId = useId()
  const focusAfter = useRef<FocusTarget | null>(null)
  const deletedIndex = useRef(0)
  const saveOpenRef = useRef<HTMLButtonElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const renameButtons = useRef(new Map<string, HTMLButtonElement>())
  const errorSeq = useRef(0)

  useLayoutEffect(() => {
    const target = focusAfter.current
    if (target === null) return
    focusAfter.current = null
    if (target.kind === 'save') saveOpenRef.current?.focus()
    else renameButtons.current.get(target.name)?.focus()
  })

  const full = presets.length >= MAX_PRESETS
  const say = (text: string, title?: string) => {
    setReport({ kind: 'status', text, ...(title === undefined ? {} : { title }) })
  }

  const stopEditing = () => {
    if (editing.kind === 'save') focusAfter.current = { kind: 'save' }
    if (editing.kind === 'rename') focusAfter.current = { kind: 'rename', name: editing.from }
    setEditing(NONE)
  }

  const submitSave = (replace: boolean) => {
    if (editing.kind !== 'save') return
    const result = useSettings
      .getState()
      .savePreset(presetFromCurrent(editing.value), replace ? { replace } : undefined)
    if (result === 'exists') {
      setEditing({ ...editing, conflict: true })
      return
    }
    focusAfter.current = { kind: 'save' }
    setEditing(NONE)
    const name = presetName(editing.value) ?? editing.value
    if (result === 'saved') say(t('save.saved', { name }))
    if (result === 'replaced') say(t('save.replaced', { name }))
  }

  const submitRename = () => {
    if (editing.kind !== 'rename') return
    const result = useSettings.getState().renamePreset(editing.from, editing.value)
    if (result === 'exists') {
      setEditing({ ...editing, conflict: true })
      return
    }
    const to = result === 'renamed' ? (presetName(editing.value) ?? editing.from) : editing.from
    focusAfter.current = { kind: 'rename', name: to }
    setEditing(NONE)
    if (to !== editing.from) say(t('rename.renamed', { from: editing.from, to }))
  }

  const doApply = (preset: Preset) => {
    if (applyPreset(preset) === 'applied') say(t('apply.applied', { name: preset.name }))
  }

  const requestApply = (preset: Preset) => {
    if (importing) return
    if (photoCount > 0) setConfirm({ kind: 'apply', preset, open: true })
    else doApply(preset)
  }

  const confirmDelete = (name: string, index: number) => {
    deletedIndex.current = index
    flushSync(() => {
      useSettings.getState().deletePreset(name)
      setConfirm((c) => (c === null ? null : { ...c, open: false }))
    })
    say(t('delete.deleted', { name }))
  }

  const afterDeleteFocus = (): HTMLElement | null =>
    listRef.current?.querySelectorAll<HTMLButtonElement>('[data-preset-apply]')[
      deletedIndex.current
    ] ?? saveOpenRef.current

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (file === undefined) return
    const result = await readPresetFile(file)
    if (!result.ok) {
      errorSeq.current += 1
      setReport({ kind: 'error', text: t(ERROR_KEYS[result.error]), seq: errorSeq.current })
      return
    }
    const { added, renamed, skippedFull } = useSettings
      .getState()
      .addImportedPresets(result.presets)
    const details = [
      renamed.length > 0
        ? t('import.renamed', {
            count: renamed.length,
            list: renamed
              .map(([from, to]) => t('import.renamedPair', { from, to }))
              .join(t('import.listSeparator')),
          })
        : null,
      result.skipped > 0 ? t('import.skipped', { count: result.skipped }) : null,
      skippedFull > 0 ? t('import.full', { count: skippedFull, max: MAX_PRESETS }) : null,
      result.adjusted > 0 ? t('import.adjusted', { count: result.adjusted }) : null,
    ].filter((line): line is string => line !== null)
    say(details.join(' '), t('import.imported', { count: added }))
  }

  const exportAll = () => {
    downloadJson(presetFileName(new Date()), buildPresetFile(presets))
  }

  const summaryT: I18nT = (key, options) => t(key, options)

  const saveArea =
    editing.kind === 'save' ? (
      <NameField
        label={t('save.name')}
        value={editing.value}
        conflict={editing.conflict}
        inputRef={nameRef}
        submitLabel={t('save.submit')}
        cancelLabel={t('save.cancel')}
        onChange={(value) => {
          setEditing({ kind: 'save', value, conflict: false })
        }}
        onCancel={stopEditing}
        onSubmit={() => {
          submitSave(false)
        }}
        conflictActions={
          <>
            <Button
              variant="primary"
              onClick={() => {
                submitSave(true)
              }}
            >
              {t('save.replace')}
            </Button>
            <Button
              onClick={() => {
                setEditing({ ...editing, conflict: false })
                nameRef.current?.focus()
              }}
            >
              {t('save.cancel')}
            </Button>
          </>
        }
      />
    ) : (
      <>
        <Button
          ref={saveOpenRef}
          variant="primary"
          icon="plus"
          className="self-start"
          aria-disabled={full || undefined}
          aria-describedby={full ? fullId : undefined}
          onClick={() => {
            if (!full) setEditing({ kind: 'save', value: '', conflict: false })
          }}
        >
          {t('save.open')}
        </Button>
        {full ? (
          <Callout id={fullId} tone="warning">
            {t('save.full', { max: MAX_PRESETS })}
          </Callout>
        ) : null}
      </>
    )

  return (
    <>
      <PresetsSurface
        desktop={isDesktop}
        open={open}
        onOpenChange={onOpenChange}
        title={t('title')}
        closeLabel={t('close')}
        onEscapeKeyDown={(event) => {
          if (editing.kind === 'none') return
          event.preventDefault()
          stopEditing()
        }}
        footer={
          <>
            <Button
              icon="upload"
              onClick={() => {
                fileRef.current?.click()
              }}
            >
              {t('import.button')}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              hidden
              tabIndex={-1}
              aria-label={t('import.file')}
              onChange={(event) => {
                void onFile(event)
              }}
            />
            <Button icon="download" disabled={presets.length === 0} onClick={exportAll}>
              {t('export.button')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col">
          <div className="flex flex-col gap-4">
            {presets.length === 0 ? <p className="text-ink-muted text-sm">{t('empty')}</p> : null}
            {saveArea}
            {importing && presets.length > 0 ? (
              <p ref={waitRef} id={waitId} tabIndex={-1} className="ds-field-hint">
                {t('apply.waiting')}
              </p>
            ) : null}
            {presets.length > 0 ? (
              <ul
                ref={listRef}
                aria-label={t('listLabel')}
                className="border-line m-0 flex list-none flex-col border-t p-0"
              >
                {presets.map((preset) =>
                  editing.kind === 'rename' && editing.from === preset.name ? (
                    <li key={preset.name} className="border-line border-b py-3">
                      <NameField
                        label={t('rename.label', { name: preset.name })}
                        value={editing.value}
                        conflict={editing.conflict}
                        inputRef={nameRef}
                        submitLabel={t('rename.submit')}
                        cancelLabel={t('rename.cancel')}
                        onChange={(value) => {
                          setEditing({ ...editing, value, conflict: false })
                        }}
                        onCancel={stopEditing}
                        onSubmit={submitRename}
                      />
                    </li>
                  ) : (
                    <li
                      key={preset.name}
                      className="border-line grid grid-cols-1 gap-2 border-b py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold [overflow-wrap:anywhere]">{preset.name}</div>
                        <div className="text-ink-muted text-xs [overflow-wrap:anywhere]">
                          {presetSummary(preset, unit, summaryT)}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 sm:justify-end">
                        <Button
                          variant="secondary"
                          data-preset-apply=""
                          aria-label={t('row.applyLabel', { name: preset.name })}
                          aria-disabled={importing || undefined}
                          aria-describedby={importing ? waitId : undefined}
                          onClick={() => {
                            requestApply(preset)
                          }}
                        >
                          {t('row.apply')}
                        </Button>
                        <Button
                          icon="edit"
                          ref={(el) => {
                            if (el) renameButtons.current.set(preset.name, el)
                            else renameButtons.current.delete(preset.name)
                          }}
                          aria-label={t('row.renameLabel', { name: preset.name })}
                          onClick={() => {
                            setEditing({
                              kind: 'rename',
                              from: preset.name,
                              value: preset.name,
                              conflict: false,
                            })
                          }}
                        >
                          {t('row.rename')}
                        </Button>
                        <Button
                          icon="trash"
                          variant="danger"
                          aria-label={t('row.deleteLabel', { name: preset.name })}
                          onClick={() => {
                            setConfirm({
                              kind: 'delete',
                              name: preset.name,
                              index: presets.indexOf(preset),
                              open: true,
                            })
                          }}
                        >
                          {t('row.delete')}
                        </Button>
                      </div>
                    </li>
                  ),
                )}
              </ul>
            ) : null}
          </div>
          <div role="status">
            {report?.kind === 'status' ? (
              <Callout
                className="mt-4"
                tone="success"
                {...(report.title === undefined ? {} : { title: report.title })}
              >
                {report.text}
              </Callout>
            ) : null}
          </div>
          {report?.kind === 'error' ? (
            <Callout key={report.seq} className="mt-4" tone="danger" live>
              {report.text}
            </Callout>
          ) : null}
        </div>
      </PresetsSurface>
      <Dialog
        open={confirm?.kind === 'apply' && confirm.open}
        onOpenChange={(next) => {
          if (!next) setConfirm((c) => (c === null ? null : { ...c, open: false }))
        }}
        size="sm"
        title={
          confirm?.kind === 'apply' ? t('apply.confirmTitle', { name: confirm.preset.name }) : ''
        }
        closeLabel={t('close')}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setConfirm((c) => (c === null ? null : { ...c, open: false }))
              }}
            >
              {t('apply.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (confirm?.kind !== 'apply') return
                setConfirm({ ...confirm, open: false })
                doApply(confirm.preset)
              }}
            >
              {t('apply.confirm')}
            </Button>
          </>
        }
      >
        <p>{t('apply.confirmBody', { count: photoCount })}</p>
      </Dialog>
      <Dialog
        open={confirm?.kind === 'delete' && confirm.open}
        onOpenChange={(next) => {
          if (!next) setConfirm((c) => (c === null ? null : { ...c, open: false }))
        }}
        size="sm"
        title={confirm?.kind === 'delete' ? t('delete.confirmTitle', { name: confirm.name }) : ''}
        closeLabel={t('close')}
        returnFocus={afterDeleteFocus}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setConfirm((c) => (c === null ? null : { ...c, open: false }))
              }}
            >
              {t('delete.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirm?.kind === 'delete') confirmDelete(confirm.name, confirm.index)
              }}
            >
              {t('delete.confirm')}
            </Button>
          </>
        }
      />
    </>
  )
}
