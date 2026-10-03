import type { LanguageCode } from './languages'

type NamespaceResources = Record<string, Record<string, unknown>>

// Every `src/locales/<lang>/*.json` is picked up automatically, so adding a namespace file never
// means editing this module. The file name (without `.json`) is the namespace.
const files = import.meta.glob<Record<string, unknown>>('../../locales/*/*.json', {
  eager: true,
  import: 'default',
})

function buildResources(): Partial<Record<LanguageCode, NamespaceResources>> {
  const out: Partial<Record<LanguageCode, NamespaceResources>> = {}
  for (const [path, content] of Object.entries(files)) {
    const match = /\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path)
    const lang = match?.[1] as LanguageCode | undefined
    const ns = match?.[2]
    if (!lang || !ns) continue
    ;(out[lang] ??= {})[ns] = content
  }
  return out
}

/** Only English has resources in M1. Adding a language = adding `src/locales/<lang>/*.json` (M6). */
export const resources = buildResources()
