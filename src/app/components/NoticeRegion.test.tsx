import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act, useLayoutEffect, useRef } from 'react'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { initI18n } from '../../shared/i18n'
import { useNotices } from '../state/useNotices'
import { NoticeRegion } from './NoticeRegion'

beforeAll(async () => {
  await initI18n()
})
beforeEach(() => {
  useNotices.getState().clear()
})

describe('NoticeRegion', () => {
  it('announces errors with role=alert and info with role=status', async () => {
    render(<NoticeRegion />)
    act(() => {
      useNotices.getState().notify('error', 'Could not read old.heic')
      useNotices.getState().notify('info', 'Gutter raised')
    })
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Could not read old.heic')
    })
    expect(screen.getByRole('status')).toHaveTextContent('Gutter raised')
  })
  it('dismisses a notice with its button', async () => {
    render(<NoticeRegion />)
    act(() => {
      useNotices.getState().notify('error', 'Nope')
    })
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('Nope')).not.toBeInTheDocument()
  })
  it('mounts an error toast with its alert empty, then inserts the message (M1 #70)', async () => {
    const seen: string[] = []
    function Probe() {
      const ref = useRef<HTMLDivElement>(null)
      const count = useNotices((s) => s.notices.length)
      useLayoutEffect(() => {
        if (count === 0) return
        seen.push(ref.current?.querySelector('[role="alert"]')?.textContent ?? 'none')
      }, [count])
      return (
        <div ref={ref}>
          <NoticeRegion />
        </div>
      )
    }
    render(<Probe />)
    act(() => {
      useNotices.getState().notify('error', 'Could not read old.heic')
    })
    expect(seen[0]).toBe('')
    expect(screen.getByRole('alert').querySelector('p')).toBeEmptyDOMElement()
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Could not read old.heic')
    })
  })
  it('keeps the status live region mounted and only changes its content', () => {
    render(<NoticeRegion />)
    const status = screen.getByRole('status')
    expect(status).toBeEmptyDOMElement()
    act(() => {
      useNotices.getState().notify('info', 'Gutter raised')
    })
    expect(screen.getByRole('status')).toBe(status)
    expect(status).toHaveTextContent('Gutter raised')
    act(() => {
      useNotices.getState().clear()
    })
    expect(screen.getByRole('status')).toBe(status)
    expect(status).toBeEmptyDOMElement()
  })
})
