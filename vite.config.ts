import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Served from https://omarcocarvalho.github.io/artistica/ (GitHub Pages project site).
export default defineConfig({
  base: '/artistica/',
  plugins: [react(), tailwindcss()],
  // Workers are bundled as ES modules: new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' }).
  worker: { format: 'es' },
  build: {
    rolldownOptions: {
      input: {
        landing: fileURLToPath(new URL('./index.html', import.meta.url)),
        app: fileURLToPath(new URL('./app/index.html', import.meta.url)),
      },
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      // The gate covers the pure core modules (owner P3). Vitest 5 reports every file matching
      // `include` (0% if untested) and exits 0 when a glob matches nothing.
      include: [
        'src/features/layout/**',
        'src/features/render/**',
        'src/features/studies/**',
        'src/shared/colour/**',
      ],
      exclude: ['**/*.test.*', '**/*.worker.ts', '**/components/**', '**/test-support/**'],
      reporter: ['text', 'html'],
      thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'landing/**/*.test.ts', 'scripts/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'happy-dom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['src/test/setup-dom.ts'],
        },
      },
    ],
  },
})
