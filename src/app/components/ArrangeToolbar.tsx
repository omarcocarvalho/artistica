import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useImages } from '../../features/images'
import type { ArrangeBlock } from '../../features/render'
import { useSettings } from '../../features/settings'
import { mmToUnit, roundForUnit } from '../../shared/model/units'
import {
  BottomSheet,
  Button,
  cx,
  Dialog,
  IconButton,
  NumberField,
  Select,
  type IconName,
} from '../../shared/ui'
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

type Variant = 'desktop' | 'phone'

interface SelectedControlsProps {
  readonly block: ArrangeBlock
  readonly blocks: readonly ArrangeBlock[]
  readonly pageCount: number
  readonly imageName: (b: ArrangeBlock) => string
  readonly variant: Variant
}

/** Move to page, Swap with…, Width and Position for one photo: the single-pointer path for every drag. */
function SelectedControls({ block, blocks, pageCount, imageName, variant }: SelectedControlsProps) {
  const { t } = useTranslation(['preview', 'common'])
  const unit = useSettings((s) => s.unit)
  const positionId = useId()
  const phone = variant === 'phone'
  return (
    <div
      role="group"
      aria-label={t('arrange.selectedGroup', { name: imageName(block) })}
      className={cx('flex gap-x-3 gap-y-2', phone ? 'flex-col' : 'flex-wrap items-end')}
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
        className={phone ? undefined : 'w-32'}
        onChangeMm={(mm) => {
          commitOp({ kind: 'resize', id: block.id, tileW: mm, anchor: 'tl' }, { fromBlock: false })
        }}
      />
      <div className="ds-field">
        <span id={positionId} className="text-ink text-sm font-semibold">
          {t('arrange.position')}
        </span>
        <div
          role="group"
          aria-labelledby={positionId}
          className={phone ? 'flex gap-2' : 'flex gap-0.5'}
        >
          {NUDGES.map((n) => (
            <IconButton
              key={n.key}
              icon={n.icon}
              label={t(`arrange.${n.key}`)}
              variant="neutral"
              size={phone ? 'lg' : 'md'}
              onClick={() => {
                commitOp({ kind: 'nudge', id: block.id, dx: n.dx, dy: n.dy }, { fromBlock: false })
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function blockElement(id: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>('[data-block-id]'))
    if (el.dataset.blockId === id) return el
  return null
}

/**
 * Arrange, Undo, Re-run, and single-pointer controls for the selected photo (WCAG 2.5.7). On the
 * phone the bar sits under the pages and the photo's controls open in a sheet ("Photo options").
 */
export function ArrangeToolbar({ variant = 'desktop' }: { readonly variant?: Variant }) {
  const { t } = useTranslation(['preview', 'common', 'app'])
  const mode = useArrange((s) => s.mode)
  const stored = useArrange((s) => s.manual)
  const canUndo = useArrange((s) => s.undo.length > 0)
  const selected = useArrange((s) => s.selected)
  const unit = useSettings((s) => s.unit)
  const images = useImages((s) => s.images)
  const { manual, blocks } = useArrangeView()
  const [confirming, setConfirming] = useState(false)
  const [optionsFor, setOptionsFor] = useState<string | null>(null)
  const names = useMemo(() => new Map(images.map((i) => [i.id, i.name])), [images])
  const block = mode ? blocks.find((b) => b.id === selected) : undefined
  const imageName = (b: ArrangeBlock) => names.get(b.imageId) ?? ''
  const pageCount = manual?.pageCount ?? 0
  const phone = variant === 'phone'
  if (optionsFor !== null && optionsFor !== block?.id) setOptionsFor(null)

  const toggle = (
    <Button
      icon="move"
      size={phone ? 'lg' : 'md'}
      aria-pressed={mode}
      onClick={() => {
        setArrangeMode(!mode)
      }}
    >
      {t('arrange.toggle')}
    </Button>
  )
  const openConfirm = () => {
    setConfirming(true)
  }
  const confirm = (
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
  )

  if (!phone)
    return (
      <>
        {toggle}
        <Button icon="undo" disabled={!canUndo} onClick={undoArrange}>
          {t('arrange.undo')}
        </Button>
        <Button icon="rerun" disabled={stored === null} onClick={openConfirm}>
          {t('arrange.rerun')}
        </Button>
        {confirm}
        {block && (
          <SelectedControls
            block={block}
            blocks={blocks}
            pageCount={pageCount}
            imageName={imageName}
            variant="desktop"
          />
        )}
      </>
    )

  const closeOptions = (open: boolean) => {
    if (!open) setOptionsFor(null)
  }
  const unitLabel = t(`common:units.${unit}`)
  const fmt = (mm: number) => roundForUnit(mmToUnit(mm, unit), unit)

  return (
    <>
      <div
        role="group"
        aria-label={t('arrange.barLabel')}
        className="flex flex-wrap justify-center gap-2"
      >
        {toggle}
        <IconButton
          icon="undo"
          size="lg"
          variant="neutral"
          label={t('arrange.undo')}
          disabled={!canUndo}
          onClick={undoArrange}
        />
        <IconButton
          icon="rerun"
          size="lg"
          variant="neutral"
          label={t('arrange.rerun')}
          disabled={stored === null}
          onClick={openConfirm}
        />
        {block && (
          <Button
            icon="more"
            size="lg"
            onClick={() => {
              setOptionsFor(block.id)
            }}
          >
            {t('arrange.photoOptions')}
          </Button>
        )}
      </div>
      {confirm}
      {block && (
        <BottomSheet
          open={optionsFor === block.id}
          returnFocus={() => blockElement(block.id)}
          onClosed={() => {
            blockElement(block.id)?.scrollIntoView({ block: 'nearest', inline: 'center' })
          }}
          onOpenChange={closeOptions}
          title={imageName(block)}
          description={t('arrange.sheetSummary', {
            w: fmt(block.rect.w),
            h: fmt(block.rect.h),
            unit: unitLabel,
            page: block.page + 1,
            total: pageCount,
          })}
          closeLabel={t('arrange.close')}
          footer={
            <Button
              variant="primary"
              size="lg"
              block
              onClick={() => {
                closeOptions(false)
              }}
            >
              {t('app:mobile.done')}
            </Button>
          }
        >
          <SelectedControls
            block={block}
            blocks={blocks}
            pageCount={pageCount}
            imageName={imageName}
            variant="phone"
          />
        </BottomSheet>
      )}
    </>
  )
}
