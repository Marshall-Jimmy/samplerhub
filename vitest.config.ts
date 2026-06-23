import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    root: __dirname,
    include: ['test/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: ['test/e2e/**/*.spec.ts'],
    passWithNoTests: true,
    testTimeout: 1000 * 29,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}', 'shared/**/*.{ts,tsx}'],
      exclude: [
        'src/type/**',
        'src/types/**',
        'src/vite-env.d.ts',
        'src/demos/**',
        'src/i18n/locales/**',
        'src/**/*.module.css',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './shared'),
      '@main': path.resolve(__dirname, './electron/main'),
      '@preload': path.resolve(__dirname, './electron/preload'),
    },
  },
})
