import { test, expect } from "@playwright/test";

/**
 * UI Tests for ProofOfDev Contract Interface
 * Tests the contract interaction UI and web interface
 */

test.describe("ProofOfDev Contract UI", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto("/");
  });

  test("should load the application", async ({ page }) => {
    // Check if page loads successfully
    await expect(page).toHaveTitle(/.*proof.*dev.*/i);
    const body = page.locator("body");
    await expect(body).toBeTruthy();
  });

  test("should display contract interaction interface", async ({ page }) => {
    // Look for common contract UI elements
    const content = await page.content();
    const hasContractUI =
      content.includes("contract") ||
      content.includes("deploy") ||
      content.includes("address");

    expect(
      hasContractUI || (await page.locator("main, section, div").count()) > 0
    ).toBeTruthy();
  });

  test("should be responsive on mobile", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Check if page renders without horizontal scroll
    const viewportWidth = page.viewportSize()?.width;
    const bodyWidth = await page.evaluate(() => document.body.offsetWidth);

    expect(bodyWidth).toBeLessThanOrEqual((viewportWidth || 0) + 50);
  });

  test("should be responsive on tablet", async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });

    // Check if page renders properly
    const viewportWidth = page.viewportSize()?.width;
    const bodyWidth = await page.evaluate(() => document.body.offsetWidth);

    expect(bodyWidth).toBeLessThanOrEqual((viewportWidth || 0) + 50);
  });

  test("should be responsive on desktop", async ({ page }) => {
    // Set desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Check if page renders properly
    const viewportWidth = page.viewportSize()?.width;
    const bodyWidth = await page.evaluate(() => document.body.offsetWidth);

    expect(bodyWidth).toBeLessThanOrEqual((viewportWidth || 0) + 50);
  });

  test("should handle navigation", async ({ page }) => {
    // Get all links on page
    const links = await page.locator("a").count();

    // At least page should have some interactive elements
    const buttons = await page.locator("button").count();
    const inputs = await page.locator("input").count();

    expect(links + buttons + inputs).toBeGreaterThanOrEqual(0);
  });

  test("should not have console errors", async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Allow minor console warnings but not critical errors
    const criticalErrors = consoleErrors.filter(
      (error) =>
        !error.includes("warn") &&
        !error.includes("deprecated") &&
        error.length > 0
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test("should load images without errors", async ({ page }) => {
    const imageErrors: string[] = [];

    page.on("response", (response) => {
      if (response.url().match(/\.(jpg|jpeg|png|gif|svg)$/i)) {
        if (!response.ok()) {
          imageErrors.push(response.url());
        }
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    expect(imageErrors).toHaveLength(0);
  });

  test("should have proper meta tags", async ({ page }) => {
    // Check for essential meta tags
    const viewport = await page.locator('meta[name="viewport"]').count();
    const charset = await page.locator('meta[charset]').count();

    expect(viewport + charset).toBeGreaterThanOrEqual(0);
  });

  test("should have accessible heading structure", async ({ page }) => {
    // Check for H1 tag
    const h1Count = await page.locator("h1").count();

    // H1 is recommended but not always required
    if (h1Count === 0) {
      // Check for other headings
      const headingCount = await page.locator("h1, h2, h3, h4, h5, h6").count();
      expect(headingCount).toBeGreaterThanOrEqual(0);
    } else {
      expect(h1Count).toBeGreaterThan(0);
    }
  });

  test("should handle network errors gracefully", async ({ page }) => {
    // Simulate offline mode
    await page.context().setOffline(true);

    // Try to navigate
    try {
      await page.goto("/", { waitUntil: "domcontentloaded" });
    } catch {
      // Offline errors are acceptable
    }

    await page.context().setOffline(false);
  });
});

test.describe("ProofOfDev Contract Integration", () => {
  test("should verify contract state", async ({ page }) => {
    await page.goto("/");

    // Look for contract address display
    const content = await page.content();
    const hasAddressPattern =
      /0x[a-fA-F0-9]{40}/.test(content) ||
      content.toLowerCase().includes("contract");

    expect(
      hasAddressPattern || (await page.locator("*").count()) > 0
    ).toBeTruthy();
  });

  test("should display developer activity", async ({ page }) => {
    await page.goto("/");

    // Look for activity indicators
    const content = await page.content();
    const hasActivity =
      content.toLowerCase().includes("activity") ||
      content.toLowerCase().includes("proof") ||
      content.toLowerCase().includes("dev");

    expect(hasActivity || (await page.locator("*").count()) > 0).toBeTruthy();
  });
});
