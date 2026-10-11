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
import landing from '../../landing/locales/es.json'

vi.mock('../features/render/export/export-pdf', () => ({ exportPdf: vi.fn() }))

/** Frequent words of the English UI; none of them is also a Spanish word. */
const ENGLISH_WORDS = [
  'the',
  'and',
  'your',
  'with',
  'from',
  'photo',
  'photos',
  'image',
  'images',
  'page',
  'pages',
  'paper',
  'add',
  'remove',
  'export',
  'apply',
  'delete',
  'cancel',
  'close',
  'save',
  'settings',
  'size',
  'crop',
  'marks',
  'bleed',
  'blur',
  'values',
  'lines',
  'theme',
  'download',
]

const ATTRIBUTES = [
  'aria-label',
  'aria-description',
  'aria-valuetext',
  'title',
  'placeholder',
  'alt',
]

/** Every text a person can see or hear in the document, one text node or attribute at a time. */
function textsOnScreen(): string[] {
  const parts: string[] = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) parts.push(walker.currentNode.textContent ?? '')
  for (const el of document.body.querySelectorAll('*'))
    for (const name of ATTRIBUTES) parts.push(el.getAttribute(name) ?? '')
  return parts.map((p) => p.trim()).filter(Boolean)
}

function wordsOnScreen(): string[] {
  return textsOnScreen()
    .join(' ')
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean)
}

type Tree = Readonly<Record<string, unknown>>
const flatten = (tree: Tree, prefix: string): [string, string][] =>
  Object.entries(tree).flatMap(([k, v]) =>
    typeof v === 'string'
      ? [[`${prefix}${k}`, v] as [string, string]]
      : flatten(v as Tree, `${prefix}${k}.`),
  )
const messages = (files: Record<string, Tree>): Map<string, string> =>
  new Map(
    Object.entries(files).flatMap(([path, tree]) =>
      flatten(tree, `${/([^/]+)\.json$/.exec(path)?.[1] ?? ''}:`),
    ),
  )
const EN = messages(import.meta.glob<Tree>('./en/*.json', { eager: true, import: 'default' }))
/** Words Spanish keeps from English: the product name, formats and glossary terms. */
const KEPT = /\b(Artistica|Auto|Original|Sepia|notan|DPI|px|mm|OK)\b|\{\{[^}]+\}\}/g
const pattern = (template: string): RegExp =>
  new RegExp(
    `^${template
      .split(/\{\{[^}]+\}\}/)
      .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[\\s\\S]+?')}$`,
  )
const ENGLISH_MESSAGES = [...EN]
  .filter(([, en]) => !en.includes('<') && /\p{L}/u.test(en.replace(KEPT, '')))
  .map(([key, en]) => [key, pattern(en)] as const)

function englishOnScreen(): string[] {
  const words = new Set(wordsOnScreen())
  const texts = textsOnScreen()
  const messages = ENGLISH_MESSAGES.filter(([, p]) => texts.some((t) => p.test(t)))
  return [...ENGLISH_WORDS.filter((w) => words.has(w)), ...messages.map(([key]) => key)]
}

