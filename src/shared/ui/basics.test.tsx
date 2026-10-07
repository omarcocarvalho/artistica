import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Badge } from './Badge'
import { Button } from './Button'
import { buttonClasses } from './button-classes'
import { Callout } from './Callout'
import { Chip } from './Chip'
import { IconButton } from './IconButton'
import { ProgressBar } from './ProgressBar'
import { SketchCard } from './SketchCard'
import { VisuallyHidden } from './VisuallyHidden'

describe('buttonClasses', () => {
  it('builds the class string for each variant, size and option', () => {
    expect(buttonClasses('neutral', 'md')).toBe('ds-btn')
    expect(buttonClasses('primary', 'lg', { block: true })).toBe(
      'ds-btn ds-btn--primary ds-btn--lg ds-btn--block',
    )
    expect(buttonClasses('ghost', 'md', { iconOnly: true })).toBe(
      'ds-btn ds-btn--ghost ds-btn--icon',
    )
  })

  it('is what Button renders, so link-buttons cannot drift', () => {
    render(
      <>
        <Button variant="danger" size="lg" block>
          Delete
        </Button>
        <a href="/x" download className={buttonClasses('danger', 'lg', { block: true })}>
          Link
        </a>
      </>,
    )
    expect(screen.getByRole('button').className).toBe(screen.getByRole('link').className)
  })
})

describe('Button', () => {
  it('defaults to type=button and fires onClick', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toHaveAttribute('type', 'button')
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('maps variant, size and block to classes', () => {
    render(
      <Button variant="primary" size="lg" block>
        Go
      </Button>,
    )
    expect(screen.getByRole('button')).toHaveClass(
      'ds-btn',
      'ds-btn--primary',
      'ds-btn--lg',
      'ds-btn--block',
    )
  })

  it('does not fire when disabled and can show a decorative icon', async () => {
    const onClick = vi.fn()
    render(
      <Button disabled icon="download" onClick={onClick}>
        Export
      </Button>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Export' }))
    expect(onClick).not.toHaveBeenCalled()
    expect(document.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('IconButton', () => {
  it('is named by its label prop', () => {
    render(<IconButton label="Remove photo" icon="trash" />)
    expect(screen.getByRole('button', { name: 'Remove photo' })).toHaveClass('ds-btn--icon')
  })
})

describe('Badge', () => {
  it('shows text and tone, with an optional icon', () => {
    render(
      <Badge tone="warning" icon="warning">
        Low DPI
      </Badge>,
    )
    const badge = screen.getByText('Low DPI')
    expect(badge).toHaveClass('ds-badge', 'ds-badge--warning')
    expect(badge.querySelector('svg')).not.toBeNull()
  })
})

describe('Chip', () => {
  it('toggles and reports aria-pressed', async () => {
    const onCheckedChange = vi.fn()
    const { rerender } = render(
      <Chip checked={false} onCheckedChange={onCheckedChange}>
        Blur
      </Chip>,
    )
    const chip = screen.getByRole('button', { name: 'Blur' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(chip)
    expect(onCheckedChange).toHaveBeenCalledWith(true)
    rerender(
      <Chip checked onCheckedChange={onCheckedChange}>
        Blur
      </Chip>,
    )
    expect(chip).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows a check mark only when pressed, hidden from the accessible name', () => {
    const { rerender } = render(
      <Chip checked={false} onCheckedChange={vi.fn()}>
        Blur
      </Chip>,
    )
    const chip = screen.getByRole('button', { name: 'Blur' })
    const box = chip.querySelector('.ds-chip__box')
    expect(box).toHaveAttribute('aria-hidden', 'true')
    expect(box?.querySelector('svg')).toBeNull()
    rerender(
      <Chip checked onCheckedChange={vi.fn()}>
        Blur
      </Chip>,
    )
    expect(chip.querySelector('.ds-chip__box svg')).not.toBeNull()
    expect(chip).toHaveAccessibleName('Blur')
    expect(chip).toHaveTextContent(/^Blur$/)
  })
})

describe('Callout', () => {
  it('is silent by default and a live region on request', () => {
    const { rerender } = render(<Callout title="Heads up">Gutter raised.</Callout>)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByText('Heads up')).toBeInTheDocument()
    rerender(
      <Callout tone="danger" live>
        Broken
      </Callout>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Broken')
    rerender(
      <Callout tone="warning" live>
        Careful
      </Callout>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Careful')
  })

  it('renders actions', () => {
    render(<Callout actions={<button type="button">Undo</button>}>Done</Callout>)
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })
})

describe('ProgressBar', () => {
  it('exposes a named progressbar with a clamped percentage', () => {
    render(<ProgressBar value={1.7} label="Exporting" valueText="Page 2 of 2" />)
    const bar = screen.getByRole('progressbar', { name: 'Exporting' })
    expect(bar).toHaveAttribute('aria-valuenow', '100')
    expect(bar).toHaveAttribute('aria-valuetext', 'Page 2 of 2')
  })

  it('has no aria-valuenow while indeterminate', () => {
    render(<ProgressBar value={null} label="Loading" />)
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow')
  })
})

describe('SketchCard / VisuallyHidden', () => {
  it('renders children, and tape is hidden from assistive tech', () => {
    const { container } = render(<SketchCard tape>Hello</SketchCard>)
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(container.querySelector('.ds-tape')).toHaveAttribute('aria-hidden', 'true')
  })

  it('keeps text for screen readers', () => {
    render(<VisuallyHidden>Only for readers</VisuallyHidden>)
    expect(screen.getByText('Only for readers')).toHaveClass('sr-only')
  })
})
