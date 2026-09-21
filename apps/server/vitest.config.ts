import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.spec.{ts,tsx}', 'test/**/*.spec.ts'],
    environment: 'node',
    globalSetup: ['test/setup-db.ts'],
    // pg-boss and the first migration of a worker schema take a few seconds.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
