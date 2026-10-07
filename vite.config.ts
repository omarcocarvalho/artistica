import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

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
        'src/shared/model/study.ts',
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
          exclude: [...configDefaults.exclude, '**/perf.test.ts'],
        },
      },
      {
        // Timing tests, one file at a time. `test:coverage` skips this project, because
        // instrumentation slows the measured loops; CI runs it uninstrumented with `test:perf`.
        extends: true,
        test: {
          name: 'perf',
          environment: 'node',
          fileParallelism: false,
          include: ['src/**/perf.test.ts'],
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
