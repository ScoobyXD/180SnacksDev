import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './generated',
  testMatch: '*.spec.ts',
  timeout: 120_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    acceptDownloads: true,
    launchOptions: {
      slowMo: 80,
      downloadsPath: 'artifacts/downloads'
    }
  }
});