beforeAll(async () => {
  await initI18n()
  expect(await setAppLanguage('es')).toBe('changed')
})
afterAll(async () => {
  await i18next.changeLanguage('en')
})
beforeEach(() => {
  stubDesktop(true)
  localStorage.clear()
  useSettings.getState().reset()
  useSettings.getState().setUnit('mm')
  useImages.setState({
    images: [
      makeLoadedImage({ id: 'a' as ImageId, name: 'retrato.jpg', study: DEFAULT_STUDY }),
      makeLoadedImage({ id: 'b' as ImageId, name: 'paisaje.jpg', study: DEFAULT_STUDY }),
    ],
    selectedId: 'a' as ImageId,
    importing: 0,
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('es: sample screens have no English', () => {
  it('the top bar', () => {
    render(<TopBar onExport={vi.fn()} exportDisabledReason={null} />)
    expect(screen.getByRole('button', { name: 'Exportar PDF' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Idioma' })).toHaveValue('es')
    expect(screen.getByText('Fotos solo en tu dispositivo')).toBeInTheDocument()
    expect(englishOnScreen()).toEqual([])
  })

  it('the page setup panel', () => {
    render(<PageSetupPanel />)
    expect(screen.getByLabelText('Tamaño del papel')).toHaveValue('A4')
    expect(screen.getByRole('switch', { name: 'Marcas de corte' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Sangrado' })).not.toBeChecked()
    expect(englishOnScreen()).toEqual([])
  })

  it('the studies panel', () => {
    render(<StudiesPanel imageId={'a' as ImageId} />)
    expect(screen.getByText('retrato.jpg').tagName).toBe('STRONG')
    expect(screen.getByRole('button', { name: 'Aplicar a todas las imágenes' })).toBeVisible()
    expect(englishOnScreen()).toEqual([])
  })

  it('the presets dialog, with presets', async () => {
    for (const [name, paper] of [
      ['Carta con sangrado', 'Letter'],
      ['Retratos A4', 'A4'],
    ] as const) {
      const preset = presetFromSettings(name, {
        pageSetup: { ...DEFAULT_PAGE_SETUP, paper, bleed: { enabled: true, mm: 3 } },
        study: { ...DEFAULT_STUDY, versions: ['original', 'blurValues'] },
        lines: { ...DEFAULT_LINES, thirds: true, spiral: { on: true, corner: 'topLeft' } },
      })
      expect(useSettings.getState().savePreset(preset)).toBe('saved')
    }
    const user = userEvent.setup()
    render(<PresetsButton />)
    await user.click(screen.getByRole('button', { name: 'Preajustes' }))
    const dialog = await screen.findByRole('dialog', { name: 'Preajustes' })
    expect(dialog).toHaveTextContent('Carta')
    expect(screen.getAllByRole('button', { name: /^Aplicar / })).toHaveLength(2)
    expect(englishOnScreen()).toEqual([])
  })

  it('the export panel, ready, in progress and done', async () => {
    let resolve: (blob: Blob) => void = () => undefined
    vi.mocked(exportPdf).mockImplementation(
      () =>
        new Promise<Blob>((res) => {
          resolve = res
        }),
    )
    URL.createObjectURL = vi.fn(() => 'blob:test')
    URL.revokeObjectURL = vi.fn()
    const pages = [
      pageModel([drawTile({ imageId: id('a') }), drawTile({ imageId: id('b') })]),
      pageModel([drawTile({ imageId: id('c') })], { index: 1 }),
    ]
    render(<ExportPanel pages={pages} paper="Letter" getSource={() => undefined} />)
    expect(screen.getByText('2 · Carta vertical')).toBeInTheDocument()
    expect(screen.getByText('3 a partir de 3 imágenes')).toBeInTheDocument()
    expect(englishOnScreen()).toEqual([])

    await userEvent.setup().click(screen.getByRole('button', { name: 'Crear PDF' }))
    expect(screen.getByText('Mantén esta pestaña abierta.', { exact: false })).toBeInTheDocument()
    expect(englishOnScreen()).toEqual([])
    await act(async () => {
      resolve(new Blob(['%PDF']))
      await Promise.resolve()
    })
    expect(screen.getByRole('link', { name: 'Descargar PDF' })).toBeInTheDocument()
    expect(screen.getByText('Imprime al 100 %')).toBeInTheDocument()
    expect(englishOnScreen()).toEqual([])
  })
})

describe('es: plural forms', () => {
  // CLDR es: 1 is "one", 1,000,000 is "many" (with "de"), the rest "other" (0 included).
  const COUNTS = [0, 1, 2, 5, 1_000_000] as const
  const TABLE: readonly [key: string, vars: Record<string, unknown>, forms: readonly string[]][] = [
    [
      'images:list.count',
      {},
      ['0 imágenes', '1 imagen', '2 imágenes', '5 imágenes', '1.000.000 de imágenes'],
    ],
    [
      'images:dropzone.importing',
      {},
      [
        'Agregando 0 fotos…',
        'Agregando 1 foto…',
        'Agregando 2 fotos…',
        'Agregando 5 fotos…',
        'Agregando 1.000.000 de fotos…',
      ],
    ],
    [
      'images:list.removeAll.confirmBody',
      {},
      [
        'Esto quita las 0 imágenes de esta sesión. Las fotos no se guardan en ningún lugar, así que no se pueden recuperar.',
        'Esto quita 1 imagen de esta sesión. Las fotos no se guardan en ningún lugar, así que no se pueden recuperar.',
        'Esto quita las 2 imágenes de esta sesión. Las fotos no se guardan en ningún lugar, así que no se pueden recuperar.',
        'Esto quita las 5 imágenes de esta sesión. Las fotos no se guardan en ningún lugar, así que no se pueden recuperar.',
        'Esto quita las 1.000.000 de imágenes de esta sesión. Las fotos no se guardan en ningún lugar, así que no se pueden recuperar.',
      ],
    ],
    [
      'export:summary.tilesValue',
      { tiles: 7 },
      [
        '7 a partir de 0 imágenes',
        '7 a partir de 1 imagen',
        '7 a partir de 2 imágenes',
        '7 a partir de 5 imágenes',
        '7 a partir de 1.000.000 de imágenes',
      ],
    ],
    [
      'studies:values.countText',
      {},
      ['0 valores', '1 valor', '2 valores', '5 valores', '1.000.000 de valores'],
    ],
    [
      'presets:import.imported',
      {},
      [
        'Se importaron 0 preajustes.',
        'Se importó 1 preajuste.',
        'Se importaron 2 preajustes.',
        'Se importaron 5 preajustes.',
        'Se importaron 1.000.000 de preajustes.',
      ],
    ],
    [
      'pageSetup:suggestion.text',
      { paper: 'A4' },
      [
        'En A4 caben cómodamente 0 referencias por página.',
        'En A4 cabe cómodamente 1 referencia por página.',
        'En A4 caben cómodamente 2 referencias por página.',
        'En A4 caben cómodamente 5 referencias por página.',
        'En A4 caben cómodamente 1.000.000 de referencias por página.',
      ],
    ],
    ['app:import.more', {}, ['0 más', '1 más', '2 más', '5 más', '1.000.000 más']],
    [
      'presets:import.renamed',
      { list: 'A → A (2)' },
      [
        'Se cambió el nombre de 0 preajustes: A → A (2).',
        'Se cambió el nombre de 1 preajuste: A → A (2).',
        'Se cambió el nombre de 2 preajustes: A → A (2).',
        'Se cambió el nombre de 5 preajustes: A → A (2).',
        'Se cambió el nombre de 1.000.000 de preajustes: A → A (2).',
      ],
    ],
  ]

  it.each(TABLE)('%s', (key, vars, forms) => {
    expect(COUNTS.map((count) => i18next.t(key, { ...vars, count }))).toEqual(forms)
  })
})

describe('es: reviewed wording', () => {
  it.each<[string, Record<string, unknown>, string]>([
    ['export:summary.qualityValue', {}, '300 DPI, sin ampliar'],
    [
      'images:editSheet.dpi.autoOk',
      {},
      'El modo automático nunca imprime más grande de lo que permiten 300 DPI.',
    ],
    [
      'app:topBar.exportError',
      {},
      'No se pudo calcular el diseño. Cambia la configuración o vuelve a cargar la página.',
    ],
    [
      'app:notices.layoutFailed',
      {},
      'No se pudo calcular el diseño. Cambia la configuración e inténtalo de nuevo.',
    ],
    ['images:dropzone.cancelLabel', {}, 'Cancelar y dejar de agregar fotos'],
  ])('%s', (key, vars, expected) => {
    expect(i18next.t(key, vars)).toBe(expected)
  })

  it('the landing page says everything runs in the browser, as strongly as the English', () => {
    expect(landing.privacy.claims.inBrowser).toBe(
      'Todo se ejecuta en tu navegador. No se sube nada.',
    )
    expect(landing.privacy.claims.faqUploaded).toMatch(/^No\. Todo se ejecuta en tu navegador\. /)
    expect(landing.structured.description).toMatch(/ Se ejecuta por completo en tu navegador\.$/)
    expect(JSON.stringify(landing)).not.toMatch(/funciona (por completo )?en tu navegador/i)
  })

  it('the offline question names the app', () => {
    expect(landing.faq.offline.q).toBe('¿Puedo usar la app sin conexión?')
  })
})
