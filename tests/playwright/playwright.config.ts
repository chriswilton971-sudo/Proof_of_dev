import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for UI testing ProofOfDev contract interface
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.ui.test.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html", { outputFolder: "tests/playwright/playwright-report" }],
    ["list"],
  ],
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices.chromium },
    },
    {
      name: "firefox",
      use: { ...devices.firefox },
    },
    {
      name: "webkit",
      use: { ...devices.webkit },
    },
  ],

  webServer: {
    command: "python -m http.server 3000",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
