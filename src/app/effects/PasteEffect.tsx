import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useImages } from '../../features/images'
import { reportPasteOutcomes } from '../import-notices'
import { useAppUi } from '../state/useAppUi'
import { shouldHandlePaste } from './paste'

const modalOpen = () => {
  const { exportOpen, editingId } = useAppUi.getState()
  return exportOpen || editingId !== null
}

const nameOf = (id: string) => useImages.getState().images.find((i) => i.id === id)?.name

export function PasteEffect(): null {
  const { t } = useTranslation()
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (!event.clipboardData || modalOpen() || !shouldHandlePaste(event.target)) return
      event.preventDefault()
      void useImages
        .getState()
        .addFromClipboard(event.clipboardData)
        .then((outcomes) => {
          reportPasteOutcomes(outcomes, t, nameOf)
        })
    }
    document.addEventListener('paste', onPaste)
    return () => {
      document.removeEventListener('paste', onPaste)
    }
  }, [t])
  return null
}
