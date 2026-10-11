import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PresetsButton } from '../app/components/PresetsButton'
import { TopBar } from '../app/components/TopBar'
import { stubDesktop } from '../app/test-utils'
import { useImages } from '../features/images'
import { makeLoadedImage } from '../features/images/test-utils'
import { PageSetupPanel } from '../features/page-setup/PageSetupPanel'
import { ExportPanel } from '../features/render/components/ExportPanel'
import { exportPdf } from '../features/render/export/export-pdf'
import { drawTile, id, pageModel } from '../features/render/test-support/fixtures'
import { useSettings } from '../features/settings'
import { StudiesPanel } from '../features/studies/components/StudiesPanel'
import { initI18n, setAppLanguage } from '../shared/i18n'
import type { ImageId } from '../shared/model/image'
import { DEFAULT_LINES } from '../shared/model/lines'
import { DEFAULT_PAGE_SETUP } from '../shared/model/page-setup'
import { presetFromSettings } from '../shared/model/preset'
import { DEFAULT_STUDY } from '../shared/model/study'

vi.mock('../features/render/export/export-pdf', () => ({ exportPdf: vi.fn() }))

/** Frequent words of the English UI that no Italian string uses. */
const ENGLISH_WORDS = [
  'Add',
  'Apply',
  'Back',
  'Blur',
  'Cancel',
  'Change',
  'Close',
  'Copies',
  'Create',
  'Crop',
  'Dark',
  'Delete',
  'Download',
  'Export',
  'Height',
  'Image',
  'Images',
  'Language',
  'Light',
  'Lines',
  'Page',
  'Paper',
  'Photos',
  'Remove',
  'Rename',
  'Save',
  'Settings',
  'Size',
  'Studies',
  'Theme',
  'Values',
  'Width',
]

const ATTRIBUTES = [
  'aria-label',
  'aria-description',
  'aria-valuetext',
  'aria-roledescription',
  'title',
  'placeholder',
  'alt',
]

/** Every text and accessible-name attribute on the page, hidden text included. */
function pageText(): string {
  const parts = [document.body.textContent]
  for (const el of document.body.querySelectorAll('*')) {
    for (const name of ATTRIBUTES) {
      const value = el.getAttribute(name)
      if (value) parts.push(value)
    }
  }
  return parts.join('\n')
}

function englishWordsShown(): string[] {
  const text = pageText()
  return ENGLISH_WORDS.filter((word) => new RegExp(`\\b${word}\\b`, 'u').test(text))
}

beforeAll(async () => {
  await initI18n()
  expect(await setAppLanguage('it')).toBe('changed')
})
afterAll(async () => {
  await i18next.changeLanguage('en')
})
beforeEach(() => {
  localStorage.clear()
  useSettings.getState().reset()
  useSettings.getState().setUnit('mm')
  stubDesktop(true)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Italian: no English on a sample of screens', () => {
  it('the top bar', () => {
    render(<TopBar onExport={vi.fn()} exportDisabledReason={null} />)
    expect(screen.getByRole('button', { name: 'Esporta PDF' })).toBeVisible()
    expect(englishWordsShown()).toEqual([])
  })

  it('the Page panel', () => {
    render(<PageSetupPanel />)
    expect(screen.getByLabelText('Formato carta')).toHaveValue('A4')
    expect(englishWordsShown()).toEqual([])
  })

  it('the Studies panel', () => {
    const images = (['a', 'b'] as const).map((name) =>
      makeLoadedImage({ id: name as ImageId, name: `${name}.jpg`, study: DEFAULT_STUDY }),
    )
    useImages.setState({ images, selectedId: 'a' as ImageId, importing: 0 })
    render(<StudiesPanel imageId={'a' as ImageId} />)
    expect(screen.getByRole('button', { name: 'Applica a tutte le immagini' })).toBeVisible()
    expect(englishWordsShown()).toEqual([])
  })

  it('the Presets dialog with presets', async () => {
    for (const name of ['Ritratti A4', 'Paesaggi']) {
      const preset = presetFromSettings(name, {
        pageSetup: { ...DEFAULT_PAGE_SETUP, paper: 'Letter', bleed: { enabled: true, mm: 3 } },
        study: { ...DEFAULT_STUDY, versions: ['original', 'values'] },
        lines: { ...DEFAULT_LINES, thirds: true },
      })
      expect(useSettings.getState().savePreset(preset)).toBe('saved')
    }
    const user = userEvent.setup()
    render(<PresetsButton />)
    await user.click(screen.getByRole('button', { name: 'Preset' }))
    await screen.findByRole('dialog', { name: 'Preset' })
    expect(screen.getByRole('button', { name: 'Applica Paesaggi' })).toBeVisible()
    expect(englishWordsShown()).toEqual([])
  })

  it('the Export panel, before and after the PDF is made', async () => {
    vi.mocked(exportPdf).mockResolvedValue(new Blob(['%PDF']))
    URL.createObjectURL = vi.fn(() => 'blob:test')
    URL.revokeObjectURL = vi.fn()
    const pages = [
      pageModel([drawTile({ imageId: id('a') }), drawTile({ imageId: id('b') })]),
      pageModel([drawTile({ imageId: id('c') })], { index: 1 }),
    ]
    render(<ExportPanel pages={pages} paper="Letter" getSource={() => undefined} />)
    expect(screen.getByText('2 · Lettera verticale')).toBeVisible()
    expect(englishWordsShown()).toEqual([])
    await act(async () => {
      await userEvent.setup().click(screen.getByRole('button', { name: 'Crea PDF' }))
    })
    expect(await screen.findByRole('link', { name: 'Scarica PDF' })).toBeVisible()
    expect(englishWordsShown()).toEqual([])
  })
})

