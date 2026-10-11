export { PSEUDO_LANGUAGE } from './languages.ts'

const PLAIN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
const ACCENTED = Array.from('áƀçďéƒĝĥíĵķĺɱñóƥʠŕšţúʋŵẋýžÁƁÇĎÉƑĜĤÍĴĶĹṀÑÓƤǪŔŠŢÚṼŴẊÝŽ')
const LOOK_ALIKE = new Map(Array.from(PLAIN).map((c, i) => [c, ACCENTED[i] ?? c]))
const FILLER = Array.from(' ĺóŕéɱ íƥšúɱ ďóĺóŕ šíţ áɱéţ çóñšéçţéţúŕ áďíƥíšçíñĝ éĺíţ')
// i18next interpolation and nesting, and <Trans> tags (numbered, named or self-closing).
const PLACEHOLDER = /(\{\{[^}]*\}\}|\$t\([^)]*\)|<\/?[A-Za-z0-9]+\s*\/?>)/

function expansion(length: number): number {
  if (length <= 10) return 2
  if (length <= 20) return 1.8
  return 1.4
}

function padding(count: number): string {
  let out = ''
  for (let i = 0; i < count; i++) out += FILLER[i % FILLER.length] ?? ''
  return out.endsWith(' ') ? `${out.slice(0, -1)}${FILLER[1] ?? ''}` : out
}

/** M6-R14: accented, padded and bracketed, with variables, tags and nesting left as they are. */
export function pseudoLocalize(text: string): string {
  if (text === '') return ''
  const parts = text.split(PLACEHOLDER)
  let length = 0
  const out = parts.map((part, i) => {
    if (i % 2 === 1) return part
    const chars = Array.from(part)
    length += chars.length
    return chars.map((c) => LOOK_ALIKE.get(c) ?? c).join('')
  })
  const pad = Math.ceil(length * expansion(length)) - length
  return `⟦${out.join('')}${padding(pad)}⟧`
}

function localizeTree(value: unknown): unknown {
  if (typeof value === 'string') return pseudoLocalize(value)
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, localizeTree(v)]))
}

/** The pseudo-locale's resources: every English namespace and key, each string pseudo-localised. */
export function pseudoResources(
  en: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(en).map(([ns, tree]) => [ns, localizeTree(tree) as Record<string, unknown>]),
  )
}
