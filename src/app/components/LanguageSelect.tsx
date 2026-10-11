import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettings } from '../../features/settings'
import {
  DEFAULT_LANGUAGE,
  ENDONYMS,
  availableLanguages,
  isLanguageCode,
  setAppLanguage,
  type LanguageCode,
} from '../../shared/i18n'
import { Icon } from '../../shared/ui'
import { useNotices } from '../state/useNotices'

const FOCUS_RING =
  'has-[select:focus-visible]:outline-solid has-[select:focus-visible]:outline-(length:--focus-ring-width) has-[select:focus-visible]:outline-(--focus-ring-color) has-[select:focus-visible]:outline-offset-(--focus-ring-offset)'

export function LanguageSelect() {
  const { t, i18n } = useTranslation('app')
  const id = useId()
  const current = isLanguageCode(i18n.language) ? i18n.language : DEFAULT_LANGUAGE
  const [pending, setPending] = useState<LanguageCode | null>(null)
  const latest = useRef<LanguageCode | null>(null)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const shown = pending ?? current

  const choose = (code: LanguageCode) => {
    latest.current = code
    setPending(code)
    queue.current = queue.current.then(async () => {
      if (latest.current !== code) return
      const result = await setAppLanguage(code)
      if (result === 'changed') useSettings.getState().setLanguage(code)
      if (latest.current !== code) return
      if (result === 'failed') {
        useNotices.getState().notify('error', i18n.t('app:language.loadFailed'))
      }
      latest.current = null
      setPending(null)
    })
  }

  return (
    <span
      className={`hover:bg-surface-sunken touch:min-h-(--size-target) touch:min-w-(--size-target) relative inline-flex min-h-(--size-target-dense) shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 text-sm font-semibold whitespace-nowrap max-sm:px-0 forced-colors:border-[ButtonText] ${FOCUS_RING}`}
    >
      <Icon name="globe" className="max-sm:size-5" />
      <span data-language-name lang={shown} aria-hidden="true" className="hidden sm:inline">
        {ENDONYMS[shown]}
      </span>
      <Icon
        name="chevronDown"
        width="0.8em"
        height="0.8em"
        className="text-ink-muted hidden sm:inline"
      />
      <label htmlFor={id} className="sr-only">
        {t('language.label')}
      </label>
      <select
        id={id}
        value={shown}
        aria-busy={pending !== null || undefined}
        className="absolute -inset-px m-0 h-[calc(100%+2px)] w-[calc(100%+2px)] cursor-pointer border-0 text-base opacity-0"
        onChange={(e) => {
          const code = e.currentTarget.value
          if (isLanguageCode(code)) choose(code)
        }}
      >
        {availableLanguages().map((code) => (
          <option key={code} value={code} lang={code}>
            {ENDONYMS[code]}
          </option>
        ))}
      </select>
    </span>
  )
}
