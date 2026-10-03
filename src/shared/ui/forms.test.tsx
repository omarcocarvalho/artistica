import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { NumberField } from './NumberField'
import { parseDecimal } from './parse-decimal'
import { SegmentedControl } from './SegmentedControl'
import { Select } from './Select'
import { Slider } from './Slider'
import { Switch } from './Switch'
import fc from 'fast-check'

describe('Switch', () => {
  it('is a labelled switch that toggles', async () => {
    const onCheckedChange = vi.fn()
    render(
      <Switch
        label="Crop marks"
        checked={false}
        onCheckedChange={onCheckedChange}
        hint="Printed outside the bleed"
      />,
    )
    const sw = screen.getByRole('switch', { name: 'Crop marks' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    expect(sw).toHaveAccessibleDescription('Printed outside the bleed')
    await userEvent.click(sw)
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it('toggles with the keyboard and respects disabled', async () => {
    const onCheckedChange = vi.fn()
    const { rerender } = render(<Switch label="Bleed" checked onCheckedChange={onCheckedChange} />)
    screen.getByRole('switch').focus()
    await userEvent.keyboard(' ')
    expect(onCheckedChange).toHaveBeenCalledWith(false)
    onCheckedChange.mockClear()
    rerender(<Switch label="Bleed" checked onCheckedChange={onCheckedChange} disabled />)
    await userEvent.click(screen.getByRole('switch'))
    expect(onCheckedChange).not.toHaveBeenCalled()
  })
})

describe('SegmentedControl', () => {
  const options = [
    { value: 'auto', label: 'Auto' },
    { value: 'portrait', label: 'Portrait' },
    { value: 'landscape', label: 'Landscape' },
  ] as const

  it('is a named radio group with the current value checked', () => {
    render(
      <SegmentedControl
        label="Orientation"
        value="portrait"
        onValueChange={() => undefined}
        options={options}
      />,
    )
    expect(screen.getByRole('radiogroup', { name: 'Orientation' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Portrait' })).toBeChecked()
  })

  it('emits the clicked value and supports arrow keys', async () => {
    const onValueChange = vi.fn()
    render(
      <SegmentedControl
        label="Orientation"
        value="auto"
        onValueChange={onValueChange}
        options={options}
      />,
    )
    await userEvent.click(screen.getByRole('radio', { name: 'Landscape' }))
    expect(onValueChange).toHaveBeenLastCalledWith('landscape')
    screen.getByRole('radio', { name: 'Auto' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    // Roving focus: the arrow key moves focus to the next option (Radix then selects it).
    expect(screen.getByRole('radio', { name: 'Portrait' })).toHaveFocus()
  })
})

describe('Slider', () => {
  it('is a labelled range with a live output and emits numbers', () => {
    const onValueChange = vi.fn()
    render(
      <Slider
        label="Blur"
        value={4}
        min={0}
        max={10}
        onValueChange={onValueChange}
        formatValue={(n) => `${String(n)} px`}
      />,
    )
    const range = screen.getByRole('slider', { name: 'Blur' })
    expect(range).toHaveValue('4')
    expect(range).toHaveAttribute('aria-valuetext', '4 px')
    expect(screen.getByText('4 px').tagName).toBe('OUTPUT')
    // user-event does not implement keyboard stepping of native ranges, so fire the change itself.
    fireEvent.change(range, { target: { value: '5' } })
    expect(onValueChange).toHaveBeenCalledWith(5)
  })
})

describe('Select', () => {
  it('is a labelled native select that emits the value', async () => {
    const onValueChange = vi.fn()
    render(
      <Select
        label="Paper"
        value="A4"
        onValueChange={onValueChange}
        options={[
          { value: 'A4', label: 'A4' },
          { value: 'Letter', label: 'Letter' },
        ]}
      />,
    )
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Paper' }), 'Letter')
    expect(onValueChange).toHaveBeenCalledWith('Letter')
  })
})

describe('parseDecimal', () => {
  it('accepts dot and comma decimals and partial numbers', () => {
    expect(parseDecimal('5')).toBe(5)
    expect(parseDecimal(' 5.5 ')).toBe(5.5)
    expect(parseDecimal('5,5')).toBe(5.5)
    expect(parseDecimal('.5')).toBe(0.5)
    expect(parseDecimal('5.')).toBe(5)
  })

  it('rejects everything else', () => {
    for (const bad of [
      '',
      ' ',
      '.',
      ',',
      'abc',
      '1,000.5',
      '1e3',
      '-2',
      '+2',
      '5 mm',
      'Infinity',
      '1.2.3',
    ]) {
      expect(parseDecimal(bad)).toBeNull()
    }
  })

  it('reads back any plain decimal text (property)', () => {
    fc.assert(
      fc.property(fc.nat(100000), fc.nat(999), (whole, frac) => {
        expect(parseDecimal(`${String(whole)},${String(frac)}`)).toBe(
          Number(`${String(whole)}.${String(frac)}`),
        )
      }),
    )
  })
})

describe('NumberField', () => {
  function Harness({
    unit = 'mm',
    initial = 5,
    onChange,
  }: {
    unit?: 'mm' | 'in'
    initial?: number
    onChange?: (mm: number) => void
  }) {
    const [mm, setMm] = useState(initial)
    return (
      <NumberField
        label="Safe area"
        valueMm={mm}
        unit={unit}
        unitLabel={unit}
        minMm={3}
        maxMm={50}
        onChangeMm={(v) => {
          setMm(v)
          onChange?.(v)
        }}
      />
    )
  }

  it('shows millimetres rounded to one decimal, with the unit label', () => {
    render(<Harness initial={5.04} />)
    const field = screen.getByRole('spinbutton', { name: 'Safe area' })
    expect(field).toHaveValue('5')
    expect(screen.getByText('mm')).toBeInTheDocument()
  })

  it('shows the same value in inches, and emits millimetres', async () => {
    const onChange = vi.fn()
    render(<Harness unit="in" initial={25.4} onChange={onChange} />)
    const field = screen.getByRole('spinbutton')
    expect(field).toHaveValue('1')
    await userEvent.clear(field)
    await userEvent.type(field, '0.5{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(12.7)
  })

  it('accepts a comma decimal and commits on blur', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const field = screen.getByRole('spinbutton')
    await userEvent.clear(field)
    await userEvent.type(field, '7,5')
    await userEvent.tab()
    expect(onChange).toHaveBeenLastCalledWith(7.5)
    expect(field).toHaveValue('7.5')
  })

  it('lets the field be empty or half-typed without emitting', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const field = screen.getByRole('spinbutton')
    await userEvent.clear(field)
    await userEvent.type(field, '.')
    expect(onChange).not.toHaveBeenCalled()
    await userEvent.tab()
    expect(field).toHaveValue('5')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('clamps to min and max', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const field = screen.getByRole('spinbutton')
    await userEvent.clear(field)
    await userEvent.type(field, '999{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(50)
    expect(field).toHaveValue('50')
    await userEvent.clear(field)
    await userEvent.type(field, '1{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(3)
  })

  it('steps with arrow keys, ten times as far with Shift', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    screen.getByRole('spinbutton').focus()
    await userEvent.keyboard('{ArrowUp}')
    expect(onChange).toHaveBeenLastCalledWith(6)
    await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}')
    expect(onChange).toHaveBeenLastCalledWith(3)
  })

  it('does not emit (and so cannot drift) when the typed value shows the same number', async () => {
    const onChange = vi.fn()
    render(<Harness unit="in" initial={5.08} onChange={onChange} />)
    const field = screen.getByRole('spinbutton')
    expect(field).toHaveValue('0.2')
    await userEvent.clear(field)
    await userEvent.type(field, '0.2{Enter}')
    expect(onChange).not.toHaveBeenCalled()
  })
})
