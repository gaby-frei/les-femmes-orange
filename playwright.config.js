// Playwright config for Les Femmes Orange e2e tests.
// Boots the static server (server.js) and runs specs in tests/.
// Port is overridable via PORT (default 3000) — a foreign dev server squatting on
// 3000 would otherwise be silently "reused" and every spec would run against the
// wrong app (this actually happened, 2026-07-27). Run `PORT=3100 npx playwright test`
// when 3000 is taken.
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT) || 3000;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'node server.js',
    url: `http://127.0.0.1:${PORT}`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
