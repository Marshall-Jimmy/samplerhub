import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    root: __dirname,
    include: ['test/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: ['test/e2e/**/*.spec.ts'],
    passWithNoTests: true,
    testTimeout: 1000 * 29,
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
