import type { TFunction } from 'i18next'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reportPasteOutcomes } from './import-notices'
import { useNotices } from './state/useNotices'
import type { ImportOutcome } from '../features/images'
import type { ImageId } from '../shared/model/image'
import { switchLanguage } from '../test/languages'

const nameOf = (id: ImageId) => (id === ('gif' as ImageId) ? 'spin.gif' : undefined)
let t: TFunction

beforeEach(async () => {
  t = (await switchLanguage('en')).t
  useNotices.getState().clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
})
afterAll(async () => {
  await switchLanguage('en')
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
const messages = () => useNotices.getState().notices.map((n) => [n.kind, n.message])

describe('reportPasteOutcomes', () => {
  it('stays silent when everything imported', () => {
    reportPasteOutcomes([ok('a'), ok('b')], t, nameOf)
    expect(useNotices.getState().notices).toEqual([])
  })

  it('tells the user when the clipboard had nothing to paste, in one message (info)', () => {
    reportPasteOutcomes([], t, nameOf)
    expect(messages()).toEqual([
      ['info', 'No image on the clipboard. Copy an image first, then paste again.'],
    ])
  })

  it('raises one error notice per error code, listing the sources with the language list format', () => {
    reportPasteOutcomes(
      [bad('a.txt', 'not-an-image'), bad('b.txt', 'not-an-image'), bad('https://x/y.jpg', 'cors')],
      t,
      nameOf,
    )
    expect(messages()).toEqual([
      [
        'error',
        "a.txt and b.txt: That's not an image. The link or file doesn't contain a picture. Use JPG, PNG, WebP, GIF or HEIC.",
      ],
      [
        'error',
        "https://x/y.jpg: Can't read this image. This site doesn't allow other apps to read its images. Download it and upload it instead.",
      ],
    ])
  })

  it('shows the animated-GIF warning as one info message naming the image', () => {
    reportPasteOutcomes([ok('gif', ['animated-gif'])], t, nameOf)
    expect(messages()).toEqual([
      ['info', 'spin.gif: first frame only. Animated GIFs print their first frame.'],
    ])
  })

  it('names an animated GIF without a name with the fallback', () => {
    reportPasteOutcomes([ok('other', ['animated-gif'])], t, nameOf)
    expect(messages()[0]?.[1]).toBe(
      'This image: first frame only. Animated GIFs print their first frame.',
    )
  })

  it('truncates long source lists and counts the rest as the last list item', () => {
    const many = Array.from({ length: 8 }, (_, i) => bad(`f${String(i)}.txt`, 'not-an-image'))
    reportPasteOutcomes(many, t, nameOf)
    const message = useNotices.getState().notices[0]?.message ?? ''
    expect(message.startsWith('f0.txt, f1.txt, f2.txt, and 5 more: ')).toBe(true)
    expect(message).not.toContain('f3.txt')
  })

  it.each([
    [true, 100],
    [false, 200],
  ])(
    'names the pixel limit for this device in a "too large" notice (coarse pointer %s, owner Q-H7)',
    (coarse, maxMp) => {
      vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)' && coarse }))
      reportPasteOutcomes([{ ok: false, source: 'huge.jpg', error: 'too-large' }], t, nameOf)
      expect(messages()[0]?.[1]).toBe(
        `huge.jpg: huge.jpg is too large. Photos can be up to 100 MB and ${String(maxMp)} megapixels. Try a smaller version.`,
      )
    },
  )
})

describe('reportPasteOutcomes in another language (M6-R10)', () => {
  const PT = {
    app: {
      import: {
        noImage: 'Nada para colar: copie uma imagem antes.',
        animatedGif: 'Só o primeiro quadro de {{name}} será impresso.',
        failed: '{{title}} ({{list}}). {{message}}',
        more_one: 'mais {{count, number}}',
        more_many: 'mais {{count, number}}',
        more_other: 'mais {{count, number}}',
      },
    },
    errors: { images: { notAnImage: { title: 'Não é uma imagem', message: 'Use JPG ou PNG.' } } },
  }

  it('lets the language order every part of each notice', async () => {
    t = (await switchLanguage('pt-BR', PT)).t
    const many = Array.from({ length: 5 }, (_, i) => bad(`f${String(i)}.txt`, 'not-an-image'))
    reportPasteOutcomes([], t, nameOf)
    reportPasteOutcomes([ok('gif', ['animated-gif'])], t, nameOf)
    reportPasteOutcomes(many, t, nameOf)
    expect(messages()).toEqual([
      ['info', 'Nada para colar: copie uma imagem antes.'],
      ['info', 'Só o primeiro quadro de spin.gif será impresso.'],
      ['error', 'Não é uma imagem (f0.txt, f1.txt, f2.txt e mais 2). Use JPG ou PNG.'],
    ])
  })
})
