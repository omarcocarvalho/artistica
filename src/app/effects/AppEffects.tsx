import { LeaveWarningEffect } from './LeaveWarningEffect'
import { PasteEffect } from './PasteEffect'
import { PipelineEffect } from './PipelineEffect'
import { StudyDefaultsEffect } from './StudyDefaultsEffect'

export function AppEffects() {
  return (
    <>
      <StudyDefaultsEffect />
      <PipelineEffect />
      <PasteEffect />
      <LeaveWarningEffect />
    </>
  )
}
