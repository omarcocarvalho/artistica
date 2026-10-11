import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettings } from '../../features/settings'
import { ENDONYMS, LANGUAGES, initI18n, type LanguageCode } from '../../shared/i18n'
import { useNotices } from '../state/useNotices'
import { LanguageSelect } from './LanguageSelect'

const mocks = vi.hoisted(() => ({
  available: vi.fn<() => readonly string[]>(),
  setAppLanguage: vi.fn<(code: string) => Promise<'changed' | 'failed'>>(),
}))
vi.mock('../../shared/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/i18n')>()),
  availableLanguages: mocks.available,
  setAppLanguage: mocks.setAppLanguage,
}))

const LOAD_FAILED = "Couldn't load that language. Check your connection and try again."

async function changeTo(code: string): Promise<'changed'> {
  await i18next.changeLanguage(code)
  return 'changed'
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

beforeAll(async () => {
  await initI18n()
})
beforeEach(async () => {
  mocks.available.mockReturnValue(LANGUAGES)
  mocks.setAppLanguage.mockImplementation(changeTo)
  useSettings.getState().setLanguage(null)
  useNotices.getState().clear()
  await i18next.changeLanguage('en')
})
afterEach(async () => {
  vi.clearAllMocks()
  await i18next.changeLanguage('en')
})

function select(): HTMLSelectElement {
  return screen.getByRole('combobox', { name: 'Language' })
}

describe('LanguageSelect', () => {
  it('is a native select labelled "Language" with each language in its own name and lang, in LANGUAGES order', () => {
    render(<LanguageSelect />)
    const el = select()
    expect(el.tagName).toBe('SELECT')
    const options = within(el).getAllByRole('option')
    expect(options.map((o) => o.getAttribute('value'))).toEqual([...LANGUAGES])
    expect(options.map((o) => o.textContent)).toEqual(LANGUAGES.map((code) => ENDONYMS[code]))
    expect(options.map((o) => o.getAttribute('lang'))).toEqual([...LANGUAGES])
    expect(el).toHaveValue('en')
  })

  it('offers only the languages that have strings', () => {
    mocks.available.mockReturnValue(['en', 'ja'])
    render(<LanguageSelect />)
    expect(
      within(select())
        .getAllByRole('option')
        .map((o) => o.getAttribute('value')),
    ).toEqual(['en', 'ja'])
  })

  it('selects the language showing', async () => {
    await i18next.changeLanguage('ko')
    render(<LanguageSelect />)
    expect(select()).toHaveValue('ko')
  })

  it('shows the current endonym beside the globe, in its own language and hidden from assistive technology', async () => {
    const { container } = render(<LanguageSelect />)
    const name = container.querySelector('[data-language-name]')
    expect(name).toHaveTextContent('English')
    expect(name).toHaveAttribute('lang', 'en')
    expect(name).toHaveAttribute('aria-hidden', 'true')
    await userEvent.selectOptions(select(), 'ja')
    expect(container.querySelector('[data-language-name]')).toHaveTextContent('日本語')
    expect(container.querySelector('[data-language-name]')).toHaveAttribute('lang', 'ja')
  })

  it('saves the choice and switches through setAppLanguage, keeping focus on the select', async () => {
    const user = userEvent.setup()
    render(<LanguageSelect />)
    const el = select()
    el.focus()
    await user.selectOptions(el, 'it')
    expect(mocks.setAppLanguage).toHaveBeenCalledExactlyOnceWith('it')
    expect(useSettings.getState().language).toBe('it')
    expect(i18next.language).toBe('it')
    expect(select()).toBe(el)
    expect(el).toHaveFocus()
    expect(el).toHaveValue('it')
  })

  it('is aria-busy while the language loads, showing the choice', async () => {
    const load = deferred<'changed'>()
    mocks.setAppLanguage.mockImplementation(async (code) => {
      await load.promise
      return changeTo(code)
    })
    render(<LanguageSelect />)
    await userEvent.selectOptions(select(), 'es')
    expect(select()).toHaveAttribute('aria-busy', 'true')
    expect(select()).toHaveValue('es')
    expect(useSettings.getState().language).toBeNull()
    await act(async () => {
      load.resolve('changed')
      await load.promise
    })
    expect(select()).not.toHaveAttribute('aria-busy')
    expect(useSettings.getState().language).toBe('es')
  })

  it('on a failed load shows the error toast, keeps the old language, saves nothing and puts the select back', async () => {
    mocks.setAppLanguage.mockResolvedValue('failed')
    useSettings.getState().setLanguage('en')
    render(<LanguageSelect />)
    const el = select()
    el.focus()
    await userEvent.selectOptions(el, 'zh-CN')
    expect(useNotices.getState().notices).toEqual([
      expect.objectContaining({ kind: 'error', message: LOAD_FAILED }),
    ])
    expect(i18next.language).toBe('en')
    expect(useSettings.getState().language).toBe('en')
    expect(el).toHaveValue('en')
    expect(el).not.toHaveAttribute('aria-busy')
    expect(el).toHaveFocus()
  })

  it('writes the error toast in the language showing', async () => {
    i18next.addResourceBundle('pt-BR', 'app', { language: { loadFailed: 'Falhou.' } }, true, true)
    await i18next.changeLanguage('pt-BR')
    mocks.setAppLanguage.mockResolvedValue('failed')
    render(<LanguageSelect />)
    await userEvent.selectOptions(select(), 'ja')
    expect(useNotices.getState().notices.map((n) => n.message)).toEqual(['Falhou.'])
    expect(select()).toHaveValue('pt-BR')
  })

  it('ends on the last choice when a slower earlier load finishes after it', async () => {
    const slow = deferred<'changed'>()
    mocks.setAppLanguage.mockImplementation(async (code) => {
      if (code === 'ja') await slow.promise
      return changeTo(code)
    })
    render(<LanguageSelect />)
    await userEvent.selectOptions(select(), 'ja')
    await userEvent.selectOptions(select(), 'ko')
    expect(select()).toHaveValue('ko')
    await act(async () => {
      slow.resolve('changed')
      await slow.promise
    })
    await vi.waitFor(() => {
      expect(i18next.language).toBe('ko')
    })
    expect(useSettings.getState().language).toBe('ko')
    expect(select()).toHaveValue('ko')
    expect(select()).not.toHaveAttribute('aria-busy')
  })

  it('never loads a choice that a later one replaced before its turn came', async () => {
    const slow = deferred<'changed'>()
    mocks.setAppLanguage.mockImplementation(async (code) => {
      if (code === 'ja') await slow.promise
      return changeTo(code)
    })
    render(<LanguageSelect />)
    await userEvent.selectOptions(select(), 'ja')
    await userEvent.selectOptions(select(), 'ko')
    await userEvent.selectOptions(select(), 'es')
    await act(async () => {
      slow.resolve('changed')
      await slow.promise
    })
    await vi.waitFor(() => {
      expect(select()).not.toHaveAttribute('aria-busy')
    })
    expect(mocks.setAppLanguage.mock.calls.map(([code]) => code)).toEqual(['ja', 'es'])
    expect(i18next.language).toBe('es')
    expect(useSettings.getState().language).toBe('es')
  })

  describe('size and width', () => {
    it('hides the endonym and the arrow below sm, keeps the globe, and grows to 44 px on touch', () => {
      const { container } = render(<LanguageSelect />)
      const wrapper = select().parentElement
      expect(wrapper?.className).toMatch(/(^| )touch:min-h-\(--size-target\)( |$)/)
      expect(wrapper?.className).toMatch(/(^| )touch:min-w-\(--size-target\)( |$)/)
      expect(wrapper?.className).toMatch(/(^| )min-h-\(--size-target-dense\)( |$)/)
      const name = container.querySelector('[data-language-name]')
      expect(name?.className).toMatch(/(^| )hidden( |$)/)
      expect(name?.className).toMatch(/(^| )sm:inline( |$)/)
      const icons = [...(wrapper?.querySelectorAll('svg') ?? [])]
      expect(icons).toHaveLength(2)
      const [globe, arrow] = icons
      expect(globe?.getAttribute('class') ?? '').not.toMatch(/(^| )hidden( |$)/)
      expect(arrow?.getAttribute('class') ?? '').toMatch(/(^| )hidden( |$)/)
      expect(arrow?.getAttribute('class') ?? '').toMatch(/(^| )sm:inline( |$)/)
    })
    it('lays the select over the whole control, so a tap anywhere opens the native picker', () => {
      render(<LanguageSelect />)
      expect(select().className).toMatch(/(^| )absolute( |$)/)
      expect(select().className).toMatch(/(^| )-inset-px( |$)/)
      expect(select().className).toMatch(/(^| )opacity-0( |$)/)
    })
  })
})

describe.each<LanguageCode>(['en', 'ja'])('the label in %s', (code) => {
  it('stays the translated "Language" whatever the value', async () => {
    i18next.addResourceBundle('ja', 'app', { language: { label: '言語' } }, true, true)
    await i18next.changeLanguage(code)
    render(<LanguageSelect />)
    const name = code === 'ja' ? '言語' : 'Language'
    expect(screen.getByRole('combobox', { name })).toHaveValue(code)
  })
})
