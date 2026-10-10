// Node types are only needed to read the stylesheets (tsconfig.app.json lists just vite/client).
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { act, render, screen, waitFor } from '@testing-library/react'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Badge } from './Badge'
import { Button } from './Button'
import { buttonClasses } from './button-classes'
import { Callout } from './Callout'
import { Chip } from './Chip'
import { IconButton } from './IconButton'
import { ProgressBar } from './ProgressBar'
import { SketchCard } from './SketchCard'
import { VisuallyHidden } from './VisuallyHidden'

const readCss = (name: string) => readFileSync(`src/shared/ui/css/${name}`, 'utf8')
const basicsCss = readCss('basics.css')
const overlaysCss = readCss('overlays.css')

function ruleBody(css: string, selector: string, from = 0): string {
  const at = css.indexOf(`${selector} {`, from)
  expect(at, `rule ${selector}`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', at)
  return css.slice(open + 1, css.indexOf('}', open))
}

function mediaBlock(css: string, query: string): string {
  const at = css.indexOf(`@media ${query} {`)
  expect(at, `@media ${query}`).toBeGreaterThanOrEqual(0)
  let depth = 0
  for (let i = css.indexOf('{', at); i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(at, i + 1)
  }
  return ''
}

const HEX = /#[0-9a-f]{3,8}\b|%23[0-9a-f]{3,8}/i

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? reduce : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
}

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

  function FirstCommit({ children, seen }: { children: ReactNode; seen: string[] }) {
    const ref = useRef<HTMLDivElement>(null)
    useLayoutEffect(() => {
      const region = ref.current?.querySelector('[role="status"], [role="alert"]')
      seen.push(
        region
          ? `${region.getAttribute('role') ?? ''}:${region.textContent}`
          : `none:${ref.current?.textContent ?? ''}`,
      )
    }, [seen])
    return <div ref={ref}>{children}</div>
  }

  it.each([
    ['warning', 'status'],
    ['danger', 'alert'],
  ] as const)(
    'a live %s callout mounts its %s region empty, then inserts the message',
    async (tone, role) => {
      const seen: string[] = []
      render(
        <FirstCommit seen={seen}>
          <Callout tone={tone} title="Heads up" live>
            Careful
          </Callout>
        </FirstCommit>,
      )
      expect(seen).toEqual([`${role}:`])
      expect(screen.getByRole(role).textContent).toBe('')
      await waitFor(() => {
        expect(screen.getByRole(role)).toHaveTextContent('Heads upCareful')
      })
    },
  )

  it('a callout that is not live shows its message at once', () => {
    const seen: string[] = []
    const { container } = render(
      <FirstCommit seen={seen}>
        <Callout tone="warning">Careful</Callout>
      </FirstCommit>,
    )
    expect(seen).toEqual(['none:Careful'])
    expect(container).toHaveTextContent('Careful')
  })

  it('a live callout keeps its region and swaps the message in place', async () => {
    const { rerender } = render(
      <Callout tone="warning" live>
        First
      </Callout>,
    )
    const region = screen.getByRole('status')
    rerender(
      <Callout tone="warning" live>
        Second
      </Callout>,
    )
    expect(screen.getByRole('status')).toBe(region)
    await waitFor(() => {
      expect(region).toHaveTextContent('Second')
    })
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

  describe('indeterminate, under reduced motion (M5-R25)', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })
    const fill = () => {
      const el = screen.getByRole('progressbar').firstElementChild
      expect(el).not.toBeNull()
      return el as HTMLElement
    }

    it('fills the whole track with the static class and no inline width', () => {
      stubReducedMotion(true)
      render(<ProgressBar value={null} label="Loading" />)
      expect(fill()).toHaveClass('ds-progress__fill', 'ds-progress__fill--indeterminate-static')
      expect(fill()).not.toHaveClass('ds-progress__fill--indeterminate')
      expect(fill().style.width).toBe('')
    })

    it('slides a partial bar when motion is allowed', () => {
      stubReducedMotion(false)
      render(<ProgressBar value={null} label="Loading" />)
      expect(fill()).toHaveClass('ds-progress__fill--indeterminate')
      expect(fill()).not.toHaveClass('ds-progress__fill--indeterminate-static')
    })

    it('slides when the browser has no matchMedia', () => {
      vi.stubGlobal('matchMedia', undefined)
      render(<ProgressBar value={null} label="Loading" />)
      expect(fill()).toHaveClass('ds-progress__fill--indeterminate')
    })

    it('follows a change of the motion preference while mounted', () => {
      let reduce = false
      const listeners = new Set<() => void>()
      vi.stubGlobal('matchMedia', (query: string) => ({
        get matches() {
          return query === '(prefers-reduced-motion: reduce)' && reduce
        },
        media: query,
        addEventListener: (_: string, cb: () => void) => listeners.add(cb),
        removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
      }))
      const { unmount } = render(<ProgressBar value={null} label="Loading" />)
      expect(fill()).toHaveClass('ds-progress__fill--indeterminate')
      act(() => {
        reduce = true
        for (const cb of listeners) cb()
      })
      expect(fill()).toHaveClass('ds-progress__fill--indeterminate-static')
      unmount()
      expect(listeners.size).toBe(0)
    })

    it('keeps a determinate bar at its value', () => {
      stubReducedMotion(true)
      render(<ProgressBar value={0.25} label="Exporting" />)
      expect(fill().style.width).toBe('25%')
      expect(fill()).not.toHaveClass('ds-progress__fill--indeterminate-static')
    })

    it('styles the static fill as the full track with still stripes', () => {
      const body = ruleBody(basicsCss, '.ds-progress__fill--indeterminate-static')
      expect(body).toMatch(/\bwidth:\s*100%/)
      expect(body).toMatch(/\banimation:\s*none/)
      expect(ruleBody(basicsCss, '.ds-progress__fill')).toMatch(/repeating-linear-gradient/)
    })
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

describe('selected tab underline', () => {
  const SELECTED = ".ds-tab[aria-selected='true']::after"

  it('takes its colour from a token, so it follows dark mode', () => {
    const body = ruleBody(overlaysCss, SELECTED)
    expect(body).not.toMatch(HEX)
    expect(body).toMatch(/background(-color)?:\s*(var\(--color-[a-z-]+\)|currentColor)/)
  })

  it('keeps the squiggle shape as a mask over that colour', () => {
    const body = ruleBody(overlaysCss, SELECTED)
    expect(body).toMatch(/\bmask:\s*url\("data:image\/svg\+xml;[^"]*<path /)
  })

  it('uses a system colour in forced colours', () => {
    const block = mediaBlock(overlaysCss, '(forced-colors: active)')
    const body = ruleBody(block, SELECTED)
    expect(body).toMatch(/forced-color-adjust:\s*none/)
    expect(body).toMatch(/background(-color)?:\s*(Highlight|CanvasText|currentColor)\b/)
  })
})
