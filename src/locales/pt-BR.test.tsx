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
    expect(screen.getByText('As fotos ficam neste dispositivo')).toBeInTheDocument()
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
      '3 de 1 imagem',
      '3 de 2 imagens',
      '3 de 1.000.000 de imagens',
    ])
  })
})
