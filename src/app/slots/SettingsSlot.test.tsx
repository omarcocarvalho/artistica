import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import { initI18n } from '../../shared/i18n'
import { SettingsSlot } from './SettingsSlot'

beforeAll(async () => {
  await initI18n()
})

describe('SettingsSlot', () => {
  it('mounts the page setup panel with no suggestion before a layout exists', () => {
    render(<SettingsSlot />)
    expect(screen.getByLabelText('Paper size')).toBeInTheDocument()
    expect(screen.queryByText(/fits/)).not.toBeInTheDocument()
  })
})
