import { LeaveWarningEffect } from './LeaveWarningEffect'
import { LineDefaultsEffect } from './LineDefaultsEffect'
import { PasteEffect } from './PasteEffect'
import { PipelineEffect } from './PipelineEffect'
import { StudyDefaultsEffect } from './StudyDefaultsEffect'

export function AppEffects() {
  return (
    <>
      <StudyDefaultsEffect />
      <LineDefaultsEffect />
      <PipelineEffect />
      <PasteEffect />
      <LeaveWarningEffect />
    </>
  )
}
