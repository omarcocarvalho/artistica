import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../i18n'
import type { Unit } from '../model/units'
import { NumberField } from './NumberField'

function Harness({
  unit,
  initial,
  onChange,
}: {
  unit: Unit
  initial: number
  onChange?: (mm: number) => void
}) {
  const [mm, setMm] = useState(initial)
  return (
    <NumberField
      label="Largura"
      valueMm={mm}
      unit={unit}
      maxMm={2000}
      onChangeMm={(v) => {
        setMm(v)
        onChange?.(v)
      }}
    />
  )
}

describe('NumberField in Portuguese (Brazil)', () => {
  beforeAll(async () => {
    const i18n = await initI18n({ savedLanguage: 'en' })
    i18n.addResourceBundle('pt-BR', 'common', { actions: { close: 'Fechar' } })
    await i18n.changeLanguage('pt-BR')
  })
  afterAll(async () => {
    const i18n = await initI18n()
    await i18n.changeLanguage('en')
  })

  it('shows a decimal comma without grouping, the unit symbol and a plain aria-valuenow', () => {
    render(<Harness unit="mm" initial={1234.5} />)
    const field = screen.getByRole('spinbutton', { name: 'Largura' })
    expect(field).toHaveValue('1234,5')
    expect(field).toHaveAttribute('aria-valuetext', '1.234,5 mm')
    expect(field).toHaveAttribute('aria-valuenow', '1234.5')
    expect(screen.getByText('mm')).toBeInTheDocument()
  })

  it("uses the language's inch symbol", () => {
    render(<Harness unit="in" initial={38.1} />)
    const field = screen.getByRole('spinbutton')
    expect(field).toHaveValue('1,5')
    expect(field).toHaveAttribute('aria-valuetext', '1,5 pol.')
    expect(screen.getByText('pol.')).toBeInTheDocument()
  })

  it('reads a typed comma and shows the value back with one', async () => {
    const onChange = vi.fn()
    render(<Harness unit="mm" initial={5} onChange={onChange} />)
    const field = screen.getByRole('spinbutton')
    await userEvent.clear(field)
    await userEvent.type(field, '1200,5{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(1200.5)
    expect(field).toHaveValue('1200,5')
  })
})
