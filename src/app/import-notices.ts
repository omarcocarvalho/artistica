import type { TFunction } from 'i18next'
import {
  decodedPixelLimit,
  importErrorKeys,
  MAX_FILE_BYTES,
  type ImportErrorCode,
  type ImportOutcome,
} from '../features/images'
import { formatList } from '../shared/i18n/format'
import type { ImageId } from '../shared/model/image'
import { useNotices } from './state/useNotices'

const MAX_SOURCES = 3
/** Interpolation values for C's `errors:images.tooLarge.message`, for this device now. */
const tooLarge = () => ({
  maxMb: MAX_FILE_BYTES / (1024 * 1024),
  maxMp: decodedPixelLimit() / 1_000_000,
})

/**
 * Notices for the outcomes of E's own document paste listener (CR-E3, CR-X2). Imports started inside
 * `ImportDropzone` get C's inline callouts and are never passed here, so nothing is shown twice.
 */
export function reportPasteOutcomes(
  outcomes: readonly ImportOutcome[],
  t: TFunction,
  getName: (id: ImageId) => string | undefined,
): void {
  const notify = (kind: 'error' | 'info', message: string): void => {
    useNotices.getState().notify(kind, message)
  }
  if (outcomes.length === 0) {
    notify('info', t('app:import.noImage'))
    return
  }
  const byCode = new Map<ImportErrorCode, string[]>()
  for (const o of outcomes) {
    if (!o.ok) {
      byCode.set(o.error, [...(byCode.get(o.error) ?? []), o.source])
    } else if (o.warnings?.includes('animated-gif')) {
      const name = getName(o.id) ?? t('app:import.unnamed')
      notify('info', t('app:import.animatedGif', { name }))
    }
  }
  for (const [code, sources] of byCode) {
    const keys = importErrorKeys(code)
    const more = sources.length - MAX_SOURCES
    const shown = sources.slice(0, MAX_SOURCES)
    const list = formatList(more > 0 ? [...shown, t('app:import.more', { count: more })] : shown)
    const params = { name: sources[0] ?? '', ...tooLarge() }
    notify(
      'error',
      t('app:import.failed', {
        list,
        title: t(keys.title, params),
        message: t(keys.message, params),
      }),
    )
  }
}
