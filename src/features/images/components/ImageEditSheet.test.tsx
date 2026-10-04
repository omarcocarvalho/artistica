import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ImageId } from '../../../shared/model/image'
import { useSettings } from '../../settings'
import { useImages } from '../store'
import { makeLoadedImage, renderWithProviders } from '../test-utils'
import { ImageEditSheet } from './ImageEditSheet'

const ID = 'img' as ImageId
const edits = () => useImages.getState().images[0]?.edits

function load(over: Parameters<typeof makeLoadedImage>[0] = {}) {
  useImages.setState({
    images: [makeLoadedImage({ id: ID, name: 'old-photo.gif', pxW: 480, pxH: 640, ...over })],
    selectedId: ID,
  })
}

beforeEach(() => {
  useImages.setState(useImages.getInitialState(), true)
  useSettings.getState().reset()
  useSettings.getState().setUnit('mm') // reset() uses the locale default, which is inches under en-US
})

describe('ImageEditSheet', () => {
  it('renders nothing for an unknown or removed image', () => {
    const { container } = renderWithProviders(<ImageEditSheet imageId={'nope' as ImageId} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('has a labelled crop area with a readout and the rotate/flip group', () => {
    load()
    renderWithProviders(<ImageEditSheet imageId={ID} />)
    expect(screen.getByRole('group', { name: 'Crop area' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Rotate and flip' })).toBeInTheDocument()
    expect(screen.getByTestId('crop-readout')).toHaveTextContent('Crop 480 × 640 px at 0, 0')
  })

  it('rotates and flips live', async () => {
    load()
    renderWithProviders(<ImageEditSheet imageId={ID} />)
    await userEvent.click(screen.getByRole('button', { name: 'Rotate right 90°' }))
    expect(edits()?.rotation).toBe(90)
    await userEvent.click(screen.getByRole('button', { name: 'Rotate left 90°' }))
    expect(edits()?.rotation).toBe(0)
    await userEvent.click(screen.getByRole('button', { name: 'Flip horizontal' }))
    await userEvent.click(screen.getByRole('button', { name: 'Flip vertical' }))
    expect([edits()?.flipH, edits()?.flipV]).toEqual([true, true])
  })

  it('picks a crop shape with chips and resets the crop', async () => {
    load({ pxW: 400, pxH: 300 })
    renderWithProviders(<ImageEditSheet imageId={ID} />)
    const chips = screen.getByRole('group', { name: 'Crop shape' })
    expect(chips).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('1:1'))
    expect(edits()?.cropAspect).toBe('1:1')
    expect(edits()?.crop).toEqual({ x: 50, y: 0, w: 300, h: 300 })
    await userEvent.click(screen.getByRole('button', { name: 'Reset crop' }))
    expect(edits()?.crop).toBeNull()
    expect(edits()?.cropAspect).toBe('free')
    expect(screen.getByLabelText('Free')).toBeChecked()
  })

  it('crop chips flip to the portrait form for a portrait picture (owner Q3, default)', async () => {
    load({ pxW: 300, pxH: 400 })
    renderWithProviders(<ImageEditSheet imageId={ID} />)
    const chips = screen.getByRole('group', { name: 'Crop shape' })
    expect(within(chips).getByLabelText('3:4')).toBeInTheDocument()
    expect(within(chips).getByLabelText('2:3')).toBeInTheDocument()
    expect(within(chips).getByLabelText('9:16')).toBeInTheDocument()
    expect(within(chips).queryByLabelText('4:3')).not.toBeInTheDocument()
    expect(within(chips).getByLabelText('1:1')).toBeInTheDocument()
    await userEvent.click(within(chips).getByLabelText('3:4'))
    expect(edits()?.cropAspect).toBe('4:3') // stored value is unchanged
    expect(edits()?.crop).toEqual({ x: 0, y: 0, w: 300, h: 400 }) // a 3:4 crop is the whole 300 x 400 picture
  })

  it('crop chips keep the landscape form for a landscape picture, and follow a quarter turn', async () => {
    load({ pxW: 400, pxH: 300 })
    renderWithProviders(<ImageEditSheet imageId={ID} />)
    const chips = screen.getByRole('group', { name: 'Crop shape' })
    expect(within(chips).getByLabelText('4:3')).toBeInTheDocument()
    expect(within(chips).queryByLabelText('3:4')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Rotate right 90°' }))
    expect(within(chips).getByLabelText('3:4')).toBeInTheDocument() // now displayed as portrait
  })

  it('steps and types copies within 1..50', async () => {
    load()
    renderWithProviders(<ImageEditSheet imageId={ID} />)
    await userEvent.click(screen.getByRole('button', { name: 'More copies' }))
    expect(edits()?.copies).toBe(2)
    expect(screen.getByRole('button', { name: 'Fewer copies' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Fewer copies' }))
    expect(screen.getByRole('button', { name: 'Fewer copies' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Copies'), { target: { value: '99' } })
    expect(edits()?.copies).toBe(50)
    expect(screen.getByRole('button', { name: 'More copies' })).toBeDisabled()
  })

  it('Auto size warns about low resolution using the comfortable minimum size', () => {
    load() // 480 x 640
    renderWithProviders(<ImageEditSheet imageId={ID} />)
    expect(screen.getByRole('meter', { name: 'Print resolution' })).toHaveAttribute(
      'aria-valuetext',
      '203 DPI',
    )
    expect(screen.getByText('Low resolution')).toBeInTheDocument()
    expect(
      screen.getByText(/At its smallest comfortable size \(60 mm\) this prints at 203 DPI/),
    ).toBeInTheDocument()
  })

  it('Auto size of a sharp image says it never exceeds 300 DPI and shows no warning', () => {
    load({ pxW: 4000, pxH: 3000 })
    renderWithProviders(<ImageEditSheet imageId={ID} />)
    expect(screen.getByText('Auto never prints above 300 DPI.')).toBeInTheDocument()
    expect(screen.queryByText('Low resolution')).not.toBeInTheDocument()
  })

  it('Fixed size: choosing it reveals the field; the readout follows the typed size', async () => {
    load() // 480 x 640
    renderWithProviders(<ImageEditSheet imageId={ID} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Fixed' }))
    expect(edits()?.size.kind).toBe('fixed')
    const field = screen.getByRole('spinbutton', { name: /Width/ })
    await userEvent.clear(field)
    await userEvent.type(field, '90')
    await userEvent.tab()
    expect(edits()?.size).toMatchObject({ kind: 'fixed', axis: 'width', mm: 90 })
    expect(screen.getByRole('meter', { name: 'Print resolution' })).toHaveAttribute(
      'aria-valuetext',
      '135 DPI',
    )
    expect(screen.getByText('Height follows: 120 mm (keeps aspect ratio)')).toBeInTheDocument()
    expect(screen.getByText(/Sharp up to 40.6 × 54.2 mm/)).toBeInTheDocument()
  })

  it('shows the follows-value in inches when the unit is inches', () => {
    useSettings.getState().setUnit('in')
    load({ edits: { size: { kind: 'fixed', axis: 'width', mm: 90 } } })
    renderWithProviders(<ImageEditSheet imageId={ID} />)
    expect(screen.getByText(/Height follows: 4\.72 in/)).toBeInTheDocument()
  })

  it('removes the image and then renders nothing', async () => {
    load()
    const { container } = renderWithProviders(<ImageEditSheet imageId={ID} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove image' }))
    expect(useImages.getState().images).toHaveLength(0)
    expect(container).toBeEmptyDOMElement()
  })

  it('keyboard: arrow keys on the crop area write to the store', () => {
    load({ pxW: 400, pxH: 300, edits: { crop: { x: 100, y: 100, w: 100, h: 100 } } })
    renderWithProviders(<ImageEditSheet imageId={ID} />)
    fireEvent.keyDown(screen.getByRole('group', { name: 'Crop area' }), { key: 'ArrowRight' })
    expect(edits()?.crop?.x).toBe(102)
  })
})
