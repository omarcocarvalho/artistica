import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PresetsButton } from '../app/components/PresetsButton'
import { TopBar } from '../app/components/TopBar'
import { stubDesktop } from '../app/test-utils'
import { useImages } from '../features/images'
import { makeLoadedImage } from '../features/images/test-utils'
import { PageSetupPanel } from '../features/page-setup/PageSetupPanel'
import { ExportPanel } from '../features/render/components/ExportPanel'
import { drawTile, id, pageModel } from '../features/render/test-support/fixtures'
import { useSettings } from '../features/settings'
import { StudiesPanel } from '../features/studies/components/StudiesPanel'
import { initI18n, setAppLanguage } from '../shared/i18n'
import type { ImageId } from '../shared/model/image'
import { DEFAULT_LINES } from '../shared/model/lines'
import { DEFAULT_PAGE_SETUP } from '../shared/model/page-setup'
import { presetFromSettings } from '../shared/model/preset'
import { DEFAULT_STUDY } from '../shared/model/study'
import landing from '../../landing/locales/pt-BR.json'

const files = import.meta.glob<Record<string, unknown>>('./pt-BR/*.json', {
  eager: true,
  import: 'default',
})

/** Every pt-BR string, app and landing, as `ns:key` → value. */
function allStrings(): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (prefix: string, node: unknown): void => {
    if (typeof node === 'string') out[prefix] = node
    else if (node && typeof node === 'object')
      for (const [k, v] of Object.entries(node))
        walk(prefix.endsWith(':') ? prefix + k : `${prefix}.${k}`, v)
  }
  for (const [path, tree] of Object.entries(files))
    walk(`${path.replace(/^.*\/(.+)\.json$/, '$1')}:`, tree)
  walk('landing:', landing)
  return out
}

// Frequent English UI words that never belong in the Portuguese text.
const ENGLISH = [
  'Add',
  'Apply',
  'Blur',
  'Bleed',
  'Cancel',
  'Change',
  'Close',
  'Copies',
  'Create',
  'Crop',
  'Cutting',
  'Delete',
  'Download',
  'Export',
  'Gutter',
  'Images',
  'Import',
  'Landscape',
  'Lines',
  'Page',
  'Paper',
  'Photos',
  'Portrait',
  'Remove',
  'Rename',
  'Save',
  'Settings',
  'Size',
  'Spacing',
  'Studies',
  'Theme',
  'Values',
]

function shownText(root: HTMLElement): string {
  const names = Array.from(root.querySelectorAll('[aria-label],[title],[placeholder]')).flatMap(
    (el) => ['aria-label', 'title', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
  )
  return [root.textContent, ...names].join('\n')
}

function englishWordsIn(text: string): string[] {
  return ENGLISH.filter((word) => new RegExp(`\\b${word}\\b`, 'i').test(text))
}

beforeAll(async () => {
  await initI18n()
  expect(await setAppLanguage('pt-BR')).toBe('changed')
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
    images: [makeLoadedImage({ id: 'a' as ImageId, name: 'retrato.jpg' })],
    selectedId: 'a' as ImageId,
    importing: 0,
  })
})

