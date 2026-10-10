import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ColourField } from './ColourField'
import { CountField } from './CountField'
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

describe('Switch describedBy', () => {
  it('adds the given description after its hint', () => {
    render(
      <>
        <Switch
          label="Grid"
          checked={false}
          onCheckedChange={vi.fn()}
          hint="Equal cells"
          describedBy="why"
        />
        <Switch label="Thirds" checked={false} onCheckedChange={vi.fn()} describedBy="why" />
        <span id="why">Waiting</span>
      </>,
    )
    expect(screen.getByRole('switch', { name: 'Grid' })).toHaveAccessibleDescription(
      'Equal cells Waiting',
    )
    expect(screen.getByRole('switch', { name: 'Thirds' })).toHaveAccessibleDescription('Waiting')
  })
})

describe('SegmentedControl', () => {
  const options = [
    { value: 'auto', label: 'Auto' },
    { value: 'portrait', label: 'Portrait' },
    { value: 'landscape', label: 'Landscape' },
  ] as const

  it('disables every option and describes each one when asked', async () => {
    const onValueChange = vi.fn()
    render(
      <>
        <SegmentedControl
          label="Orientation"
          value="auto"
          onValueChange={onValueChange}
          options={options}
          disabled
          describedBy="why"
        />
        <span id="why">Waiting</span>
      </>,
    )
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toBeDisabled()
      expect(radio).toHaveAccessibleDescription('Waiting')
    }
    await userEvent.click(screen.getByRole('radio', { name: 'Landscape' }))
    expect(onValueChange).not.toHaveBeenCalled()
  })

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
    expect(screen.getByRole('radio', { name: 'Portrait' })).toHaveFocus()
    expect(onValueChange).toHaveBeenLastCalledWith('portrait')
  })

  type Opt = 'a' | 'b' | 'c' | 'd'
  const abcd: readonly { value: Opt; label: string; disabled?: boolean }[] = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
    { value: 'c', label: 'C' },
    { value: 'd', label: 'D' },
  ]

  function Controlled({
    initial = 'a',
    opts = abcd,
    onChange,
  }: {
    initial?: Opt
    opts?: readonly { value: Opt; label: string; disabled?: boolean }[]
    onChange?: (v: Opt) => void
  }) {
    const [value, setValue] = useState<Opt>(initial)
    return (
      <SegmentedControl
        label="Letters"
        value={value}
        onValueChange={(v) => {
          setValue(v)
          onChange?.(v)
        }}
        options={opts}
      />
    )
  }

  const radio = (name: string) => screen.getByRole('radio', { name })
  const checkedName = () =>
    screen.getAllByRole('radio').find((r) => r.getAttribute('aria-checked') === 'true')?.textContent

  async function press(start: string, key: string): Promise<void> {
    radio(start).focus()
    await userEvent.keyboard(`{${key}}`)
  }

  it.each([
    ['ArrowDown', 'A', 'B'],
    ['ArrowRight', 'A', 'B'],
    ['ArrowUp', 'B', 'A'],
    ['ArrowLeft', 'B', 'A'],
    ['ArrowDown', 'D', 'A'],
    ['ArrowRight', 'D', 'A'],
    ['ArrowUp', 'A', 'D'],
    ['ArrowLeft', 'A', 'D'],
  ])('{%s} from %s selects and focuses %s, wrapping at the ends', async (key, start, expected) => {
    const onChange = vi.fn()
    render(<Controlled initial={start.toLowerCase() as Opt} onChange={onChange} />)
    await press(start, key)
    expect(radio(expected)).toHaveFocus()
    expect(checkedName()).toBe(expected)
    expect(onChange).toHaveBeenLastCalledWith(expected.toLowerCase())
  })

  it('Home selects the first enabled option and End the last', async () => {
    const opts = abcd.map((o) =>
      o.value === 'a' || o.value === 'd' ? { ...o, disabled: true } : o,
    )
    const onChange = vi.fn()
    render(<Controlled initial="c" opts={opts} onChange={onChange} />)
    await press('C', 'Home')
    expect(radio('B')).toHaveFocus()
    expect(checkedName()).toBe('B')
    expect(onChange).toHaveBeenLastCalledWith('b')
    await userEvent.keyboard('{End}')
    expect(radio('C')).toHaveFocus()
    expect(checkedName()).toBe('C')
    expect(onChange).toHaveBeenLastCalledWith('c')
  })

  it('Home and End select the first and last option when every option is enabled', async () => {
    render(<Controlled initial="b" />)
    await press('B', 'End')
    expect(checkedName()).toBe('D')
    await userEvent.keyboard('{Home}')
    expect(checkedName()).toBe('A')
  })

  it.each(['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'])(
    'disabled options are skipped by {%s}',
    async (key) => {
      const opts = abcd.map((o) =>
        o.value === 'b' || o.value === 'd' ? { ...o, disabled: true } : o,
      )
      const onChange = vi.fn()
      const start = key === 'End' ? 'A' : 'C'
      render(<Controlled initial={start === 'A' ? 'a' : 'c'} opts={opts} onChange={onChange} />)
      await press(start, key)
      await userEvent.keyboard(`{${key}}`)
      await userEvent.keyboard(`{${key}}`)
      expect(onChange).toHaveBeenCalled()
      for (const [value] of onChange.mock.calls) expect(['a', 'c']).toContain(value)
      expect(['A', 'C']).toContain(checkedName())
      expect(radio('B')).not.toHaveFocus()
      expect(radio('D')).not.toHaveFocus()
    },
  )

  it('a key held down until the focus has moved changes the value once', async () => {
    const onChange = vi.fn()
    render(<Controlled initial="a" onChange={onChange} />)
    radio('A').focus()
    await userEvent.keyboard('{ArrowDown>}')
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    await userEvent.keyboard('{/ArrowDown}')
    expect(radio('B')).toHaveFocus()
    expect(onChange.mock.calls).toEqual([['b']])
  })

  it('Home on the first option and End on the last report no change', async () => {
    const onChange = vi.fn()
    render(<Controlled initial="a" onChange={onChange} />)
    await press('A', 'Home')
    await press('D', 'End')
    expect(radio('D')).toHaveFocus()
    expect(onChange.mock.calls).toEqual([['d']])
  })

  it('ignores arrow keys with a modifier', async () => {
    const onChange = vi.fn()
    render(<Controlled initial="a" onChange={onChange} />)
    radio('A').focus()
    await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}')
    await userEvent.keyboard('{Control>}{End}{/Control}')
    expect(onChange).not.toHaveBeenCalled()
    expect(checkedName()).toBe('A')
  })

  it('Tab enters on the checked option and leaves the group', async () => {
    render(
      <>
        <button type="button">Before</button>
        <Controlled initial="c" />
        <button type="button">After</button>
      </>,
    )
    screen.getByRole('button', { name: 'Before' }).focus()
    await userEvent.tab()
    expect(radio('C')).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus()
    await userEvent.tab({ shift: true })
    expect(radio('C')).toHaveFocus()
  })

  it.each([
    ['ArrowLeft', 'C'],
    ['ArrowRight', 'A'],
    ['ArrowDown', 'C'],
    ['ArrowUp', 'A'],
  ])(
    'in RTL, {%s} from B selects %s (Left and Right swap; Up and Down do not)',
    async (key, expected) => {
      render(
        <div dir="rtl">
          <Controlled initial="b" />
        </div>,
      )
      await press('B', key)
      expect(radio(expected)).toHaveFocus()
      expect(checkedName()).toBe(expected)
    },
  )

  it('takes the inherited direction, not a fixed left to right', () => {
    render(
      <div dir="rtl">
        <Controlled />
      </div>,
    )
    act(() => {
      radio('A').focus()
    })
    expect(screen.getByRole('radiogroup')).toHaveAttribute('dir', 'rtl')
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

  it('emits a 0 but ignores an empty or non-numeric value', () => {
    const onValueChange = vi.fn()
    render(<Slider label="Hue" value={55} min={0} max={359} onValueChange={onValueChange} />)
    const range = screen.getByRole('slider', { name: 'Hue' })
    const sendRaw = (raw: string) => {
      Object.defineProperty(range, 'value', { configurable: true, get: () => raw })
      fireEvent.change(range)
    }
    for (const raw of ['', ' ', 'abc', 'NaN', 'Infinity']) sendRaw(raw)
    expect(onValueChange).not.toHaveBeenCalled()
    sendRaw('0')
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(0)
  })

  it('shows its value without a second live region; the range carries the value text', () => {
    render(
      <Slider
        label="Blur"
        value={4}
        min={0}
        max={10}
        onValueChange={vi.fn()}
        formatValue={(n) => `${String(n)} px`}
      />,
    )
    const output = screen.getByText('4 px')
    expect(output).toBeVisible()
    expect(output).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Blur' })).toHaveAttribute('aria-valuetext', '4 px')
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

  it('announces the value with its unit', () => {
    const { unmount } = render(<Harness initial={5} />)
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-valuetext', '5 mm')
    unmount()
    render(<Harness unit="in" initial={25.4} />)
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-valuetext', '1 in')
  })

  it('does not submit an enclosing form on Enter', async () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => {
      e.preventDefault()
    })
    render(
      <form onSubmit={onSubmit}>
        <Harness />
      </form>,
    )
    const field = screen.getByRole('spinbutton')
    await userEvent.clear(field)
    await userEvent.type(field, '7{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('CountField', () => {
  function Harness({
    initial = 4,
    onValueChange,
    disabled,
    describedBy,
  }: {
    initial?: number
    onValueChange?: (v: number) => void
    disabled?: boolean
    describedBy?: string
  }) {
    const [value, setValue] = useState(initial)
    return (
      <>
        <CountField
          label="Columns"
          value={value}
          min={1}
          max={20}
          rangeHint="1 to 20"
          disabled={disabled}
          describedBy={describedBy}
          onValueChange={(v) => {
            onValueChange?.(v)
            setValue(v)
          }}
        />
        <span id="why">Waiting</span>
      </>
    )
  }
  const field = () => screen.getByRole('textbox', { name: 'Columns' })

  it('is a labelled numeric text box, not a spinner, with the range as its description', () => {
    render(<Harness />)
    const input = field()
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveAttribute('inputmode', 'numeric')
    expect(input).toHaveValue('4')
    expect(input).not.toHaveAttribute('aria-valuemin')
    expect(input).not.toHaveAttribute('aria-valuemax')
    expect(input).toHaveAccessibleDescription('1 to 20')
    expect(screen.getByText('Columns').tagName).toBe('LABEL')
  })

  it.each([
    ['0', 1],
    ['25', 20],
    ['3.7', 4],
    ['3,2', 3],
    [' 7 ', 7],
  ])('commits %j on blur as %i', async (typed, committed) => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Harness initial={9} onValueChange={onValueChange} />)
    await user.clear(field())
    await user.type(field(), typed)
    expect(onValueChange).not.toHaveBeenCalled()
    await user.tab()
    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(onValueChange).toHaveBeenCalledWith(committed)
    expect(field()).toHaveValue(String(committed))
  })

  it('commits on Enter and keeps focus', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Harness onValueChange={onValueChange} />)
    await user.clear(field())
    await user.type(field(), '12{Enter}')
    expect(onValueChange).toHaveBeenCalledWith(12)
    expect(field()).toHaveValue('12')
    expect(field()).toHaveFocus()
  })

  it('does not submit an enclosing form on Enter', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => {
      e.preventDefault()
    })
    render(
      <form onSubmit={onSubmit}>
        <Harness />
      </form>,
    )
    await user.clear(field())
    await user.type(field(), '7{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it.each(['', 'abc', '-3', '1e3', '.', 'Infinity'])(
    'keeps the previous value for %j and shows it again',
    async (typed) => {
      const user = userEvent.setup()
      const onValueChange = vi.fn()
      render(<Harness initial={6} onValueChange={onValueChange} />)
      await user.clear(field())
      if (typed) await user.type(field(), typed)
      await user.keyboard('{Enter}')
      expect(onValueChange).not.toHaveBeenCalled()
      expect(field()).toHaveValue('6')
    },
  )

  it('sends nothing when the committed number equals the value', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Harness initial={6} onValueChange={onValueChange} />)
    await user.clear(field())
    await user.type(field(), '6.2{Enter}')
    expect(onValueChange).not.toHaveBeenCalled()
    expect(field()).toHaveValue('6')
  })

  it('steps with the arrow keys, clamps, and commits at once', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Harness initial={19} onValueChange={onValueChange} />)
    field().focus()
    await user.keyboard('{ArrowUp}')
    expect(onValueChange).toHaveBeenLastCalledWith(20)
    expect(field()).toHaveValue('20')
    onValueChange.mockClear()
    await user.keyboard('{ArrowUp}')
    expect(onValueChange).not.toHaveBeenCalled()
    expect(field()).toHaveValue('20')
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(onValueChange).toHaveBeenLastCalledWith(18)
    expect(field()).toHaveValue('18')
  })

  it.each(['ArrowUp', 'ArrowDown'])('keeps the caret where it is on %s', (key) => {
    render(<Harness />)
    expect(fireEvent.keyDown(field(), { key })).toBe(false)
    expect(fireEvent.keyDown(field(), { key: 'ArrowLeft' })).toBe(true)
  })

  it('steps from what was typed, and clamps at the minimum', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Harness initial={9} onValueChange={onValueChange} />)
    await user.clear(field())
    await user.type(field(), '1{ArrowDown}')
    expect(onValueChange).toHaveBeenLastCalledWith(1)
    expect(field()).toHaveValue('1')
    await user.clear(field())
    await user.type(field(), '5{ArrowUp}')
    expect(onValueChange).toHaveBeenLastCalledWith(6)
    expect(field()).toHaveValue('6')
  })

  it('passes disabled and extra descriptions through', () => {
    render(<Harness disabled describedBy="why" />)
    expect(field()).toBeDisabled()
    expect(field()).toHaveAccessibleDescription('1 to 20 Waiting')
  })

  it('shows a new value from outside when not editing', () => {
    const props = { label: 'Rows', min: 1, max: 20, rangeHint: '1 to 20', onValueChange: vi.fn() }
    const { rerender } = render(<CountField {...props} value={3} />)
    rerender(<CountField {...props} value={8} />)
    expect(screen.getByRole('textbox', { name: 'Rows' })).toHaveValue('8')
  })
})

