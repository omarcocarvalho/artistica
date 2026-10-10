import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useImages } from '../../features/images'
import type { ArrangeBlock } from '../../features/render'
import { useSettings } from '../../features/settings'
import { Button, Dialog, IconButton, NumberField, Select, type IconName } from '../../shared/ui'
import {
  commitOp,
  rerunAutoLayout,
  setArrangeMode,
  undoArrange,
  useArrangeView,
} from '../arrange-controller'
import { useArrange } from '../arrange-store'

const NUDGES: readonly { key: string; icon: IconName; dx: number; dy: number }[] = [
  { key: 'moveLeft', icon: 'chevronLeft', dx: -1, dy: 0 },
  { key: 'moveUp', icon: 'chevronUp', dx: 0, dy: -1 },
  { key: 'moveDown', icon: 'chevronDown', dx: 0, dy: 1 },
  { key: 'moveRight', icon: 'chevronRight', dx: 1, dy: 0 },
]

const NEW_PAGE = 'new'

/** Arrange, Undo, Re-run, and single-pointer controls for the selected photo (WCAG 2.5.7). */
export function ArrangeToolbar() {
  const { t } = useTranslation(['preview', 'common'])
  const mode = useArrange((s) => s.mode)
  const stored = useArrange((s) => s.manual)
  const canUndo = useArrange((s) => s.undo.length > 0)
  const selected = useArrange((s) => s.selected)
  const unit = useSettings((s) => s.unit)
  const images = useImages((s) => s.images)
  const { manual, blocks } = useArrangeView()
  const [confirming, setConfirming] = useState(false)
  const positionId = useId()
  const names = useMemo(() => new Map(images.map((i) => [i.id, i.name])), [images])
  const block = mode ? blocks.find((b) => b.id === selected) : undefined
  const imageName = (b: ArrangeBlock) => names.get(b.imageId) ?? ''
  const pageCount = manual?.pageCount ?? 0

  return (
    <>
      <Button
        icon="move"
        aria-pressed={mode}
        onClick={() => {
          setArrangeMode(!mode)
        }}
      >
        {t('arrange.toggle')}
      </Button>
      <Button icon="undo" disabled={!canUndo} onClick={undoArrange}>
        {t('arrange.undo')}
      </Button>
      <Button
        icon="rerun"
        disabled={stored === null}
        onClick={() => {
          setConfirming(true)
        }}
      >
        {t('arrange.rerun')}
      </Button>
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        size="sm"
        title={t('arrange.rerunConfirm')}
        closeLabel={t('arrange.close')}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setConfirming(false)
              }}
            >
              {t('arrange.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setConfirming(false)
                rerunAutoLayout()
              }}
            >
              {t('arrange.rerunAction')}
            </Button>
          </>
        }
      />
      {block && (
        <div
          role="group"
          aria-label={t('arrange.selectedGroup', { name: imageName(block) })}
          className="flex flex-wrap items-end gap-x-3 gap-y-2"
        >
          <Select
            label={t('arrange.moveToPage')}
            value={String(block.page)}
            options={[
              ...Array.from({ length: pageCount }, (_, i) => ({
                value: String(i),
                label: t('arrange.pageOption', { page: i + 1 }),
              })),
              { value: NEW_PAGE, label: t('arrange.newPage') },
            ]}
            onValueChange={(v) => {
              commitOp(
                { kind: 'page', id: block.id, page: v === NEW_PAGE ? pageCount : Number(v) },
                { fromBlock: false },
              )
            }}
          />
          <Select
            label={t('arrange.swapWith')}
            value=""
            options={[
              { value: '', label: t('arrange.swapChoose') },
              ...blocks
                .filter((b) => b.id !== block.id)
                .map((b) => ({
                  value: b.id,
                  label: t('arrange.swapOption', { name: imageName(b), page: b.page + 1 }),
                })),
            ]}
            onValueChange={(v) => {
              if (v !== '') commitOp({ kind: 'swap', id: block.id, with: v }, { fromBlock: false })
            }}
          />
          <NumberField
            key={block.id}
            label={t('arrange.width')}
            valueMm={block.tileW}
            unit={unit}
            unitLabel={t(`common:units.${unit}`)}
            disabled={block.fixed}
            hint={block.fixed ? t('arrange.fixedHint') : undefined}
            className="w-32"
            onChangeMm={(mm) => {
              commitOp(
                { kind: 'resize', id: block.id, tileW: mm, anchor: 'tl' },
                { fromBlock: false },
              )
            }}
          />
          <div className="ds-field">
            <span id={positionId} className="text-ink text-sm font-semibold">
              {t('arrange.position')}
            </span>
            <div role="group" aria-labelledby={positionId} className="flex gap-0.5">
              {NUDGES.map((n) => (
                <IconButton
                  key={n.key}
                  icon={n.icon}
                  label={t(`arrange.${n.key}`)}
                  variant="neutral"
                  onClick={() => {
                    commitOp(
                      { kind: 'nudge', id: block.id, dx: n.dx, dy: n.dy },
                      { fromBlock: false },
                    )
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
