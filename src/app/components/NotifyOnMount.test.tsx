import { render } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { useNotices } from '../state/useNotices'
import { NotifyOnMount } from './NotifyOnMount'

afterEach(() => {
  useNotices.getState().clear()
})

describe('NotifyOnMount', () => {
  it('posts its notice once after mounting, also under StrictMode', () => {
    expect(useNotices.getState().notices).toEqual([])
    render(
      <StrictMode>
        <NotifyOnMount kind="error" message="Couldn't load that language." />
      </StrictMode>,
    )
    expect(useNotices.getState().notices).toEqual([
      expect.objectContaining({ kind: 'error', message: "Couldn't load that language." }),
    ])
  })
})