type Row = readonly [key: string, vars: Record<string, string>, forms: readonly string[]]

/** The text of each plural key at 0, 1, 2, 5 and 1,000,000 (CLDR: one, many, other). */
const COUNTS = [0, 1, 2, 5, 1_000_000] as const
const PLURALS: readonly Row[] = [
  [
    'app:import.more',
    {},
    ['altre 0', '1 altra', 'altre 2', 'altre 5', 'altre 1.000.000'],
  ],
  [
    'export:summary.tilesValue',
    { tiles: '3' },
    [
      '3 da 0 immagini',
      '3 da 1 immagine',
      '3 da 2 immagini',
      '3 da 5 immagini',
      '3 da 1.000.000 di immagini',
    ],
  ],
  [
    'images:dropzone.importing',
    {},
    [
      'Aggiunta di 0 foto…',
      'Aggiunta di 1 foto…',
      'Aggiunta di 2 foto…',
      'Aggiunta di 5 foto…',
      'Aggiunta di 1.000.000 di foto…',
    ],
  ],
  [
    'images:list.count',
    {},
    ['0 immagini', '1 immagine', '2 immagini', '5 immagini', '1.000.000 di immagini'],
  ],
  [
    'images:list.removeAll.confirmBody',
    {},
    [
      'Rimuove tutte le 0 immagini da questa sessione. Le foto non sono salvate da nessuna parte, quindi non si possono recuperare.',
      'Rimuove 1 immagine da questa sessione. Le foto non sono salvate da nessuna parte, quindi non si possono recuperare.',
      'Rimuove tutte le 2 immagini da questa sessione. Le foto non sono salvate da nessuna parte, quindi non si possono recuperare.',
      'Rimuove tutte le 5 immagini da questa sessione. Le foto non sono salvate da nessuna parte, quindi non si possono recuperare.',
      'Rimuove tutte le 1.000.000 di immagini da questa sessione. Le foto non sono salvate da nessuna parte, quindi non si possono recuperare.',
    ],
  ],
  [
    'lines:applyAll.hint',
    {},
    [
      'Copia queste impostazioni delle linee su tutte le 0 immagini.',
      'Copia queste impostazioni delle linee su 1 immagine.',
      'Copia queste impostazioni delle linee su tutte le 2 immagini.',
      'Copia queste impostazioni delle linee su tutte le 5 immagini.',
      'Copia queste impostazioni delle linee su tutte le 1.000.000 di immagini.',
    ],
  ],
  [
    'lines:applyAll.done',
    {},
    [
      'Impostazioni delle linee copiate su 0 immagini.',
      'Impostazioni delle linee copiate su 1 immagine.',
      'Impostazioni delle linee copiate su 2 immagini.',
      'Impostazioni delle linee copiate su 5 immagini.',
      'Impostazioni delle linee copiate su 1.000.000 di immagini.',
    ],
  ],
  [
    'pageSetup:suggestion.text',
    { paper: 'A4' },
    [
      'A4 contiene comodamente 0 riferimenti per pagina.',
      'A4 contiene comodamente 1 riferimento per pagina.',
      'A4 contiene comodamente 2 riferimenti per pagina.',
      'A4 contiene comodamente 5 riferimenti per pagina.',
      'A4 contiene comodamente 1.000.000 di riferimenti per pagina.',
    ],
  ],
  [
    'presets:apply.confirmBody',
    {},
    [
      "Imposta la pagina, gli studi e le linee di tutte le 0 foto.",
      "Imposta la pagina, gli studi e le linee di 1 foto.",
      "Imposta la pagina, gli studi e le linee di tutte le 2 foto.",
      "Imposta la pagina, gli studi e le linee di tutte le 5 foto.",
      "Imposta la pagina, gli studi e le linee di tutte le 1.000.000 di foto.",
    ],
  ],
  [
    'presets:import.imported',
    {},
    [
      'Importati 0 preset.',
      'Importato 1 preset.',
      'Importati 2 preset.',
      'Importati 5 preset.',
      'Importati 1.000.000 di preset.',
    ],
  ],
  [
    'presets:import.renamed',
    { list: 'A → A (2)' },
    [
      '0 rinominati: A → A (2).',
      '1 rinominato: A → A (2).',
      '2 rinominati: A → A (2).',
      '5 rinominati: A → A (2).',
      '1.000.000 rinominati: A → A (2).',
    ],
  ],
  [
    'presets:import.skipped',
    {},
    [
      '0 ignorati perché non validi.',
      '1 ignorato perché non valido.',
      '2 ignorati perché non validi.',
      '5 ignorati perché non validi.',
      '1.000.000 ignorati perché non validi.',
    ],
  ],
  [
    'presets:import.full',
    { max: '50' },
    [
      '0 non aggiunti: questo dispositivo conserva al massimo 50 preset.',
      '1 non aggiunto: questo dispositivo conserva al massimo 50 preset.',
      '2 non aggiunti: questo dispositivo conserva al massimo 50 preset.',
      '5 non aggiunti: questo dispositivo conserva al massimo 50 preset.',
      '1.000.000 non aggiunti: questo dispositivo conserva al massimo 50 preset.',
    ],
  ],
  [
    'presets:import.adjusted',
    {},
    [
      '0 preset avevano valori fuori intervallo, che sono stati corretti.',
      '1 preset aveva un valore fuori intervallo, che è stato corretto.',
      '2 preset avevano valori fuori intervallo, che sono stati corretti.',
      '5 preset avevano valori fuori intervallo, che sono stati corretti.',
      '1.000.000 di preset avevano valori fuori intervallo, che sono stati corretti.',
    ],
  ],
  [
    'studies:values.countText',
    {},
    ['0 valori', '1 valore', '2 valori', '5 valori', '1.000.000 di valori'],
  ],
  [
    'studies:applyAll.hint',
    {},
    [
      'Copia queste impostazioni degli studi su tutte le 0 immagini.',
      'Copia queste impostazioni degli studi su 1 immagine.',
      'Copia queste impostazioni degli studi su tutte le 2 immagini.',
      'Copia queste impostazioni degli studi su tutte le 5 immagini.',
      'Copia queste impostazioni degli studi su tutte le 1.000.000 di immagini.',
    ],
  ],
  [
    'studies:applyAll.done',
    {},
    [
      'Impostazioni degli studi copiate su 0 immagini.',
      'Impostazioni degli studi copiate su 1 immagine.',
      'Impostazioni degli studi copiate su 2 immagini.',
      'Impostazioni degli studi copiate su 5 immagini.',
      'Impostazioni degli studi copiate su 1.000.000 di immagini.',
    ],
  ],
]

describe('Italian plural forms', () => {
  it('the table covers every plural key of the English locale', () => {
    const english = i18next.getDataByLanguage('en') ?? {}
    const bases = new Set<string>()
    for (const [ns, bundle] of Object.entries(english)) {
      const walk = (node: unknown, prefix: string) => {
        if (typeof node !== 'object' || node === null) return
        for (const [key, child] of Object.entries(node)) {
          const path = prefix ? `${prefix}.${key}` : key
          const plural = /^(.*)_(zero|one|many|other)$/.exec(path)
          if (plural && typeof child === 'string') bases.add(`${ns}:${plural[1] ?? ''}`)
          else walk(child, path)
        }
      }
      walk(bundle, '')
    }
    expect(PLURALS.map(([key]) => key).sort()).toEqual([...bases].sort())
  })

  it.each(PLURALS)('%s', (key, vars, forms) => {
    expect(COUNTS.map((count) => i18next.t(key, { ...vars, count, lng: 'it' }))).toEqual(forms)
  })
})
