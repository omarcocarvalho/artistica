import { ModalSurface, type ModalSurfaceProps, type SurfaceLayout } from './ModalSurface'

export type BottomSheetProps = ModalSurfaceProps

const SHEET: SurfaceLayout = { content: 'ds-sheet', body: 'ds-sheet__body', grab: true }

/** The phone variant of Dialog: slides up from the bottom edge, same focus handling. */
export function BottomSheet(props: BottomSheetProps) {
  return <ModalSurface {...props} layout={SHEET} />
}
