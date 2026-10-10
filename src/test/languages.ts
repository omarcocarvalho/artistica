import type { i18n as I18nInstance } from 'i18next'
import { initI18n, type LanguageCode } from '../shared/i18n'

type Bundles = Readonly<Record<string, Record<string, unknown>>>

/** Hand-written test strings, standing in for the real translations until they land. */
export const PT_BR: Bundles = {
  app: {
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
    paper: { dims: '{{w}} × {{h}} {{unit}}', width: 'Largura' },
    spacing: { safeAreaHint: 'Borda em branco na margem da página. Mín. {{min}}.' },
  },
  preview: {
    arrange: {
      blockName: '{{name}}, {{w}} × {{h}} {{unit}}, página {{page}}',
      sheetSummary: '{{w}} × {{h}} {{unit}}, página {{page}} de {{total}}',
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
