import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { BottomSheet } from './BottomSheet'
import { Dialog } from './Dialog'
import { Tabs } from './Tabs'
import { Tooltip } from './Tooltip'

describe('Dialog', () => {
  function Harness({ onOpenChange }: { onOpenChange?: (o: boolean) => void }) {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setOpen(true)
          }}
        >
          Open
        </button>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o)
            onOpenChange?.(o)
          }}
          title="Export PDF"
          description="Choose how to export"
          closeLabel="Close"
          footer={<button type="button">Download</button>}
        >
          <p>Body text</p>
        </Dialog>
      </>
    )
  }

  it('opens as a named modal with description, body and footer', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    const dialog = screen.getByRole('dialog', { name: 'Export PDF' })
    expect(dialog).toHaveAccessibleDescription('Choose how to export')
    expect(within(dialog).getByText('Body text')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Download' })).toBeInTheDocument()
  })

  it('closes with Escape and the close button', async () => {
    const onOpenChange = vi.fn()
    render(<Harness onOpenChange={onOpenChange} />)
    const opener = screen.getByRole('button', { name: 'Open' })
    await userEvent.click(opener)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.click(opener)
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('renders nothing while closed', () => {
    render(
      <Dialog open={false} onOpenChange={() => undefined} title="T" closeLabel="Close">
        x
      </Dialog>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('BottomSheet', () => {
  it('is a named dialog with a close button', async () => {
    const onOpenChange = vi.fn()
    render(
      <BottomSheet open onOpenChange={onOpenChange} title="Edit photo" closeLabel="Close sheet">
        <p>Controls</p>
      </BottomSheet>,
    )
    expect(screen.getByRole('dialog', { name: 'Edit photo' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Close sheet' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

describe.each([
  ['Dialog', Dialog],
  ['BottomSheet', BottomSheet],
] as const)('%s focus return', (_name, Overlay) => {
  function Harness({ returnFocus }: { returnFocus?: () => HTMLElement | null }) {
    const [open, setOpen] = useState(false)
    const [opener, setOpener] = useState(true)
    return (
      <>
        {opener ? (
          <button
            type="button"
            onClick={() => {
              setOpen(true)
            }}
          >
            Open
          </button>
        ) : null}
        <button type="button">Fallback</button>
        <Overlay
          open={open}
          onOpenChange={setOpen}
          title="Overlay"
          closeLabel="Close"
          footer={
            <button
              type="button"
              onClick={() => {
                setOpener(false)
                setOpen(false)
              }}
            >
              Remove opener
            </button>
          }
          {...(returnFocus ? { returnFocus } : {})}
        >
          <p>Body</p>
        </Overlay>
      </>
    )
  }

  it('returns focus to the opener after Escape', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus()
    })
  })

  it('returns focus to the opener after the close button', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus()
    })
  })

  it('focuses the returnFocus fallback when the opener is gone', async () => {
    render(<Harness returnFocus={() => screen.getByRole('button', { name: 'Fallback' })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove opener' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Fallback' })).toHaveFocus()
    })
  })
})

describe('Tabs', () => {
  function Harness() {
    const [value, setValue] = useState('page')
    return (
      <Tabs
        label="Settings"
        value={value}
        onValueChange={setValue}
        items={[
          { id: 'page', label: 'Page', content: <p>Page panel</p> },
          { id: 'studies', label: 'Studies', content: <p>Studies panel</p>, badge: '2' },
        ]}
      />
    )
  }

  it('shows the selected panel and switches on click', async () => {
    render(<Harness />)
    expect(screen.getByRole('tablist', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Page' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Page panel')).toBeVisible()
    await userEvent.click(screen.getByRole('tab', { name: /Studies/ }))
    expect(screen.getByText('Studies panel')).toBeVisible()
    expect(screen.queryByText('Page panel')).toBeNull()
  })

  it('moves between tabs with the arrow keys', async () => {
    render(<Harness />)
    screen.getByRole('tab', { name: 'Page' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: /Studies/ })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('Tooltip', () => {
  it('shows its text when the trigger is focused', async () => {
    render(
      <Tooltip content="Rotate 90 degrees">
        <button type="button">Rotate</button>
      </Tooltip>,
    )
    await userEvent.tab()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Rotate 90 degrees')
  })
})

describe('overlay hygiene', () => {
  it('logs no console errors or warnings without a description', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    render(
      <>
        <Dialog open onOpenChange={() => undefined} title="No desc" closeLabel="Close">
          x
        </Dialog>
        <BottomSheet open onOpenChange={() => undefined} title="Sheet no desc" closeLabel="Close">
          y
        </BottomSheet>
      </>,
    )
    expect(err).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    err.mockRestore()
    warn.mockRestore()
  })

  it('BottomSheet renders description and footer', () => {
    render(
      <BottomSheet
        open
        onOpenChange={() => undefined}
        title="Sheet"
        description="Sheet help"
        closeLabel="Close"
        footer={<button type="button">Apply</button>}
      >
        body
      </BottomSheet>,
    )
    const sheet = screen.getByRole('dialog', { name: 'Sheet' })
    expect(sheet).toHaveAccessibleDescription('Sheet help')
    expect(within(sheet).getByRole('button', { name: 'Apply' })).toBeInTheDocument()
  })

  it('closes when the backdrop is clicked', async () => {
    const onOpenChange = vi.fn()
    render(
      <Dialog open onOpenChange={onOpenChange} title="T" closeLabel="Close">
        x
      </Dialog>,
    )
    const overlay = document.querySelector<HTMLElement>('.ds-overlay')
    if (!overlay) throw new Error('overlay not rendered')
    await userEvent.click(overlay)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
