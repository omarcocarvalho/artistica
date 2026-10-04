import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { BottomSheet, Button, Dialog } from '../../shared/ui'
import { useIsDesktop } from '../hooks/useIsDesktop'

export interface ResponsiveSheetProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly title: string
  readonly closeLabel: string
  readonly footer?: ReactNode
  readonly children: ReactNode
}

/** Dialog at >= 960 px, BottomSheet below. Always has a "Done" button that closes it (CR-X3); `footer` adds extra actions before it. */
export function ResponsiveSheet({ children, footer, onOpenChange, ...rest }: ResponsiveSheetProps) {
  const { t } = useTranslation('app')
  const isDesktop = useIsDesktop()
  const done = (
    <>
      {footer}
      <Button
        variant="primary"
        onClick={() => {
          onOpenChange(false)
        }}
      >
        {t('mobile.done')}
      </Button>
    </>
  )
  const Container = isDesktop ? Dialog : BottomSheet
  return (
    <Container {...rest} onOpenChange={onOpenChange} footer={done}>
      {children}
    </Container>
  )
}
