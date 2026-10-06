import { ModalSurface, type ModalSurfaceProps, type SurfaceLayout } from './ModalSurface'

export interface DialogProps extends ModalSurfaceProps {
  size?: 'sm' | 'lg'
}

const LAYOUTS: Record<NonNullable<DialogProps['size']>, SurfaceLayout> = {
  lg: { content: 'ds-dialog', body: 'ds-dialog__body' },
  sm: { content: 'ds-dialog ds-dialog--sm', body: 'ds-dialog__body' },
}

/** Modal dialog: focus is trapped, Esc and the backdrop close it, focus returns to the opener. */
export function Dialog({ size = 'lg', ...props }: DialogProps) {
  return <ModalSurface {...props} layout={LAYOUTS[size]} />
}
