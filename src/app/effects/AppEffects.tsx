import { LeaveWarningEffect } from './LeaveWarningEffect'
import { PasteEffect } from './PasteEffect'
import { PipelineEffect } from './PipelineEffect'

export function AppEffects() {
  return (
    <>
      <PipelineEffect />
      <PasteEffect />
      <LeaveWarningEffect />
    </>
  )
}
