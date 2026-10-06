import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
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
  it('announces errors with role=alert and info with role=status', () => {
    render(<NoticeRegion />)
    act(() => {
      useNotices.getState().notify('error', 'Could not read old.heic')
      useNotices.getState().notify('info', 'Gutter raised')
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Could not read old.heic')
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
