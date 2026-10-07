import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useImages } from '../../images'
import { makeLoadedImage } from '../../images/test-utils'
import { initI18n } from '../../../shared/i18n'
import { DEFAULT_STUDY, type StudySettings } from '../../../shared/model/study'
import type { ImageId } from '../../../shared/model/image'
import { valueRamp } from '../ramp'
import { StudiesPanel } from './StudiesPanel'

const A = 'a' as ImageId
const B = 'b' as ImageId

function seed(studies: Record<string, StudySettings> = { a: DEFAULT_STUDY, b: DEFAULT_STUDY }) {
  useImages.setState({
    images: Object.entries(studies).map(([id, study]) =>
      makeLoadedImage({ id: id as ImageId, name: `${id}.jpg`, study }),
    ),
    selectedId: A,
  })
}
const study = (id: ImageId) => useImages.getState().images.find((i) => i.id === id)?.study

// user-event does not implement keyboard stepping of native ranges, so fire the change itself.
function slide(slider: HTMLElement, value: number) {
  fireEvent.change(slider, { target: { value: String(value) } })
}

// Each Slider's <output> also has the implicit role "status"; the announcement region is the polite one.
function liveRegion(): HTMLElement {
  const regions = screen
    .getAllByRole('status')
    .filter((el) => el.getAttribute('aria-live') === 'polite')
  expect(regions).toHaveLength(1)
  const region = regions[0]
  if (region === undefined) throw new Error('no polite live region')
  return region
}

beforeAll(async () => {
  await initI18n()
})
beforeEach(() => {
  seed()
})