describe('ColourField', () => {
  const HEX_LABEL = 'Colour hex code'
  const HEX_HINT = 'A # and six hex digits'
  function Harness({
    initial = '#e0457b',
    onValueChange,
    disabled,
    describedBy,
  }: {
    initial?: string
    onValueChange?: (hex: string) => void
    disabled?: boolean
    describedBy?: string
  }) {
    const [value, setValue] = useState(initial)
    return (
      <>
        <ColourField
          label="Colour"
          hexLabel={HEX_LABEL}
          hexHint={HEX_HINT}
          value={value}
          disabled={disabled}
          describedBy={describedBy}
          onValueChange={(hex) => {
            onValueChange?.(hex)
            setValue(hex)
          }}
        />
        <span id="why">Waiting</span>
      </>
    )
  }
  const swatch = () => screen.getByLabelText('Colour')
  const hexField = () => screen.getByRole('textbox', { name: HEX_LABEL })

  it('is a labelled native colour input with its hex in its description', () => {
    render(<Harness />)
    const input = swatch()
    expect(input).toHaveAttribute('type', 'color')
    expect(input).toHaveValue('#e0457b')
    expect(input).toHaveAccessibleDescription('#e0457b')
  })

  it('shows the hex in a labelled text box before the swatch, described by how to type it', () => {
    render(<Harness />)
    const field = hexField()
    expect(field).toHaveAttribute('type', 'text')
    expect(field).toHaveValue('#e0457b')
    expect(field).toHaveAccessibleDescription(HEX_HINT)
    expect(field).toHaveAttribute('autocomplete', 'off')
    expect(field).toHaveAttribute('spellcheck', 'false')
    expect(field.compareDocumentPosition(swatch()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('the hex box commits a typed #rrggbb on Enter, lowercased, and the swatch follows', async () => {
    const onValueChange = vi.fn()
    render(<Harness onValueChange={onValueChange} />)
    await userEvent.clear(hexField())
    await userEvent.type(hexField(), '#1F3FBF')
    expect(onValueChange).not.toHaveBeenCalled()
    await userEvent.keyboard('{Enter}')
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('#1f3fbf')
    expect(hexField()).toHaveValue('#1f3fbf')
    expect(swatch()).toHaveValue('#1f3fbf')
    expect(swatch()).toHaveAccessibleDescription('#1f3fbf')
  })

  it('the hex box commits on blur, and takes the digits without the # or with spaces around', async () => {
    const onValueChange = vi.fn()
    render(<Harness onValueChange={onValueChange} />)
    await userEvent.clear(hexField())
    await userEvent.type(hexField(), ' 2A9D3C ')
    await userEvent.tab()
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('#2a9d3c')
    expect(hexField()).toHaveValue('#2a9d3c')
  })

  it('the hex box keeps the previous colour for anything but six hex digits', async () => {
    const onValueChange = vi.fn()
    render(<Harness onValueChange={onValueChange} />)
    for (const bad of ['', 'red', '#fff', '#1f3fbf80', '#1f3fbg', 'rgb(0, 0, 0)', '##1f3fbf']) {
      await userEvent.clear(hexField())
      if (bad !== '') await userEvent.type(hexField(), bad)
      await userEvent.keyboard('{Enter}')
      expect(hexField()).toHaveValue('#e0457b')
    }
    await userEvent.clear(hexField())
    await userEvent.type(hexField(), 'nope')
    await userEvent.tab()
    expect(hexField()).toHaveValue('#e0457b')
    expect(onValueChange).not.toHaveBeenCalled()
    expect(swatch()).toHaveValue('#e0457b')
  })

  it('the hex box sends nothing when the typed colour is the current one, in any case', async () => {
    const onValueChange = vi.fn()
    render(<Harness onValueChange={onValueChange} />)
    await userEvent.clear(hexField())
    await userEvent.type(hexField(), '#E0457B{Enter}')
    expect(onValueChange).not.toHaveBeenCalled()
    expect(hexField()).toHaveValue('#e0457b')
  })

  it('the swatch sends the lowercase #rrggbb on every input event, and the hex box follows', () => {
    const onValueChange = vi.fn()
    render(<Harness onValueChange={onValueChange} />)
    fireEvent.input(swatch(), { target: { value: '#1F3FBF' } })
    expect(onValueChange).toHaveBeenLastCalledWith('#1f3fbf')
    expect(hexField()).toHaveValue('#1f3fbf')
    fireEvent.input(swatch(), { target: { value: '#00ff00' } })
    expect(onValueChange).toHaveBeenLastCalledWith('#00ff00')
    expect(onValueChange).toHaveBeenCalledTimes(2)
    expect(hexField()).toHaveValue('#00ff00')
  })

  it('the swatch sends only a lowercase #rrggbb whatever the engine reports', () => {
    const onValueChange = vi.fn()
    render(<Harness onValueChange={onValueChange} />)
    const input = swatch()
    const report = (raw: string) => {
      Object.defineProperty(input, 'value', { configurable: true, get: () => raw })
      fireEvent.change(input)
    }
    report('#1F3FBF')
    expect(onValueChange).toHaveBeenLastCalledWith('#1f3fbf')
    onValueChange.mockClear()
    for (const bad of ['', 'red', '#fff', '#1f3fbf80', ' #1f3fbf', 'rgb(0, 0, 0)']) report(bad)
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('shows the value it is given, lowercased, in both controls', () => {
    const props = {
      label: 'Colour',
      hexLabel: HEX_LABEL,
      hexHint: HEX_HINT,
      onValueChange: vi.fn(),
    }
    const { rerender } = render(<ColourField {...props} value="#e0457b" />)
    rerender(<ColourField {...props} value="#1F3FBF" />)
    expect(hexField()).toHaveValue('#1f3fbf')
    expect(swatch()).toHaveValue('#1f3fbf')
  })

  it('passes disabled and extra descriptions through to both controls', () => {
    render(<Harness disabled describedBy="why" />)
    expect(swatch()).toBeDisabled()
    expect(swatch()).toHaveAccessibleDescription('#e0457b Waiting')
    expect(hexField()).toBeDisabled()
    expect(hexField()).toHaveAccessibleDescription(`${HEX_HINT} Waiting`)
  })
})
