import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test("dashboard redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/dashboard");
    // Should redirect to login or show sign-in prompt
    await expect(page).toHaveURL(/login|signin|auth/i, { timeout: 10000 }).catch(async () => {
      // Some implementations show an error inline rather than redirecting
      await expect(page.locator("text=/sign in|log in|unauthorized/i")).toBeVisible({ timeout: 5000 });
    });
  });

  test("usage page redirects unauthenticated users", async ({ page }) => {
    await page.goto("/dashboard/usage");
    await expect(page).toHaveURL(/login|signin|auth/i, { timeout: 10000 }).catch(async () => {
      await expect(page.locator("text=/sign in|log in|unauthorized/i")).toBeVisible({ timeout: 5000 });
    });
  });
});
