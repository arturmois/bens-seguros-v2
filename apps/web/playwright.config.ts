import { defineConfig, devices } from '@playwright/test'

// E2E against a running stack: `pnpm dev` + docker compose (default), or the Caddy stack over
// HTTPS (E2E_BASE_URL=https://localhost, feature `staging`). Nothing is started from here.
export default defineConfig({
  testDir: 'e2e',
  // One browser at a time: every test signs up and signs in from the same client address.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    ignoreHTTPSErrors: true,
    locale: 'pt-BR',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
