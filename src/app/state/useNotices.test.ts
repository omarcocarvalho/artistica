import { beforeEach, describe, expect, it } from 'vitest'
import { useNotices } from './useNotices'

beforeEach(() => {
  useNotices.getState().clear()
})

describe('useNotices', () => {
  it('adds notices with increasing ids', () => {
    const a = useNotices.getState().notify('error', 'one')
    const b = useNotices.getState().notify('info', 'two')
    expect(b).toBeGreaterThan(a)
    expect(useNotices.getState().notices.map((n) => n.message)).toEqual(['one', 'two'])
  })
  it('does not duplicate an identical live message and returns the existing id', () => {
    const a = useNotices.getState().notify('error', 'same')
    const b = useNotices.getState().notify('error', 'same')
    expect(b).toBe(a)
    expect(useNotices.getState().notices).toHaveLength(1)
  })
  it('keeps at most 4 notices, dropping the oldest', () => {
    for (const m of ['1', '2', '3', '4', '5']) useNotices.getState().notify('info', m)
    expect(useNotices.getState().notices.map((n) => n.message)).toEqual(['2', '3', '4', '5'])
  })
  it('dismisses one and clears all', () => {
    const a = useNotices.getState().notify('error', 'x')
    useNotices.getState().notify('error', 'y')
    useNotices.getState().dismiss(a)
    expect(useNotices.getState().notices.map((n) => n.message)).toEqual(['y'])
    useNotices.getState().clear()
    expect(useNotices.getState().notices).toEqual([])
  })
})
