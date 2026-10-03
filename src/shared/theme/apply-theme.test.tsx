import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useSettings } from '../../features/settings'
import { applyTheme, nextTheme, useApplyTheme } from './apply-theme'

afterEach(() => {
  act(() => {
    useSettings.getState().reset()
  })
  document.documentElement.removeAttribute('data-theme')
})

describe('applyTheme', () => {
  it('sets data-theme for light and dark and removes it for auto', () => {
    const root = document.createElement('html')
    applyTheme('dark', root)
    expect(root).toHaveAttribute('data-theme', 'dark')
    applyTheme('light', root)
    expect(root).toHaveAttribute('data-theme', 'light')
    applyTheme('auto', root)
    expect(root).not.toHaveAttribute('data-theme')
  })
})

describe('nextTheme', () => {
  it('cycles auto → light → dark → auto', () => {
    expect(nextTheme('auto')).toBe('light')
    expect(nextTheme('light')).toBe('dark')
    expect(nextTheme('dark')).toBe('auto')
  })
})

describe('useApplyTheme', () => {
  it('applies the stored theme and follows changes on <html>', () => {
    const html = document.documentElement
    act(() => {
      useSettings.getState().setTheme('dark')
    })
    renderHook(() => {
      useApplyTheme()
    })
    expect(html).toHaveAttribute('data-theme', 'dark')
    act(() => {
      useSettings.getState().setTheme('light')
    })
    expect(html).toHaveAttribute('data-theme', 'light')
    act(() => {
      useSettings.getState().setTheme('auto')
    })
    expect(html).not.toHaveAttribute('data-theme')
  })
})