describe('the app in Portuguese (Brazil)', () => {
  it('the top bar has no English words and uses the glossary', () => {
    const { container } = render(<TopBar onExport={vi.fn()} exportDisabledReason={null} />)
    expect(englishWordsIn(shownText(container))).toEqual([])
    expect(screen.getByRole('button', { name: 'Exportar PDF' })).toBeInTheDocument()
    expect(screen.getByText('Fotos ficam neste dispositivo')).toBeInTheDocument()
  })

  it('the Page panel has no English words and uses the glossary', () => {
    const { container } = render(<PageSetupPanel />)
    expect(englishWordsIn(shownText(container))).toEqual([])
    for (const term of ['Margem de segurança', 'Marcas de corte', 'Sangria', 'Espaçamento'])
      expect(screen.getAllByText(term).length).toBeGreaterThan(0)
  })

  it('the Studies panel has no English words and uses the glossary', () => {
    const { container } = render(<StudiesPanel imageId={'a' as ImageId} />)
    expect(englishWordsIn(shownText(container))).toEqual([])
    for (const term of ['Desfoque', 'Valores', 'Matiz'])
      expect(screen.getAllByText(term).length).toBeGreaterThan(0)
  })

  it('the Presets dialog with presets has no English words', async () => {
    const preset = presetFromSettings('Retratos A4', {
      pageSetup: { ...DEFAULT_PAGE_SETUP, paper: 'Letter', bleed: { enabled: true, mm: 3 } },
      study: { ...DEFAULT_STUDY, versions: ['original', 'values'] },
      lines: { ...DEFAULT_LINES, thirds: true },
    })
    expect(useSettings.getState().savePreset(preset)).toBe('saved')
    const user = userEvent.setup()
    render(<PresetsButton />)
    await user.click(screen.getByRole('button', { name: 'Presets' }))
    const dialog = await screen.findByRole('dialog', { name: 'Presets' })
    expect(englishWordsIn(shownText(dialog))).toEqual([])
    expect(screen.getByRole('button', { name: 'Aplicar Retratos A4' })).toBeInTheDocument()
  })

  it('the Export panel, ready, has no English words', () => {
    const pages = [pageModel([drawTile({ imageId: id('a') })])]
    const { container } = render(
      <ExportPanel pages={pages} paper="Letter" getSource={() => undefined} />,
    )
    expect(englishWordsIn(shownText(container))).toEqual([])
    expect(screen.getByRole('button', { name: 'Criar PDF' })).toBeInTheDocument()
    expect(screen.getByText('1 · Carta retrato')).toBeInTheDocument()
  })
})

describe('every Portuguese (Brazil) string', () => {
  it('has none of the frequent English words, key names aside', () => {
    const hits = Object.entries(allStrings())
      .map(
        ([key, value]) =>
          [
            key,
            englishWordsIn(value.replace(/\{\{[^}]*\}\}|<[^>]*>|Page (Up|Down)/g, '')).filter(
              // Also Portuguese: "remove" (remover) and the noun "download".
              (word) => word !== 'Remove' && word !== 'Download',
            ),
          ] as const,
      )
      .filter(([, words]) => words.length > 0)
    expect(hits).toEqual([])
  })

  it('never names the file picker with the privacy claims\' word for "uploaded"', () => {
    const strings = allStrings()
    const picker = [
      'images:dropzone.upload',
      'images:dropzone.uploadHero',
      'images:dropzone.url.uploadInstead',
      'images:dropzone.groupLabel',
      'landing:how.add.body',
      'errors:images.cors.message',
      'landing:faq.link.a',
    ]
    for (const key of picker) expect(strings[key], key).not.toMatch(/envi/i)
    expect(strings['landing:privacy.claims.inBrowser']).toMatch(/Nada é enviado/)
  })
})