describe('StudiesPanel', () => {
  it('P1 names the image it edits, and shows only a hint without one', () => {
    const { rerender } = render(<StudiesPanel imageId={A} />)
    expect(screen.getByText('a.jpg').tagName).toBe('STRONG')
    rerender(<StudiesPanel imageId={null} />)
    expect(screen.getByText('Add a photo, or select one, to set up its studies.')).toBeVisible()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('P1 an unknown image id shows the hint, not controls', () => {
    render(<StudiesPanel imageId={'gone' as ImageId} />)
    expect(screen.getByText('Add a photo, or select one, to set up its studies.')).toBeVisible()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })

  it.each([
    'x<em>y</em> & z.jpg',
    'a<i>b</i>.jpg',
    '<strong>x</strong>.jpg',
    'a<br/>b.jpg',
    '<p>q</p>.jpg',
    '<0>z</0>.jpg',
    '<1>w</1>.jpg',
    'a&amp;b {{name}}.jpg',
  ])('P1 shows the file name %j as plain text', (name) => {
    useImages.setState({
      images: [makeLoadedImage({ id: A, name, study: DEFAULT_STUDY })],
      selectedId: A,
    })
    render(<StudiesPanel imageId={A} />)
    const strong = screen.getByText(name)
    expect(strong.tagName).toBe('STRONG')
    expect(strong.children).toHaveLength(0)
    expect(strong.closest('p')).toHaveTextContent(`Studies for ${name}`, {
      normalizeWhitespace: false,
    })
  })

  it('P2 lists the four versions in canonical order and toggles one', async () => {
    const user = userEvent.setup()
    render(<StudiesPanel imageId={A} />)
    const group = screen.getByRole('group', { name: 'Print these versions' })
    const chips = within(group).getAllByRole('button')
    expect(chips.map((c) => c.textContent)).toEqual([
      'Original',
      'Blurred',
      'Values',
      'Blur + Values',
    ])
    await user.click(within(group).getByRole('button', { name: 'Values' }))
    expect(study(A)?.versions).toEqual(['original', 'values'])
    expect(within(group).getByRole('button', { name: 'Values' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(within(group).getByRole('button', { name: 'Values' }))
    expect(study(A)?.versions).toEqual(['original'])
  })

  it('P2 chips toggle from the keyboard with Space and Enter', async () => {
    const user = userEvent.setup()
    render(<StudiesPanel imageId={A} />)
    screen.getByRole('button', { name: 'Blurred' }).focus()
    await user.keyboard(' ')
    expect(study(A)?.versions).toEqual(['original', 'blurred'])
    screen.getByRole('button', { name: 'Blur + Values' }).focus()
    await user.keyboard('{Enter}')
    expect(study(A)?.versions).toEqual(['original', 'blurred', 'blurValues'])
  })

  it('P3 keeps the last selected version and explains why', async () => {
    const user = userEvent.setup()
    seed({ a: { ...DEFAULT_STUDY, versions: ['values'] }, b: DEFAULT_STUDY })
    render(<StudiesPanel imageId={A} />)
    const values = screen.getByRole('button', { name: 'Values' })
    expect(values).toHaveAttribute('aria-disabled', 'true')
    expect(values).toHaveAttribute('aria-pressed', 'true')
    expect(values).toHaveAccessibleDescription('At least one version prints.')
    expect(screen.getByText('At least one version prints.')).toBeVisible()
    await user.click(values)
    values.focus()
    await user.keyboard('{Enter} ')
    expect(study(A)?.versions).toEqual(['values'])
    expect(screen.getByRole('button', { name: 'Original' })).not.toHaveAttribute('aria-disabled')
    await user.click(screen.getByRole('button', { name: 'Blurred' }))
    expect(screen.getByRole('button', { name: 'Values' })).not.toHaveAttribute('aria-disabled')
    expect(screen.getByRole('button', { name: 'Values' })).not.toHaveAccessibleDescription()
    expect(screen.queryByText('At least one version prints.')).not.toBeInTheDocument()
  })

  it('P4 blur: labelled, announced as a percentage, always enabled', () => {
    render(<StudiesPanel imageId={A} />)
    const blur = screen.getByRole('slider', { name: 'Amount' })
    expect(blur).toBeEnabled()
    expect(blur).toHaveAttribute('aria-valuetext', '40%')
    expect(blur).toHaveAttribute('min', '1')
    expect(blur).toHaveAttribute('max', '100')
    expect(screen.getByText('Used by Blurred and Blur + Values.')).toBeVisible()
    slide(blur, 42)
    expect(study(A)?.blurPct).toBe(42)
    expect(blur).toHaveAttribute('aria-valuetext', '42%')
    expect(
      screen.getByText('Scales with image size, so 42% looks alike on every photo.'),
    ).toBeVisible()
  })

  it('P4/P5/P7 never send a non-number from a slider (the store would reset it to the default)', () => {
    seed({
      a: { versions: ['original'], blurPct: 70, values: { count: 9, hue: 200, neutral: false } },
      b: DEFAULT_STUDY,
    })
    render(<StudiesPanel imageId={A} />)
    const sendRaw = (name: string, raw: string) => {
      const slider = screen.getByRole('slider', { name })
      Object.defineProperty(slider, 'value', { configurable: true, get: () => raw })
      fireEvent.change(slider)
    }
    for (const name of ['Amount', 'Number of values', 'Custom hue']) sendRaw(name, 'abc')
    sendRaw('Amount', '')
    sendRaw('Amount', '101')
    sendRaw('Number of values', '')
    sendRaw('Number of values', '21')
    sendRaw('Custom hue', '360')
    expect(study(A)).toEqual({
      versions: ['original'],
      blurPct: 70,
      values: { count: 9, hue: 200, neutral: false },
    })
  })

  it('P5 values count: 2–20 with notan end label', () => {
    render(<StudiesPanel imageId={A} />)
    const count = screen.getByRole('slider', { name: 'Number of values' })
    expect(count).toHaveAttribute('aria-valuetext', '5 values')
    expect(count).toHaveAttribute('min', '2')
    expect(count).toHaveAttribute('max', '20')
    expect(screen.getByText('2 · notan')).toBeInTheDocument()
    expect(screen.getByText('Used by Values and Blur + Values.')).toBeVisible()
    slide(count, 2)
    expect(study(A)?.values.count).toBe(2)
    expect(count).toHaveAttribute('aria-valuetext', '2 values')
    slide(count, 20)
    expect(study(A)?.values.count).toBe(20)
  })

  it('P6 swatches: pressed state follows hue/neutral; neutral keeps the hue', async () => {
    const user = userEvent.setup()
    render(<StudiesPanel imageId={A} />)
    const hue = screen.getByRole('group', { name: 'Hue' })
    expect(
      within(hue)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual([
      'Sepia',
      'Terracotta',
      'Ochre',
      'Sap green',
      'Teal',
      'Ultramarine',
      'Violet',
      'Neutral grey',
    ])
    expect(within(hue).getByRole('button', { name: 'Sepia' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(hue).getAllByRole('button', { pressed: true })).toHaveLength(1)
    await user.click(within(hue).getByRole('button', { name: 'Teal' }))
    expect(study(A)?.values).toMatchObject({ hue: 195, neutral: false })
    await user.click(within(hue).getByRole('button', { name: 'Neutral grey' }))
    expect(study(A)?.values).toMatchObject({ hue: 195, neutral: true })
    expect(within(hue).getByRole('button', { name: 'Teal' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(within(hue).getByRole('button', { name: 'Neutral grey' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    within(hue).getByRole('button', { name: 'Violet' }).focus()
    await user.keyboard('{Enter}')
    expect(study(A)?.values).toMatchObject({ hue: 305, neutral: false })
  })

  it('P6 no preset is pressed for a custom hue', () => {
    seed({ a: { ...DEFAULT_STUDY, values: { count: 5, hue: 56, neutral: false } } })
    render(<StudiesPanel imageId={A} />)
    const hue = screen.getByRole('group', { name: 'Hue' })
    expect(within(hue).queryAllByRole('button', { pressed: true })).toHaveLength(0)
  })

  it('P7 custom hue turns neutral off and is announced in degrees', () => {
    seed({ a: { ...DEFAULT_STUDY, values: { count: 5, hue: 55, neutral: true } } })
    render(<StudiesPanel imageId={A} />)
    const custom = screen.getByRole('slider', { name: 'Custom hue' })
    expect(custom).toHaveAttribute('aria-valuetext', '55°')
    expect(custom).toHaveAttribute('min', '0')
    expect(custom).toHaveAttribute('max', '359')
    slide(custom, 56)
    expect(study(A)?.values).toMatchObject({ hue: 56, neutral: false })
    expect(custom).toHaveAttribute('aria-valuetext', '56°')
    expect(screen.getByRole('button', { name: 'Sepia' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('P8 the ramp strip has exactly N swatches in valueRamp colours', () => {
    seed({ a: { ...DEFAULT_STUDY, values: { count: 7, hue: 265, neutral: false } } })
    render(<StudiesPanel imageId={A} />)
    const ramp = screen.getByRole('img', { name: '7 values, from darkest to lightest tint' })
    const swatches = ramp.querySelectorAll('span')
    const want = valueRamp({ count: 7, hue: 265, neutral: false })
    expect(swatches).toHaveLength(7)
    swatches.forEach((s, i) => {
      const c = want[i]
      expect(s.style.backgroundColor).toBe(`rgb(${String(c?.r)}, ${String(c?.g)}, ${String(c?.b)})`)
    })
    expect(screen.getByText('Darkest')).toBeInTheDocument()
    expect(screen.getByText('Lightest tint')).toBeInTheDocument()
  })

  it('P8 the ramp follows a count change', () => {
    render(<StudiesPanel imageId={A} />)
    slide(screen.getByRole('slider', { name: 'Number of values' }), 2)
    const ramp = screen.getByRole('img', { name: '2 values, from darkest to lightest tint' })
    expect(ramp.querySelectorAll('span')).toHaveLength(2)
  })

  it('P9 announces how many images changed after Apply to all', async () => {
    const user = userEvent.setup()
    seed({
      a: { ...DEFAULT_STUDY, versions: ['original', 'blurred'], blurPct: 70 },
      b: DEFAULT_STUDY,
      c: DEFAULT_STUDY,
    })
    render(<StudiesPanel imageId={A} />)
    const status = liveRegion()
    expect(status).toBeEmptyDOMElement()
    await user.click(screen.getByRole('button', { name: 'Apply to all images' }))
    expect(study(B)).toEqual(study(A))
    expect(study('c' as ImageId)).toEqual(study(A))
    expect(status).toHaveTextContent('Study settings copied to 2 images.')
    await user.click(screen.getByRole('button', { name: 'Apply to all images' }))
    expect(status).toHaveTextContent('All images already use these study settings.')
  })

  it('P9 keeps the status region mounted and clears it when the image changes', async () => {
    const user = userEvent.setup()
    seed({ a: { ...DEFAULT_STUDY, blurPct: 70 }, b: DEFAULT_STUDY })
    const { rerender } = render(<StudiesPanel imageId={A} />)
    const status = liveRegion()
    await user.click(screen.getByRole('button', { name: 'Apply to all images' }))
    expect(status).toHaveTextContent('Study settings copied to 1 image.')
    rerender(<StudiesPanel imageId={B} />)
    expect(liveRegion()).toBe(status)
    expect(status).toBeEmptyDOMElement()
    rerender(<StudiesPanel imageId={null} />)
    expect(liveRegion()).toBe(status)
  })

  it('P9 Apply to all is disabled with a single image', () => {
    seed({ a: DEFAULT_STUDY })
    render(<StudiesPanel imageId={A} />)
    expect(screen.getByRole('button', { name: 'Apply to all images' })).toBeDisabled()
    expect(screen.getByText('Copies these study settings to all 1 image.')).toBeVisible()
  })

  it('P10 the hint names the image count', () => {
    render(<StudiesPanel imageId={A} />)
    expect(screen.getByText('Copies these study settings to all 2 images.')).toBeVisible()
  })

  it('edits the image it is given, not the previously shown one', async () => {
    const user = userEvent.setup()
    seed({ a: DEFAULT_STUDY, b: { ...DEFAULT_STUDY, blurPct: 10 } })
    const { rerender } = render(<StudiesPanel imageId={A} />)
    rerender(<StudiesPanel imageId={B} />)
    expect(screen.getByText('b.jpg').tagName).toBe('STRONG')
    expect(screen.getByRole('slider', { name: 'Amount' })).toHaveAttribute('aria-valuetext', '10%')
    await user.click(screen.getByRole('button', { name: 'Blurred' }))
    slide(screen.getByRole('slider', { name: 'Amount' }), 11)
    await user.click(screen.getByRole('button', { name: 'Teal' }))
    await user.click(screen.getByRole('button', { name: 'Apply to all images' }))
    expect(study(B)).toEqual({
      versions: ['original', 'blurred'],
      blurPct: 11,
      values: { count: 5, hue: 195, neutral: false },
    })
    expect(study(A)).toEqual(study(B))
  })

  it('edits only the given image, leaving the others alone', async () => {
    const user = userEvent.setup()
    seed({ a: DEFAULT_STUDY, b: DEFAULT_STUDY })
    const { rerender } = render(<StudiesPanel imageId={A} />)
    rerender(<StudiesPanel imageId={B} />)
    await user.click(screen.getByRole('button', { name: 'Blurred' }))
    expect(study(B)?.versions).toEqual(['original', 'blurred'])
    expect(study(A)).toEqual(DEFAULT_STUDY)
  })
})
