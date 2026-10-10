import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { cx } from '../../../shared/ui'
import type { SizeMm } from '../../../shared/model/paper'
import type { ArrangeBlock, ArrangeCorner, ArrangeIntent, ArrangeProps } from './arrange-types'
import { useBlockDrag, type GhostBox } from './use-block-drag'
import './arrange.css'

const CORNERS: readonly ArrangeCorner[] = ['tl', 'tr', 'bl', 'br']
const STEPS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

export interface ArrangeLayerProps {
  readonly arrange: ArrangeProps
  readonly page: number
  readonly pageSize: SizeMm
  readonly sheet: () => HTMLElement | null
  /** Low-DPI and scaled-to-fit warnings of the tiles in each block, by block id. */
  readonly warnings?: ReadonlyMap<string, string>
}

const pct = (mm: number, of: number) => `${String((mm / of) * 100)}%`

const boxStyle = (g: GhostBox) => ({
  width: `${String(g.width)}px`,
  height: `${String(g.height)}px`,
  transform: `translate(${String(g.left)}px, ${String(g.top)}px)`,
})

/** Arrange mode (M5-R15): one focusable "movable photo" per block, with pointer and keyboard moves. */
export function ArrangeLayer({ arrange, page, pageSize, sheet, warnings }: ArrangeLayerProps) {
  const { t } = useTranslation('preview')
  const helpId = useId()
  const fixedId = `${helpId}-fixed`
  const refs = useRef(new Map<string, HTMLDivElement>())
  const heldRefusal = useRef<string | null>(null)
  const { drag, start } = useBlockDrag({ arrange, page, pageW: pageSize.w, sheet })
  const blocks = arrange.blocks.filter((b) => b.page === page)
  const { focusId, onFocused } = arrange

  useEffect(() => {
    if (focusId === null) return
    const el = refs.current.get(focusId)
    if (!el) return
    if (document.activeElement !== el) el.focus({ preventScroll: true })
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    onFocused(focusId)
  })

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>, b: ArrangeBlock) => {
    const step = STEPS[e.key]
    if (step) {
      e.preventDefault()
      if (e.repeat && heldRefusal.current === e.key) return
      const [dx, dy] = step
      const intent: ArrangeIntent = e.shiftKey
        ? { kind: 'resize', id: b.id, tileW: b.tileW + (dx + dy > 0 ? 1 : -1), anchor: 'tl' }
        : { kind: 'nudge', id: b.id, dx, dy }
      heldRefusal.current = arrange.onCommit(intent) ? null : e.key
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (e.repeat) return
      const picked = arrange.pickedUp
      if (picked !== null && picked !== b.id)
        arrange.onCommit({ kind: 'swap', id: picked, with: b.id })
      else arrange.onPickUp(picked === b.id ? null : b.id)
      return
    }
    if (e.key === 'Escape' && arrange.pickedUp !== null) {
      e.preventDefault()
      arrange.onPickUp(null)
    }
  }

  return (
    <>
      <span id={helpId} className="sr-only">
        {t('arrange.instructions')}
      </span>
      <span id={fixedId} className="sr-only">
        {t('arrange.fixedHint')}
      </span>
      {blocks.map((b) => {
        const selected = b.id === arrange.selected
        const picked = b.id === arrange.pickedUp
        const warning = warnings?.get(b.id)
        const warningId = `${helpId}-warn-${b.id}`
        return (
          <div
            key={b.id}
            ref={(el) => {
              if (el) refs.current.set(b.id, el)
              else refs.current.delete(b.id)
            }}
            role="button"
            tabIndex={0}
            aria-roledescription={t('arrange.roleDescription')}
            aria-label={b.name}
            aria-describedby={[helpId, b.fixed ? fixedId : null, warning ? warningId : null]
              .filter(Boolean)
              .join(' ')}
            data-block-id={b.id}
            className={cx(
              'arrange-block',
              selected && 'is-selected',
              picked && 'is-picked',
              drag?.id === b.id && 'is-origin',
            )}
            style={{
              left: pct(b.rect.x, pageSize.w),
              top: pct(b.rect.y, pageSize.h),
              width: pct(b.rect.w, pageSize.w),
              height: pct(b.rect.h, pageSize.h),
            }}
            onPointerDown={(e) => {
              if (!selected) arrange.onSelect(b.id)
              start(e, b, null)
            }}
            onFocus={() => {
              if (!selected) arrange.onSelect(b.id)
            }}
            onKeyDown={(e) => {
              onKeyDown(e, b)
            }}
            onKeyUp={() => {
              heldRefusal.current = null
            }}
          >
            {warning && (
              <span id={warningId} className="sr-only">
                {warning}
              </span>
            )}
            {picked && (
              <span className="arrange-chip arrange-chip--swap" aria-hidden="true">
                {t('arrange.chip.pickedUp')}
              </span>
            )}
            {selected &&
              !b.fixed &&
              CORNERS.map((c) => (
                <span
                  key={c}
                  className="arrange-handle"
                  data-corner={c}
                  aria-hidden="true"
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    start(e, b, c)
                  }}
                />
              ))}
          </div>
        )
      })}
      {drag?.swapTarget && (
        <div className="arrange-swap-target" aria-hidden="true" style={boxStyle(drag.swapTarget)}>
          <span className="arrange-chip arrange-chip--swap">{t('arrange.chip.swap')}</span>
        </div>
      )}
      {drag && (
        <div
          className={cx('arrange-ghost', !drag.valid && 'is-invalid')}
          aria-hidden="true"
          data-testid="arrange-ghost"
          style={boxStyle(drag.ghost)}
        >
          {!drag.valid && (
            <span className="arrange-chip arrange-chip--danger">{t('arrange.chip.invalid')}</span>
          )}
        </div>
      )}
    </>
  )
}
