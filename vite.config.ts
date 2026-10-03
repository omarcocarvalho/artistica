import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Served from https://omarcocarvalho.github.io/artistica/ (GitHub Pages project site).
export default defineConfig({
  base: '/artistica/',
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      input: {
        landing: fileURLToPath(new URL('./index.html', import.meta.url)),
        app: fileURLToPath(new URL('./app/index.html', import.meta.url)),
      },
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'landing/**/*.test.ts'],
    environment: 'node',
  },
})
