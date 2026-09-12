import { defineConfig } from 'playwright/test';

export default defineConfig({
    testDir: './tests',
    timeout: 60_000,
    retries: 0,
    use: {
        headless: true,
        viewport: { width: 1200, height: 800 },
        trace: 'on-first-retry',
    },
    projects: [
        { name: 'chromium', use: { browserName: 'chromium' } },
    ],
});
