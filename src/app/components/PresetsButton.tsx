import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../shared/ui'
import { PresetsDialog } from './PresetsDialog'

export function PresetsButton() {
  const { t } = useTranslation('presets')
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        icon="sliders"
        onClick={() => {
          setOpen(true)
        }}
      >
        {t('button')}
      </Button>
      <PresetsDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
