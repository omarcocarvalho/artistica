import type { ReactNode } from 'react'
import { DetectionsContext, type DetectionActions } from './detection-actions'

/** The guides section shows only inside this provider. */
export function DetectionsProvider({
  value,
  children,
}: {
  readonly value: DetectionActions
  readonly children: ReactNode
}) {
  return <DetectionsContext value={value}>{children}</DetectionsContext>
}
