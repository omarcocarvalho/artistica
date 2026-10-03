import js from '@eslint/js'
import prettier from 'eslint-config-prettier/flat'
import i18next from 'eslint-plugin-i18next'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'playwright-report', 'test-results', 'blob-report']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['vite.config.ts', 'playwright.config.ts', 'e2e/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // Literal strings in JSX (text and attributes such as aria-label, title, placeholder) must go
    // through i18n. Tests, e2e, landing and index.html are exempt.
    files: ['src/**/*.tsx'],
    ignores: ['**/*.test.tsx'],
    ...i18next.configs['flat/recommended'],
    rules: { 'i18next/no-literal-string': ['error', { mode: 'jsx-only' }] },
  },
  prettier,
])
