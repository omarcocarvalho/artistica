import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useImages } from '../../images'
import { makeLoadedImage } from '../../images/test-utils'
import { initI18n } from '../../../shared/i18n'
import { PT_BR, switchLanguage } from '../../../test/languages'
import type { ImageId } from '../../../shared/model/image'
import { DEFAULT_STUDY } from '../../../shared/model/study'
import {
  COMPOSITION_LINE_TYPES,
  DEFAULT_LINES,
  type CompositionLineType,
  type LineSettings,
} from '../../../shared/model/lines'
import { LinesPanel } from './LinesPanel'

const A = 'a' as ImageId
const B = 'b' as ImageId
const C = 'c' as ImageId
const APPLY = 'Apply lines to all images'
const WAITING = 'Waiting for photos to finish importing…'
const HEX = 'Colour hex code'
const HEX_HINT = 'Type # and six hex digits, like #1f3fbf.'

const TYPE_NAMES: Record<CompositionLineType, string> = {
  grid: 'Grid',
  thirds: 'Rule of thirds',
  armature: 'Diagonals & armature',
  golden: 'Golden ratio',
  spiral: 'Golden spiral',
  centre: 'Centre lines',
}

function seed(lines: Record<string, LineSettings> = { a: DEFAULT_LINES, b: DEFAULT_LINES }) {
  useImages.setState({
    images: Object.entries(lines).map(([id, l]) =>
      makeLoadedImage({ id: id as ImageId, name: `${id}.jpg`, lines: l }),
    ),
    selectedId: A,
    importing: 0,
  })
}
const lines = (id: ImageId) => useImages.getState().images.find((i) => i.id === id)?.lines
const isOn = (l: LineSettings | undefined, type: CompositionLineType) => {
  if (!l) return undefined
  if (type === 'grid') return l.grid.on
  if (type === 'spiral') return l.spiral.on
  return l[type]
}
const on = (type: CompositionLineType): LineSettings => {
  if (type === 'grid') return { ...DEFAULT_LINES, grid: { ...DEFAULT_LINES.grid, on: true } }
  if (type === 'spiral') return { ...DEFAULT_LINES, spiral: { ...DEFAULT_LINES.spiral, on: true } }
  return { ...DEFAULT_LINES, [type]: true }
}

// user-event does not implement keyboard stepping of native ranges, so fire the change itself.
function slide(slider: HTMLElement, value: number | string) {
  fireEvent.change(slider, { target: { value: String(value) } })
}

// Bypasses the range's own sanitising, so the panel sees exactly this raw value.
function sendRaw(slider: HTMLElement, raw: string) {
  Object.defineProperty(slider, 'value', { configurable: true, get: () => raw })
  fireEvent.change(slider)
}

function liveRegion(): HTMLElement {
  const region = screen.getByRole('status')
  expect(region).toHaveAttribute('aria-live', 'polite')
  return region
}

beforeAll(async () => {
  await initI18n()
})
beforeEach(() => {
  seed()
})

