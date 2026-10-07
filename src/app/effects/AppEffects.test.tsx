import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useImages } from '../../features/images'
import { makeLoadedImage } from '../../features/images/test-utils'
import { useSettings } from '../../features/settings'
import type { ImageId } from '../../shared/model/image'

vi.mock('./PipelineEffect', () => ({ PipelineEffect: () => null }))
vi.mock('./PasteEffect', () => ({ PasteEffect: () => null }))
vi.mock('./LeaveWarningEffect', () => ({ LeaveWarningEffect: () => null }))

import { AppEffects } from './AppEffects'

const A = 'a' as ImageId

beforeEach(() => {
  localStorage.clear()
  useSettings.getState().reset()
  useImages.setState({ images: [makeLoadedImage({ id: A, name: 'a.jpg' })], selectedId: A })
})

describe('AppEffects', () => {
  it('remembers the selected image’s study and line edits', () => {
    render(<AppEffects />)
    act(() => {
      useImages.getState().updateStudy(A, { blurPct: 63 })
      useImages.getState().updateLines(A, { style: { opacityPct: 40 } })
    })
    expect(useSettings.getState().studyDefaults.blurPct).toBe(63)
    expect(useSettings.getState().lineDefaults.style.opacityPct).toBe(40)
  })
})
