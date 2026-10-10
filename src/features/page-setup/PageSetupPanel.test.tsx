import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { initI18n } from '../../shared/i18n'
import { DEFAULT_PAGE_SETUP } from '../../shared/model/page-setup'
import { useSettings } from '../settings'
import { PageSetupPanel } from './PageSetupPanel'

beforeAll(async () => {
  await initI18n()
})
beforeEach(() => {
  localStorage.clear()
  useSettings.getState().reset()
  useSettings.getState().setUnit('mm') // reset() follows the locale; these tests assume mm
})

async function setField(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  const input = screen.getByLabelText(label)
  await user.clear(input)
  if (value !== '') await user.type(input, value)
  await user.tab()
}

describe('PageSetupPanel', () => {
  it('shows the defaults: A4, mm, auto, gutter on, marks on, bleed off', () => {
    render(<PageSetupPanel />)
    expect(screen.getByLabelText('Paper size')).toHaveValue('A4')
    expect(screen.getByRole('radio', { name: 'mm' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Auto' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Gutter between images' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Crop marks' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Bleed' })).not.toBeChecked()
    expect(screen.queryByLabelText('Bleed amount')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Width')).not.toBeInTheDocument()
    expect(screen.getByText('210 × 297 mm')).toBeInTheDocument()
  })

  it('changes paper and shows its dimensions', async () => {
    const user = userEvent.setup()
    render(<PageSetupPanel />)
    await user.selectOptions(screen.getByLabelText('Paper size'), 'Letter')
    expect(useSettings.getState().pageSetup.paper).toBe('Letter')
    expect(screen.getByText('215.9 × 279.4 mm')).toBeInTheDocument()
  })

  it('stores custom size portrait-normalised (width <= height)', async () => {
    const user = userEvent.setup()
    render(<PageSetupPanel />)
    await user.selectOptions(screen.getByLabelText('Paper size'), 'Custom')
    await setField(user, 'Width', '300')
    await setField(user, 'Height', '200')
    const { customSize, paper } = useSettings.getState().pageSetup
    expect(paper).toBe('Custom')
    expect(customSize.w).toBeLessThanOrEqual(customSize.h)
    // Width 300 -> {297,300}; then Height 200 -> {297,200} -> swapped to {200,297}
    expect(customSize).toEqual({ w: 200, h: 297 })
  })

  it('switches units without changing the stored millimetres (no drift)', async () => {
    const user = userEvent.setup()
    render(<PageSetupPanel />)
    await user.click(screen.getByRole('radio', { name: 'inches' }))
    expect(useSettings.getState().unit).toBe('in')
    expect(screen.getByLabelText('Safe area')).toHaveValue('0.2')
    await user.click(screen.getByRole('radio', { name: 'mm' }))
    await user.click(screen.getByRole('radio', { name: 'inches' }))
    await user.click(screen.getByRole('radio', { name: 'mm' }))
    expect(screen.getByLabelText('Safe area')).toHaveValue('5')
    expect(useSettings.getState().pageSetup.safeAreaMm).toBe(5)
  })

  it('arrow keys change the displayed value in inches (step 0.01 in)', async () => {
    const user = userEvent.setup()
    render(<PageSetupPanel />)
    await user.click(screen.getByRole('radio', { name: 'inches' }))
    const field = screen.getByLabelText('Safe area')
    expect(field).toHaveValue('0.2')
    await user.click(field)
    await user.keyboard('{ArrowUp}')
    expect(field).toHaveValue('0.21')
    expect(useSettings.getState().pageSetup.safeAreaMm).toBeCloseTo(5.254, 3)
  })

  it('rejects invalid numeric input (empty, negative, huge)', async () => {
    const user = userEvent.setup()
    render(<PageSetupPanel />)
    for (const bad of ['', '-5', '99999']) {
      await setField(user, 'Safe area', bad)
      const { safeAreaMm } = useSettings.getState().pageSetup
      expect(Number.isFinite(safeAreaMm)).toBe(true)
      expect(safeAreaMm).toBeGreaterThanOrEqual(3)
      expect(safeAreaMm).toBeLessThanOrEqual(30)
    }
  })

  it('turning bleed on while the gutter is off turns the gutter on and explains why', async () => {
    const user = userEvent.setup()
    useSettings.getState().setPageSetup({ gutter: { enabled: false, mm: 6 } })
    render(<PageSetupPanel />)
    await user.click(screen.getByRole('switch', { name: 'Bleed' }))
    expect(screen.getByRole('switch', { name: 'Gutter between images' })).toBeChecked()
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Gutter turned on') // notes are live regions
    })
  })

  it('raises a too-small gutter to 2 × bleed and shows the value', async () => {
    const user = userEvent.setup()
    useSettings
      .getState()
      .setPageSetup({ gutter: { enabled: true, mm: 8 }, bleed: { enabled: true, mm: 3 } })
    render(<PageSetupPanel />)
    await setField(user, 'Gutter size', '4')
    expect(useSettings.getState().pageSetup.gutter.mm).toBe(6)
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Gutter raised to 6 mm')
    })
  })

  it('shows the safe-area note when the store raises it', async () => {
    useSettings.getState().setPageSetup({ safeAreaMm: 1 })
    render(<PageSetupPanel />)
    expect(await screen.findByText('Safe area raised to 3 mm, the minimum.')).toBeInTheDocument()
    expect(DEFAULT_PAGE_SETUP.safeAreaMm).toBe(5)
  })

  it('renders the "fits N" suggestion slot, singular and plural, and hides it for null', () => {
    const { rerender } = render(<PageSetupPanel suggestedPerPage={8} />)
    expect(screen.getByText('A4 fits 8 references per page comfortably.')).toBeInTheDocument()
    rerender(<PageSetupPanel suggestedPerPage={1} />)
    expect(screen.getByText('A4 fits 1 reference per page comfortably.')).toBeInTheDocument()
    rerender(<PageSetupPanel suggestedPerPage={null} />)
    expect(screen.queryByText(/fits/)).not.toBeInTheDocument()
  })

  it('shows which orientation Auto picked', () => {
    render(<PageSetupPanel resolvedOrientation="landscape" />)
    expect(screen.getByText('Auto picked landscape: fewer pages.')).toBeInTheDocument()
  })

  it('units and orientation select with every arrow key, Home and End', async () => {
    render(<PageSetupPanel />)
    screen.getByRole('radio', { name: 'mm' }).focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(useSettings.getState().unit).toBe('in')
    await userEvent.keyboard('{ArrowUp}')
    expect(useSettings.getState().unit).toBe('mm')
    screen.getByRole('radio', { name: 'Auto' }).focus()
    await userEvent.keyboard('{End}')
    expect(useSettings.getState().pageSetup.orientation).toBe('landscape')
    await userEvent.keyboard('{ArrowUp}')
    expect(useSettings.getState().pageSetup.orientation).toBe('portrait')
    await userEvent.keyboard('{Home}')
    expect(useSettings.getState().pageSetup.orientation).toBe('auto')
    expect(screen.getByRole('radio', { name: 'Auto' })).toHaveFocus()
  })

  it('has no language control (D4)', () => {
    render(<PageSetupPanel />)
    expect(screen.queryByLabelText(/language/i)).not.toBeInTheDocument()
  })
})
