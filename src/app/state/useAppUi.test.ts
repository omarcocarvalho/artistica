import { beforeEach, describe, expect, it } from 'vitest'
import type { ImageId } from '../../shared/model/image'
import { useAppUi } from './useAppUi'

const id = 'img-1' as ImageId

beforeEach(() => {
  useAppUi.setState(useAppUi.getInitialState())
})

describe('useAppUi', () => {
  it('starts on the images step with nothing open and guides on', () => {
    const s = useAppUi.getState()
    expect(s.step).toBe('images')
    expect(s.editingId).toBeNull()
    expect(s.exportOpen).toBe(false)
    expect(s.showGuides).toBe(true)
  })
  it('remembers the settings tab, starting on Page', () => {
    expect(useAppUi.getState().settingsTab).toBe('page')
    useAppUi.getState().setSettingsTab('studies')
    expect(useAppUi.getState().settingsTab).toBe('studies')
    useAppUi.getState().setSettingsTab('lines')
    expect(useAppUi.getState().settingsTab).toBe('lines')
  })
  it('opens and closes the editor and the export dialog independently', () => {
    useAppUi.getState().openEdit(id)
    expect(useAppUi.getState().editingId).toBe(id)
    useAppUi.getState().openExport()
    expect(useAppUi.getState().exportOpen).toBe(true)
    useAppUi.getState().closeEdit()
    expect(useAppUi.getState().editingId).toBeNull()
    expect(useAppUi.getState().exportOpen).toBe(true)
    useAppUi.getState().closeExport()
    expect(useAppUi.getState().exportOpen).toBe(false)
  })
  it('sets the step and the guides flag', () => {
    useAppUi.getState().setStep('preview')
    useAppUi.getState().setShowGuides(false)
    expect(useAppUi.getState().step).toBe('preview')
    expect(useAppUi.getState().showGuides).toBe(false)
  })
})
