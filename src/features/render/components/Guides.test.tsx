import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../../shared/i18n'
import { GuidesLegend } from './GuidesLegend'
import { GuidesToggle } from './GuidesToggle'

beforeAll(async () => {
  await initI18n()
})

describe('GuidesToggle', () => {
  it('is a labelled switch that reports changes', async () => {
    const onChange = vi.fn()
    render(<GuidesToggle checked onCheckedChange={onChange} />)
    const sw = screen.getByRole('switch', { name: 'Guides' })
    expect(sw).toBeChecked()
    await userEvent.setup().click(sw)
    expect(onChange).toHaveBeenCalledWith(false)
  })
})

describe('GuidesLegend', () => {
  it('lists the four guide kinds', () => {
    render(<GuidesLegend />)
    const list = screen.getByRole('list', { name: 'Legend' })
    expect(list).toHaveTextContent('Safe area')
    expect(list).toHaveTextContent('Bleed')
    expect(list).toHaveTextContent('Cut line')
    expect(list).toHaveTextContent('Crop mark')
  })
})
