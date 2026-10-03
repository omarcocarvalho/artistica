import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Icon } from './Icon'
import { ICON_NAMES } from './icon-paths'

describe('Icon', () => {
  it('renders every named icon as a hidden svg', () => {
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />)
      expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
      expect(container.querySelectorAll('path').length).toBeGreaterThan(0)
      unmount()
    }
  })
})
