import type { i18n as I18nInstance } from 'i18next'
import { initI18n, type LanguageCode } from '../shared/i18n'

type Bundles = Readonly<Record<string, Record<string, unknown>>>

/** Hand-written pt-BR strings for the keys the formatting tests read. */
export const PT_BR: Bundles = {
  app: {
    theme: {
      changeLabel: 'Tema ({{current}}) — mudar',
      auto: 'Automático',
      light: 'Claro',
      dark: 'Escuro',
    },
    preview: {
      item: '{{name}}, {{w}} × {{h}} {{unit}}',
      itemVersion: '{{name}}, {{version}}, {{w}} × {{h}} {{unit}}',
    },
  },
  images: {
    list: {
      sizeFixed: 'Fixo {{size}}',
      count_one: '{{count, number}} imagem',
      count_many: '{{count, number}} de imagens',
      count_other: '{{count, number}} imagens',
    },
    editSheet: {
      size: {
        autoHint: 'O automático escolhe um tamanho entre {{size}} e o limite de 300 DPI.',
        followsHeight: 'A altura acompanha: {{value}} (mantém a proporção)',
      },
      dpi: {
        lowFixed: 'Abaixo de 300 DPI pode sair sem nitidez. Nítida até {{w}} × {{h}} {{unit}}.',
      },
    },
  },
  pageSetup: {
    paper: {
      dims: '{{w}} × {{h}} {{unit}}',
      width: 'Largura',
      size: 'Tamanho do papel',
      custom: 'Personalizado…',
      name: { letter: 'Carta', legal: 'Ofício', tabloid: 'Tabloide', custom: 'Personalizado' },
    },
    spacing: { safeAreaHint: 'Borda em branco na margem da página. Mín. {{min}}.' },
    suggestion: {
      text_one: '{{paper}} cabe {{count, number}} referência por página.',
      text_many: '{{paper}} cabe {{count, number}} de referências por página.',
      text_other: '{{paper}} cabe {{count, number}} referências por página.',
    },
  },
  preview: {
    arrange: {
      blockName: '{{name}}, {{w}} × {{h}} {{unit}}, página {{page}}',
      sheetSummary: '{{w}} × {{h}} {{unit}}, página {{page}} de {{total}}',
      placed:
        '{{name}}, {{w}} × {{h}} {{unit}}, página {{page}}, {{x}} {{unit}} da esquerda, {{y}} {{unit}} do topo.',
    },
  },
  studies: {
    blur: {
      valueText: '{{value}}',
      hint: 'Acompanha o tamanho da imagem, então {{value}} fica parecido em todas as fotos.',
    },
    values: { hueText: '{{value}}' },
  },
  lines: {
    thickness: { value: '{{value}} {{unit}}' },
    opacity: { value: '{{value}}' },
    guides: {
      size: 'Download único: {{size}}',
      progress: '{{loaded}} de {{total}}',
      progressSpoken: '{{loaded}} de {{total}} megabytes',
      detail: { value: '{{value}}' },
    },
  },
  presets: {
    summary: {
      custom: 'Personalizado {{w}} × {{h}} {{unit}}',
      bleed: 'sangria {{size}}',
      version: { blurred: 'desfocada {{value}}' },
    },
  },
}

/** Adds `bundles` for `lng` over the English ones (missing keys fall back to English) and switches to it. */
export async function switchLanguage(
  lng: LanguageCode,
  bundles: Bundles = {},
): Promise<I18nInstance> {
  const i18n = await initI18n()
  for (const [ns, strings] of Object.entries(bundles)) {
    i18n.addResourceBundle(lng, ns, strings, true, true)
  }
  await i18n.changeLanguage(lng)
  return i18n
}
