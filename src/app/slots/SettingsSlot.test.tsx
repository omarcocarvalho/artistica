import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useImages } from '../../features/images'
import { makeLoadedImage } from '../../features/images/test-utils'
import { initI18n } from '../../shared/i18n'
import type { ImageId } from '../../shared/model/image'
import { useAppUi } from '../state/useAppUi'
import { SettingsSlot } from './SettingsSlot'

beforeAll(async () => {
  await initI18n()
})
beforeEach(() => {
  useAppUi.setState(useAppUi.getInitialState())
  useImages.setState({
    images: [
      makeLoadedImage({ id: 'a' as ImageId, name: 'a.jpg' }),
      makeLoadedImage({ id: 'b' as ImageId, name: 'b.jpg' }),
    ],
    selectedId: 'a' as ImageId,
  })
})

describe('SettingsSlot', () => {
  it('mounts the page setup panel with no suggestion before a layout exists', () => {
    render(<SettingsSlot variant="desktop" />)
    expect(screen.getByLabelText('Paper size')).toBeInTheDocument()
    expect(screen.queryByText(/fits/)).not.toBeInTheDocument()
  })
  it('desktop: tabs Page and Studies; the Studies tab shows the studies panel', async () => {
    const user = userEvent.setup()
    render(<SettingsSlot variant="desktop" />)
    const tabs = screen.getByRole('tablist', { name: 'Settings' })
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual(['Page', 'Studies', 'Lines'])
    expect(within(tabs).getByRole('tab', { name: 'Page' })).toHaveAttribute('aria-selected', 'true')
    await user.click(within(tabs).getByRole('tab', { name: 'Studies' }))
    const panel = screen.getByRole('tabpanel', { name: 'Studies' })
    expect(panel).toBeVisible()
    expect(within(panel).getByRole('group', { name: 'Print these versions' })).toBeInTheDocument()
    expect(useAppUi.getState().settingsTab).toBe('studies')
  })
  it('desktop: arrow keys reach the Lines tab, which shows the lines panel', async () => {
    const user = userEvent.setup()
    render(<SettingsSlot variant="desktop" />)
    screen.getByRole('tab', { name: 'Page' }).focus()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    const lines = screen.getByRole('tab', { name: 'Lines' })
    expect(lines).toHaveFocus()
    expect(lines).toHaveAttribute('aria-selected', 'true')
    expect(useAppUi.getState().settingsTab).toBe('lines')
    const panel = screen.getByRole('tabpanel', { name: 'Lines' })
    expect(within(panel).getByRole('switch', { name: 'Rule of thirds' })).toBeInTheDocument()
    expect(
      within(panel).getByRole('button', { name: 'Apply lines to all images' }),
    ).toBeInTheDocument()
  })
  it('desktop: the Lines tab follows the selection (D6) and edits only the selected image', async () => {
    const user = userEvent.setup()
    useAppUi.getState().setSettingsTab('lines')
    render(<SettingsSlot variant="desktop" />)
    const panel = screen.getByRole('tabpanel', { name: 'Lines' })
    expect(within(panel).getByText('a.jpg', { selector: 'strong' })).toBeVisible()
    act(() => {
      useImages.getState().select('b' as ImageId)
    })
    expect(within(panel).getByText('b.jpg', { selector: 'strong' })).toBeVisible()
    await user.click(within(panel).getByRole('switch', { name: 'Centre lines' }))
    const [a, b] = useImages.getState().images
    expect(b?.lines.centre).toBe(true)
    expect(a?.lines.centre).toBe(false)
  })
  it('desktop: opens on the remembered tab', () => {
    useAppUi.getState().setSettingsTab('studies')
    render(<SettingsSlot variant="desktop" />)
    expect(screen.getByRole('tab', { name: 'Studies' })).toHaveAttribute('aria-selected', 'true')
  })
  it('desktop: each panel starts with a level-2 heading above its level-3 sections', async () => {
    const user = userEvent.setup()
    render(<SettingsSlot variant="desktop" />)
    const page = screen.getByRole('tabpanel', { name: 'Page' })
    expect(within(page).getByRole('heading', { level: 2 })).toHaveTextContent('Page')
    expect(within(page).getAllByRole('heading', { level: 3 }).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('tab', { name: 'Studies' }))
    const studies = screen.getByRole('tabpanel', { name: 'Studies' })
    expect(within(studies).getByRole('heading', { level: 2 })).toHaveTextContent('Studies')
    expect(within(studies).getAllByRole('heading', { level: 3 }).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('tab', { name: 'Lines' }))
    const lines = screen.getByRole('tabpanel', { name: 'Lines' })
    expect(within(lines).getByRole('heading', { level: 2 })).toHaveTextContent('Lines')
    expect(
      within(lines)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(['Composition', 'Line style'])
  })
  it('phone: the Page step shows the page setup only (no tabs)', () => {
    render(<SettingsSlot variant="phone" />)
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Paper size')).toBeInTheDocument()
  })
})
