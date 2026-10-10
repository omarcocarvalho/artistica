import type { LanguageCode } from './languages'

type NamespaceResources = Record<string, Record<string, unknown>>

// English is the fallback, so it is bundled and synchronous. The file name (without `.json`) is
// the namespace, so adding a namespace file never means editing this module.
const englishFiles = import.meta.glob<Record<string, unknown>>('../../locales/en/*.json', {
  eager: true,
  import: 'default',
})

/** Every other language: one loader per namespace file, split into a chunk per language (M6-R5). */
export const lazyLocaleFiles = import.meta.glob<Record<string, unknown>>(
  ['../../locales/*/*.json', '!../../locales/en/*.json'],
  { import: 'default' },
)

function buildEnglish(): Partial<Record<LanguageCode, NamespaceResources>> {
  const en: NamespaceResources = {}
  for (const [path, content] of Object.entries(englishFiles)) {
    const ns = /\/([^/]+)\.json$/.exec(path)?.[1]
    if (ns) en[ns] = content
  }
  return { en }
}

export const resources = buildEnglish()