describe('LinesPanel', () => {
  it('names the image it edits and says lines print on every version', () => {
    render(<LinesPanel imageId={B} />)
    const name = screen.getByText('b.jpg')
    expect(name.tagName).toBe('STRONG')
    expect(name.closest('p')).toHaveTextContent('Lines for b.jpg')
    expect(screen.getByText('Drawn on top of every printed version of this image.')).toBeVisible()
  })

  it('shows only a hint without an image, or for an unknown one', () => {
    const { rerender } = render(<LinesPanel imageId={null} />)
    expect(screen.getByText('Add a photo, or select one, to draw lines on it.')).toBeVisible()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    rerender(<LinesPanel imageId={'gone' as ImageId} />)
    expect(screen.getByText('Add a photo, or select one, to draw lines on it.')).toBeVisible()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it.each([
    'x<em>y</em> & z.jpg',
    '<strong>x</strong>.jpg',
    'a<br/>b.jpg',
    '<0>z</0>.jpg',
    'a&amp;b {{name}}.jpg',
  ])('shows the file name %j as plain text', (name) => {
    useImages.setState({ images: [makeLoadedImage({ id: A, name })], selectedId: A })
    render(<LinesPanel imageId={A} />)
    const strong = screen.getByText(name)
    expect(strong.tagName).toBe('STRONG')
    expect(strong.children).toHaveLength(0)
    expect(strong.closest('p')).toHaveTextContent(`Lines for ${name}`, {
      normalizeWhitespace: false,
    })
  })

  it('has a Composition and a Line style section, each headed by an h3', () => {
    render(<LinesPanel imageId={A} />)
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Composition',
      'Line style',
    ])
    expect(screen.getByRole('region', { name: 'Composition' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Line style' })).toBeInTheDocument()
  })

  it('heads its sections with h4 when the shell gives it headingLevel 4', () => {
    render(<LinesPanel imageId={A} headingLevel={4} />)
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
    expect(screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual([
      'Composition',
      'Line style',
    ])
    expect(screen.getByRole('region', { name: 'Composition' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Line style' })).toBeInTheDocument()
  })

  it('lists the six switches in spec order, all off by default', () => {
    render(<LinesPanel imageId={A} />)
    const switches = screen.getAllByRole('switch')
    expect(switches).toEqual(
      COMPOSITION_LINE_TYPES.map((t) => screen.getByRole('switch', { name: TYPE_NAMES[t] })),
    )
    for (const s of switches) expect(s).toHaveAttribute('aria-checked', 'false')
  })

  it.each(COMPOSITION_LINE_TYPES)('the %s switch turns its own type on and off', async (type) => {
    const user = userEvent.setup()
    render(<LinesPanel imageId={A} />)
    const sw = screen.getByRole('switch', { name: TYPE_NAMES[type] })
    await user.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'true')
    for (const other of COMPOSITION_LINE_TYPES)
      expect([other, isOn(lines(A), other)]).toEqual([other, other === type])
    await user.click(sw)
    expect(lines(A)).toEqual(DEFAULT_LINES)
  })

  it.each(COMPOSITION_LINE_TYPES)('the %s switch reads its own type', (type) => {
    seed({ a: on(type), b: DEFAULT_LINES })
    render(<LinesPanel imageId={A} />)
    for (const other of COMPOSITION_LINE_TYPES)
      expect(screen.getByRole('switch', { name: TYPE_NAMES[other] })).toHaveAttribute(
        'aria-checked',
        String(other === type),
      )
  })

  it('reveals Columns × Rows only while Grid is on, and they patch the grid', async () => {
    const user = userEvent.setup()
    render(<LinesPanel imageId={A} />)
    expect(screen.queryByRole('textbox', { name: 'Columns' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: 'Grid' }))
    const cols = screen.getByRole('textbox', { name: 'Columns' })
    const rows = screen.getByRole('textbox', { name: 'Rows' })
    expect(cols).toHaveValue('4')
    expect(rows).toHaveValue('5')
    expect(cols).toHaveAccessibleDescription('1 to 20')
    await user.clear(cols)
    await user.type(cols, '25{Enter}')
    expect(lines(A)?.grid).toEqual({ on: true, cols: 20, rows: 5 })
    await user.clear(rows)
    await user.type(rows, '3.7')
    await user.tab()
    expect(lines(A)?.grid).toEqual({ on: true, cols: 20, rows: 4 })
    rows.focus()
    await user.keyboard('{ArrowDown}')
    expect(lines(A)?.grid.rows).toBe(3)
    await user.click(screen.getByRole('switch', { name: 'Grid' }))
    expect(screen.queryByRole('textbox', { name: 'Columns' })).not.toBeInTheDocument()
    expect(lines(A)?.grid).toEqual({ on: false, cols: 20, rows: 3 })
  })

  it('reveals the spiral corner picker only while Golden spiral is on', async () => {
    const user = userEvent.setup()
    render(<LinesPanel imageId={A} />)
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: 'Golden spiral' }))
    const group = screen.getByRole('radiogroup', { name: 'Spiral starts at' })
    const radios = within(group).getAllByRole('radio')
    expect(radios.map((r) => r.textContent)).toEqual([
      '↖Top left',
      '↗Top right',
      '↙Bottom left',
      '↘Bottom right',
    ])
    expect(radios.map((r) => r.getAttribute('aria-label') ?? '')).toEqual(['', '', '', ''])
    for (const [i, name] of ['Top left', 'Top right', 'Bottom left', 'Bottom right'].entries())
      expect(screen.getByRole('radio', { name })).toBe(radios[i])
    for (const radio of radios)
      expect(within(radio).getByText(/[↖↗↙↘]/)).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('radio', { name: 'Top left' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'Bottom left' }))
    expect(lines(A)?.spiral).toEqual({ on: true, corner: 'bottomLeft' })
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Bottom right' })).toHaveFocus()
    expect(lines(A)?.spiral.corner).toBe('bottomRight')
    expect(screen.getByRole('radio', { name: 'Bottom right' })).toBeChecked()
    await user.click(screen.getByRole('switch', { name: 'Golden spiral' }))
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
  })

  it('the spiral corner picker selects with every arrow key, Home and End', async () => {
    const user = userEvent.setup()
    render(<LinesPanel imageId={A} />)
    await user.click(screen.getByRole('switch', { name: 'Golden spiral' }))
    screen.getByRole('radio', { name: 'Top left' }).focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(lines(A)?.spiral.corner).toBe('topRight')
    await userEvent.keyboard('{End}')
    expect(lines(A)?.spiral.corner).toBe('bottomRight')
    await userEvent.keyboard('{ArrowDown}')
    expect(lines(A)?.spiral.corner).toBe('topLeft')
    await userEvent.keyboard('{ArrowUp}')
    expect(lines(A)?.spiral.corner).toBe('bottomRight')
    await userEvent.keyboard('{Home}')
    expect(lines(A)?.spiral.corner).toBe('topLeft')
    expect(screen.getByRole('radio', { name: 'Top left' })).toHaveFocus()
  })

  it('colour: a labelled colour input with the hex shown, patching the style', () => {
    render(<LinesPanel imageId={A} />)
    const colour = screen.getByLabelText('Colour')
    expect(colour).toHaveAttribute('type', 'color')
    expect(colour).toHaveAccessibleDescription('#e0457b')
    fireEvent.input(colour, { target: { value: '#1F3FBF' } })
    expect(lines(A)?.style.colour).toBe('#1f3fbf')
    expect(screen.getByRole('textbox', { name: HEX })).toHaveValue('#1f3fbf')
  })

  it('colour: the hex is a text box that takes a typed colour, for keyboards that skip the swatch', async () => {
    const user = userEvent.setup()
    render(<LinesPanel imageId={A} />)
    const hex = screen.getByRole('textbox', { name: HEX })
    expect(hex).toHaveValue('#e0457b')
    expect(hex).toHaveAccessibleDescription(HEX_HINT)
    await user.clear(hex)
    await user.type(hex, '#2A9D3C{Enter}')
    expect(lines(A)?.style.colour).toBe('#2a9d3c')
    expect(screen.getByLabelText('Colour')).toHaveValue('#2a9d3c')
    await user.clear(hex)
    await user.type(hex, '#abc{Enter}')
    expect(lines(A)?.style.colour).toBe('#2a9d3c')
    expect(hex).toHaveValue('#2a9d3c')
  })

  describe('a typed value not yet committed stays with its image', () => {
    const grid = (cols: number, rows: number): LineSettings => ({
      ...DEFAULT_LINES,
      grid: { on: true, cols, rows },
    })

    it.each([
      ['Columns', '9'],
      ['Rows', '9'],
      [HEX, '#123456'],
    ])('%s: the next image shows its own value and never gets the draft', async (name, typed) => {
      const user = userEvent.setup()
      seed({ a: grid(3, 4), b: grid(6, 7) })
      const { rerender } = render(<LinesPanel imageId={A} />)
      const field = screen.getByRole('textbox', { name })
      await user.clear(field)
      await user.type(field, typed)
      rerender(<LinesPanel imageId={B} />)
      const next = screen.getByRole('textbox', { name })
      expect(next).toHaveValue(
        name === 'Columns' ? '6' : name === 'Rows' ? '7' : DEFAULT_LINES.style.colour,
      )
      next.focus()
      await user.tab()
      expect(lines(B)).toEqual(grid(6, 7))
      expect(lines(A)).toEqual(grid(3, 4))
    })
  })

  it('thickness: 0.1–2 mm in 0.05 steps, announced in mm', () => {
    render(<LinesPanel imageId={A} />)
    const thickness = screen.getByRole('slider', { name: 'Thickness' })
    expect(thickness).toHaveAttribute('min', '0.1')
    expect(thickness).toHaveAttribute('max', '2')
    expect(thickness).toHaveAttribute('step', '0.05')
    expect(thickness).toHaveAttribute('aria-valuetext', '0.35 mm')
    slide(thickness, 0.4)
    expect(lines(A)?.style.widthMm).toBe(0.4)
    expect(thickness).toHaveAttribute('aria-valuetext', '0.4 mm')
    slide(thickness, 2)
    expect(thickness).toHaveAttribute('aria-valuetext', '2 mm')
    expect(screen.getByText('0.1 mm')).toBeInTheDocument()
    expect(screen.getByText('2 mm', { selector: 'span' })).toBeInTheDocument()
  })

  it('thickness: sends only whole 0.05 mm steps, and nothing out of range or not a number', () => {
    seed({
      a: { ...DEFAULT_LINES, style: { ...DEFAULT_LINES.style, widthMm: 1 } },
      b: DEFAULT_LINES,
    })
    render(<LinesPanel imageId={A} />)
    const thickness = screen.getByRole('slider', { name: 'Thickness' })
    sendRaw(thickness, '0.35000000000000003')
    expect(lines(A)?.style.widthMm).toBe(0.35)
    expect(screen.getByRole('slider', { name: 'Thickness' })).toHaveAttribute(
      'aria-valuetext',
      '0.35 mm',
    )
    sendRaw(thickness, '0.42')
    expect(lines(A)?.style.widthMm).toBe(0.4)
    const before = useImages.getState().images
    for (const bad of ['', 'abc', 'NaN', '5', '-1', '0.05', '2.01']) {
      sendRaw(thickness, bad)
      expect([bad, useImages.getState().images]).toEqual([bad, before])
    }
  })

  it('opacity: 10–100 %, announced as a percentage', () => {
    render(<LinesPanel imageId={A} />)
    const opacity = screen.getByRole('slider', { name: 'Opacity' })
    expect(opacity).toHaveAttribute('min', '10')
    expect(opacity).toHaveAttribute('max', '100')
    expect(opacity).toHaveAttribute('aria-valuetext', '90%')
    slide(opacity, 45)
    expect(lines(A)?.style.opacityPct).toBe(45)
    expect(opacity).toHaveAttribute('aria-valuetext', '45%')
    sendRaw(opacity, '45.6')
    expect(lines(A)?.style.opacityPct).toBe(46)
    const before = useImages.getState().images
    for (const bad of ['', 'abc', '9', '101']) {
      sendRaw(opacity, bad)
      expect([bad, useImages.getState().images]).toEqual([bad, before])
    }
  })

  it('edits only the given image, leaving the others alone', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<LinesPanel imageId={A} />)
    rerender(<LinesPanel imageId={B} />)
    await user.click(screen.getByRole('switch', { name: 'Rule of thirds' }))
    slide(screen.getByRole('slider', { name: 'Opacity' }), 50)
    expect(lines(B)).toEqual({
      ...DEFAULT_LINES,
      thirds: true,
      style: { ...DEFAULT_LINES.style, opacityPct: 50 },
    })
    expect(lines(A)).toEqual(DEFAULT_LINES)
  })

  it('never touches studies', async () => {
    const user = userEvent.setup()
    render(<LinesPanel imageId={A} />)
    await user.click(screen.getByRole('switch', { name: 'Centre lines' }))
    await user.click(screen.getByRole('button', { name: APPLY }))
    for (const img of useImages.getState().images) expect(img.study).toBe(DEFAULT_STUDY)
  })

  describe('Apply lines to all images', () => {
    it('copies everything and announces how many images changed', async () => {
      const user = userEvent.setup()
      const mine: LineSettings = {
        ...DEFAULT_LINES,
        grid: { on: true, cols: 3, rows: 3 },
        thirds: true,
        armature: false,
        golden: true,
        spiral: { on: true, corner: 'bottomRight' },
        centre: true,
        style: { colour: '#1f3fbf', widthMm: 1.5, opacityPct: 60 },
      }
      seed({ a: mine, b: DEFAULT_LINES, c: DEFAULT_LINES })
      render(<LinesPanel imageId={A} />)
      const status = liveRegion()
      expect(status).toBeEmptyDOMElement()
      await user.click(screen.getByRole('button', { name: APPLY }))
      expect(lines(B)).toEqual(mine)
      expect(lines(C)).toEqual(mine)
      expect(status).toHaveTextContent('Line settings copied to 2 images.')
      await user.click(screen.getByRole('button', { name: APPLY }))
      expect(status).toHaveTextContent('All images already use these line settings.')
    })

    it('announces a repeated result again, as new content in the region', async () => {
      const user = userEvent.setup()
      seed({ a: on('thirds'), b: DEFAULT_LINES, c: DEFAULT_LINES })
      render(<LinesPanel imageId={A} />)
      const status = liveRegion()
      await user.click(screen.getByRole('button', { name: APPLY }))
      const first = status.firstChild
      expect(status).toHaveTextContent('Line settings copied to 2 images.')
      slide(screen.getByRole('slider', { name: 'Opacity' }), 30)
      await user.click(screen.getByRole('button', { name: APPLY }))
      expect(lines(C)?.style.opacityPct).toBe(30)
      expect(status).toHaveTextContent('Line settings copied to 2 images.')
      expect(status.firstChild).not.toBe(first)
    })

    it('keeps the status region mounted, clears it on another image, and does not re-announce on return', async () => {
      const user = userEvent.setup()
      seed({ a: on('centre'), b: DEFAULT_LINES })
      const { rerender } = render(<LinesPanel imageId={A} />)
      const status = liveRegion()
      await user.click(screen.getByRole('button', { name: APPLY }))
      expect(status).toHaveTextContent('Line settings copied to 1 image.')
      rerender(<LinesPanel imageId={B} />)
      expect(liveRegion()).toBe(status)
      expect(status).toBeEmptyDOMElement()
      rerender(<LinesPanel imageId={A} />)
      expect(status).toBeEmptyDOMElement()
      rerender(<LinesPanel imageId={null} />)
      expect(liveRegion()).toBe(status)
    })

    it('is disabled with a single image, with a hint saying why', () => {
      seed({ a: DEFAULT_LINES })
      render(<LinesPanel imageId={A} />)
      expect(screen.getByRole('button', { name: APPLY })).toBeDisabled()
      expect(screen.getByText('Add another photo to copy these settings to it.')).toBeVisible()
      expect(screen.queryByText(/to all 1 image/)).not.toBeInTheDocument()
    })

    it('the hint names the image count', () => {
      seed({ a: DEFAULT_LINES, b: DEFAULT_LINES, c: DEFAULT_LINES })
      render(<LinesPanel imageId={A} />)
      expect(screen.getByText('Copies these line settings to all 3 images.')).toBeVisible()
    })

    it('has a name distinct from the studies button', () => {
      render(<LinesPanel imageId={A} />)
      expect(screen.queryByRole('button', { name: 'Apply to all images' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: APPLY })).toBeInTheDocument()
    })
  })

  describe('while photos are importing (owner Q9)', () => {
    const everyType: LineSettings = {
      ...DEFAULT_LINES,
      grid: { ...DEFAULT_LINES.grid, on: true },
      spiral: { ...DEFAULT_LINES.spiral, on: true },
    }
    const controls = () => [
      ...screen.getAllByRole('switch'),
      ...screen.getAllByRole('textbox'),
      ...screen.getAllByRole('radio'),
      screen.getByLabelText('Colour'),
      ...screen.getAllByRole('slider'),
      screen.getByRole('button', { name: APPLY }),
    ]
    const setImporting = (importing: number) => {
      act(() => {
        useImages.setState({ importing })
      })
    }

    it('disables every control and says why', () => {
      seed({ a: everyType, b: DEFAULT_LINES })
      useImages.setState({ importing: 2 })
      render(<LinesPanel imageId={A} />)
      const hint = screen.getByText(WAITING)
      expect(hint).toBeVisible()
      expect(hint).toHaveAttribute('aria-live', 'polite')
      expect(hint).toHaveAttribute('tabindex', '-1')
      expect(controls()).toHaveLength(6 + 3 + 4 + 1 + 2 + 1)
      for (const control of controls()) {
        expect(control).toBeDisabled()
        expect(control).toHaveAccessibleDescription(expect.stringContaining(WAITING))
      }
    })

    it('a disabled control changes nothing', async () => {
      const user = userEvent.setup()
      seed({ a: everyType, b: DEFAULT_LINES })
      useImages.setState({ importing: 1 })
      render(<LinesPanel imageId={A} />)
      await user.click(screen.getByRole('switch', { name: 'Rule of thirds' }))
      await user.click(screen.getByRole('radio', { name: 'Bottom right' }))
      await user.click(screen.getByRole('button', { name: APPLY }))
      expect(lines(A)).toEqual(everyType)
      expect(lines(B)).toEqual(DEFAULT_LINES)
    })

    it('enables them again once the last import ends', () => {
      seed({ a: everyType, b: DEFAULT_LINES })
      render(<LinesPanel imageId={A} />)
      expect(screen.queryByText(WAITING)).not.toBeInTheDocument()
      setImporting(1)
      const region = screen.getByText(WAITING)
      for (const control of controls()) expect(control).toBeDisabled()
      setImporting(0)
      expect(region).toBeEmptyDOMElement()
      for (const control of controls()) {
        expect(control).toBeEnabled()
        expect(control).not.toHaveAccessibleDescription(expect.stringContaining(WAITING))
      }
    })

    it('moves focus from a switch that becomes disabled to the hint, and back after', () => {
      render(<LinesPanel imageId={A} />)
      const sw = screen.getByRole('switch', { name: 'Golden ratio' })
      sw.focus()
      setImporting(1)
      expect(document.activeElement).toBe(screen.getByText(WAITING))
      setImporting(0)
      expect(document.activeElement).toBe(sw)
    })

    it('leaves focus outside the panel alone', () => {
      const outside = document.createElement('button')
      document.body.append(outside)
      render(<LinesPanel imageId={A} />)
      outside.focus()
      setImporting(1)
      expect(document.activeElement).toBe(outside)
      outside.remove()
    })

    it('with announceWait off, the hint still shows and describes every control but is not live', () => {
      seed({ a: everyType, b: DEFAULT_LINES })
      render(<LinesPanel imageId={A} announceWait={false} />)
      const sw = screen.getByRole('switch', { name: 'Golden ratio' })
      sw.focus()
      setImporting(1)
      const hint = screen.getByText(WAITING)
      expect(hint).toBeVisible()
      expect(hint).not.toHaveAttribute('aria-live')
      expect(document.activeElement).toBe(hint)
      for (const control of controls()) {
        expect(control).toBeDisabled()
        expect(control).toHaveAccessibleDescription(expect.stringContaining(WAITING))
      }
      setImporting(0)
      expect(document.activeElement).toBe(sw)
    })
  })
})

describe('LinesPanel in other languages', () => {
  afterAll(async () => {
    await switchLanguage('en')
  })

  it('formats the thickness with a decimal comma', async () => {
    await switchLanguage('pt-BR', PT_BR)
    render(<LinesPanel imageId={A} />)
    expect(screen.getByRole('slider', { name: 'Thickness' })).toHaveAttribute(
      'aria-valuetext',
      '0,35 mm',
    )
    expect(screen.getByText('0,1 mm')).toBeInTheDocument()
  })

  it('formats the opacity the Spanish way and names millimetres in Chinese', async () => {
    await switchLanguage('es')
    const { unmount } = render(<LinesPanel imageId={A} />)
    expect(screen.getByText('100 %', { selector: 'span' })).toBeInTheDocument()
    unmount()
    await switchLanguage('zh-CN')
    render(<LinesPanel imageId={A} />)
    expect(screen.getByRole('slider', { name: 'Thickness' })).toHaveAttribute(
      'aria-valuetext',
      '0.35 毫米',
    )
  })
})
