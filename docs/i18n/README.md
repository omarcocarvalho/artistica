# Translations

Artistica ships in seven languages: English (`en`, the source), Portuguese (Brazil) (`pt-BR`), Spanish (`es`, neutral Latin American), Italian (`it`), Japanese (`ja`), Korean (`ko`) and Chinese (Simplified) (`zh-CN`). The codes are the ones in `src/shared/i18n/languages.ts`, used unchanged for folders, URLs, `<html lang>` and settings.

## How the translations are made

Claude writes the translations (spec R9), one language at a time, from the English text. No translation service or machine-translation API is called: the text is written in the pull request, like code. Every translation follows the four files in this folder:

| File | What it holds |
|---|---|
| [style-guide.md](style-guide.md) | how each language sounds: register, punctuation, numbers, capitals, key names, length |
| [glossary.md](glossary.md) | one translation per term in every language, and what is never translated |
| [context.md](context.md) | where each string appears, what kind of control it is, and how much room it has |
| [privacy-claims.md](privacy-claims.md) | every sentence that makes a privacy promise, the test that proves it, and how to translate it without changing its strength |

A language is reviewed before it merges by a second agent working in that language: it reads every screen, back-translates a sample of strings and every privacy claim into English, and lists disagreements. A disagreement about a term is settled against the glossary, and the glossary changes in the same pull request when the term changes.

## The files a language owns

| File | What it is |
|---|---|
| `src/locales/<code>/*.json` | the app, one file per namespace, the same keys as `src/locales/en/` |
| `landing/locales/<code>.json` | the landing page at `/artistica/<code>/`, the same keys as `landing/locales/en.json` |
| `src/locales/translated-from.json` | per language and key, a short hash of the English text the translation was made from |

## The check and the stamps

`corepack pnpm i18n:check` compares every language with English and fails when a key is missing or extra, a value is empty, the `{{variables}}` or `<0>…</0>` tags differ from English, a plural key lacks a form the language needs (or has one it doesn't use), or a translation is stale. It warns, without failing, when a value is the same as the English one and the key is not on its reviewed list (`PDF`, `DPI`, `A4` and the like).

A translation is stale when the English text changed after it was translated. The check knows because `src/locales/translated-from.json` records the hash of the English each translation came from. After translating or correcting a key, stamp it:

```bash
corepack pnpm i18n:stamp <code> [keys…]   # e.g. corepack pnpm i18n:stamp ja studies:blur.hint
corepack pnpm i18n:check
```

Stamping without keys stamps every key of that language, so only do that after reading the whole language against the current English.

## Proposing a correction

Native speakers are welcome to correct anything (spec R9, owner Q13). Either:

- **open an issue** on [github.com/omarcocarvalho/artistica](https://github.com/omarcocarvalho/artistica/issues) with the language, the text as it reads now (a screenshot helps), and what it should say; or
- **open a pull request** that edits `src/locales/<code>/*.json` or `landing/locales/<code>.json`, re-stamps the keys you changed (`corepack pnpm i18n:stamp <code> <keys…>`), and passes `corepack pnpm i18n:check`. If you change a term, change it everywhere it appears and update [glossary.md](glossary.md) in the same pull request.

A correction to a privacy sentence must keep its meaning exactly; [privacy-claims.md](privacy-claims.md) says what each one may and may not say.

The English text is the source. A problem in the English is fixed in English first, and then in every language in the same pull request.
