import { useEffect, useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../shared/ui'
import { EmptyState } from '../components/EmptyState'
import { EmptyActionsSlot, ImagesSlot } from '../slots/ImagesSlot'
import { PreviewSlot } from '../slots/PreviewSlot'
import { SettingsSlot } from '../slots/SettingsSlot'
import { useImageCount } from '../state/hasImages'
import { useAppUi, type StepId } from '../state/useAppUi'
import { nextStep, prevStep, STEPS, stepIndex } from './steps'

export function MobileFlow() {
  const { t } = useTranslation('app')
  const step = useAppUi((s) => s.step)
  const imageCount = useImageCount()
  const setStep = (next: StepId) => {
    useAppUi.getState().setStep(next)
  }
  const headingRef = useRef<HTMLHeadingElement>(null)
  const reasonId = useId()
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    headingRef.current?.focus()
  }, [step])

  const name = t(`mobile.names.${step}`)
  const index = stepIndex(step)
  const noImages = imageCount === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav aria-label={t('mobile.steps')} className="border-line bg-surface border-b">
        <ol className="grid grid-cols-4">
          {STEPS.map((s: StepId) => (
            <li key={s}>
              <button
                type="button"
                aria-current={s === step ? 'step' : undefined}
                className="aria-[current=step]:border-accent min-h-11 w-full px-1 text-sm aria-[current=step]:border-b-2 aria-[current=step]:font-semibold"
                onClick={() => {
                  setStep(s)
                }}
              >
                {t(`mobile.names.${s}`)}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <main id="main" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto">
        <section
          aria-label={t('mobile.stepLabel', { current: index + 1, total: STEPS.length, name })}
          className="flex flex-col gap-4 p-4"
        >
          <h2 ref={headingRef} tabIndex={-1} className="font-display text-xl outline-none">
            {name}
          </h2>
          {step === 'images' &&
            (noImages ? <EmptyState actions={<EmptyActionsSlot />} /> : <ImagesSlot />)}
          {step === 'page' && <SettingsSlot />}
          {step === 'preview' &&
            (noImages ? <EmptyState actions={<EmptyActionsSlot />} /> : <PreviewSlot />)}
          {step === 'export' && (
            <div className="flex flex-col gap-3">
              <p>{t('mobile.export.summary', { count: imageCount })}</p>
              <Button
                variant="primary"
                size="lg"
                aria-disabled={noImages || undefined}
                aria-describedby={noImages ? reasonId : undefined}
                onClick={
                  noImages
                    ? undefined
                    : () => {
                        useAppUi.getState().openExport()
                      }
                }
              >
                {t('mobile.export.create')}
              </Button>
              {noImages && (
                <p id={reasonId} className="text-ink-muted text-sm">
                  {t('topBar.exportNoImages')}
                </p>
              )}
              <p className="text-ink-muted text-sm">{t('mobile.export.tip')}</p>
            </div>
          )}
        </section>
      </main>

      <footer className="border-line bg-surface flex gap-3 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button
          size="lg"
          disabled={index === 0}
          onClick={() => {
            setStep(prevStep(step))
          }}
        >
          {t('mobile.back')}
        </Button>
        <span className="flex-1" />
        {index < STEPS.length - 1 && (
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              setStep(nextStep(step))
            }}
          >
            {t('mobile.next')}
          </Button>
        )}
      </footer>
    </div>
  )
}
