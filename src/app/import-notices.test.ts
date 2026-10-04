import { beforeEach, describe, expect, it } from 'vitest'
import { reportPasteOutcomes } from './import-notices'
import { useNotices } from './state/useNotices'
import type { ImportOutcome } from '../features/images'
import type { ImageId } from '../shared/model/image'

const t = ((key: string, o?: Record<string, unknown>) =>
  o ? `${key}${JSON.stringify(o)}` : key) as unknown as Parameters<typeof reportPasteOutcomes>[1]
const nameOf = (id: ImageId) => (id === ('gif' as ImageId) ? 'spin.gif' : undefined)

beforeEach(() => {
  useNotices.getState().clear()
})

const ok = (id: string, warnings?: 'animated-gif'[]): ImportOutcome => ({
  ok: true,
  id: id as ImageId,
  ...(warnings ? { warnings } : {}),
})
const bad = (source: string, error: 'cors' | 'not-an-image'): ImportOutcome => ({
  ok: false,
  source,
  error,
})

describe('reportPasteOutcomes', () => {
  it('stays silent when everything imported', () => {
    reportPasteOutcomes([ok('a'), ok('b')], t, nameOf)
    expect(useNotices.getState().notices).toEqual([])
  })
  it('tells the user when the clipboard had nothing to paste (info, not an error)', () => {
    reportPasteOutcomes([], t, nameOf)
    const [notice] = useNotices.getState().notices
    expect(notice?.kind).toBe('info')
    expect(notice?.message).toContain('images:dropzone.noImage.title')
    expect(notice?.message).toContain('images:dropzone.noImage.message')
  })
  it('raises one error notice per error code using importErrorKeys (camelCase title and message), naming the sources', () => {
    reportPasteOutcomes(
      [bad('a.txt', 'not-an-image'), bad('b.txt', 'not-an-image'), bad('https://x/y.jpg', 'cors')],
      t,
      nameOf,
    )
    const notices = useNotices.getState().notices
    expect(notices).toHaveLength(2)
    expect(notices.every((n) => n.kind === 'error')).toBe(true)
    expect(notices[0]?.message).toContain('errors:images.notAnImage.title')
    expect(notices[0]?.message).toContain('errors:images.notAnImage.message')
    expect(notices[0]?.message).toContain('a.txt, b.txt')
    expect(notices[1]?.message).toContain('errors:images.cors.title')
    expect(notices[0]?.message).not.toContain('errors:images.not-an-image')
  })
  it('shows the animated-GIF warning as an info notice naming the image', () => {
    reportPasteOutcomes([ok('gif', ['animated-gif'])], t, nameOf)
    const [notice] = useNotices.getState().notices
    expect(notice?.kind).toBe('info')
    expect(notice?.message).toContain('errors:images.animatedGif.title')
    expect(notice?.message).toContain('spin.gif')
  })
  it('truncates long source lists', () => {
    const many = Array.from({ length: 8 }, (_, i) => bad(`f${String(i)}.txt`, 'not-an-image'))
    reportPasteOutcomes(many, t, nameOf)
    const message = useNotices.getState().notices[0]?.message ?? ''
    expect(message).toContain('f0.txt, f1.txt, f2.txt')
    expect(message).not.toContain('f3.txt')
    expect(message).toContain('"more":5')
  })
})
