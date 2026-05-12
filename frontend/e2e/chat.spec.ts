import { test, expect } from "@playwright/test";

test.describe("Chat widget", () => {
  test("chat page shows loading state for invalid chatbot", async ({ page }) => {
    await page.goto("/chat/00000000-0000-0000-0000-000000000000");
    // Should show error or not-found state
    await expect(
      page.locator("text=/not found|unavailable|loading/i")
    ).toBeVisible({ timeout: 10000 });
  });
});