describe('plural forms in Portuguese (Brazil)', () => {
  const t = (key: string, count: number) => i18next.getFixedT('pt-BR')(key, { count })

  it.each([
    ['images:list.count', 0, 'Nenhuma imagem'],
    ['images:list.count', 1, '1 imagem'],
    ['images:list.count', 2, '2 imagens'],
    ['images:list.count', 5, '5 imagens'],
    ['images:list.count', 1_000_000, '1.000.000 de imagens'],
    ['images:dropzone.importing', 1, 'Adicionando 1 foto…'],
    ['images:dropzone.importing', 2, 'Adicionando 2 fotos…'],
    ['images:dropzone.importing', 5, 'Adicionando 5 fotos…'],
    ['images:dropzone.importing', 1_000_000, 'Adicionando 1.000.000 de fotos…'],
    ['studies:values.countText', 2, '2 valores'],
    ['studies:values.countText', 5, '5 valores'],
    ['studies:values.countText', 1_000_000, '1.000.000 de valores'],
    ['presets:import.imported', 0, 'Nenhum preset importado.'],
    ['presets:import.imported', 1, '1 preset importado.'],
    ['presets:import.imported', 2, '2 presets importados.'],
    ['presets:import.imported', 1_000_000, '1.000.000 de presets importados.'],
    ['presets:import.skipped', 1, '1 foi ignorado: não era válido.'],
    ['presets:import.skipped', 5, '5 foram ignorados: não eram válidos.'],
    ['app:import.more', 1, 'mais 1'],
    ['app:import.more', 1_000_000, 'mais 1.000.000'],
    ['lines:applyAll.done', 1, 'Configurações de linhas copiadas para 1 imagem.'],
    ['lines:applyAll.done', 2, 'Configurações de linhas copiadas para 2 imagens.'],
    [
      'lines:applyAll.done',
      1_000_000,
      'Configurações de linhas copiadas para 1.000.000 de imagens.',
    ],
    ['lines:applyAll.hint', 2, 'Copia estas configurações de linhas para todas as 2 imagens.'],
    [
      'lines:applyAll.hint',
      1_000_000,
      'Copia estas configurações de linhas para todas as 1.000.000 de imagens.',
    ],
    [
      'studies:applyAll.hint',
      1_000_000,
      'Copia estas configurações de estudo para todas as 1.000.000 de imagens.',
    ],
    [
      'presets:apply.confirmBody',
      1_000_000,
      'Isso define a configuração da página e os estudos e as linhas de todas as 1.000.000 de fotos.',
    ],
    [
      'images:list.removeAll.confirmBody',
      2,
      'Isso remove todas as 2 imagens desta sessão. As fotos não ficam salvas em lugar nenhum, então não podem ser recuperadas.',
    ],
    [
      'images:list.removeAll.confirmBody',
      1_000_000,
      'Isso remove todas as 1.000.000 de imagens desta sessão. As fotos não ficam salvas em lugar nenhum, então não podem ser recuperadas.',
    ],
  ])('%s with %d', (key, count, expected) => {
    expect(t(key, count)).toBe(expected)
  })

  it('names the tiles of one and of many images', () => {
    const tiles = (count: number) =>
      i18next.getFixedT('pt-BR')('export:summary.tilesValue', { count, tiles: 3 })
    expect([tiles(1), tiles(2), tiles(1_000_000)]).toEqual([
      '3 a partir de 1 imagem',
      '3 a partir de 2 imagens',
      '3 a partir de 1.000.000 de imagens',
    ])
  })
})

describe('reviewed wording in Portuguese (Brazil)', () => {
  it.each<[string, Record<string, unknown>, string]>([
    ['app:theme.auto', {}, 'Auto'],
    ['common:theme.auto', {}, 'Auto'],
    ['app:theme.changeLabel', { current: 'Auto' }, 'Mudar tema: Auto'],
    [
      'pageSetup:orientation.autoPicked',
      { orientation: 'retrato' },
      'O modo automático escolheu retrato: menos páginas.',
    ],
    [
      'images:editSheet.size.autoHint',
      { size: '60 mm' },
      'O modo automático escolhe um tamanho entre 60 mm e o limite de 300 DPI.',
    ],
    ['images:editSheet.dpi.autoOk', {}, 'O modo automático nunca imprime acima de 300 DPI.'],
    [
      'images:editSheet.dpi.lowAuto',
      { size: '2,36 pol.', dpi: 20 },
      'No menor tamanho confortável (2,36 pol.), a imagem é impressa a 20 DPI e pode ficar sem nitidez.',
    ],
  ])('%s', (key, vars, expected) => {
    expect(i18next.getFixedT('pt-BR')(key, vars)).toBe(expected)
  })

  it('the theme words fit the 8-character theme button', () => {
    const strings = allStrings()
    for (const key of ['app:theme.auto', 'app:theme.light', 'app:theme.dark'])
      expect(strings[key]?.length ?? 99, key).toBeLessThanOrEqual(8)
    expect(landing.theme.auto).toBe('Auto')
    expect(landing.theme.changeAuto).toBe('Mudar tema: Auto')
  })

  it('calls a smartphone "celular"', () => {
    expect(landing.features.phone.title).toBe('Funciona no seu celular')
    expect(landing.faq.phone.q).toBe('Funciona no meu celular?')
    expect(Object.entries(allStrings()).filter(([, v]) => /telefone/i.test(v))).toEqual([])
  })
})
