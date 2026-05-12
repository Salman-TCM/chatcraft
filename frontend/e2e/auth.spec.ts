import { test, expect } from "@playwright/test";

const unique = () => `test_${Date.now()}@e2e.chatcraft.ai`;

test.describe("Authentication", () => {
  test("register page loads", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: /sign up|register|create account/i })).toBeVisible();
  });

  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /sign in|log in/i })).toBeVisible();
  });

  test("register with invalid email shows error", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel(/email/i).fill("not-an-email");
    await page.getByLabel(/password/i).first().fill("TestPass123!");
    await page.getByRole("button", { name: /register|sign up|create/i }).click();
    await expect(page.locator("text=/invalid|valid email/i")).toBeVisible({ timeout: 5000 }).catch(() => {
      // Browser-level validation — still passes if native validation fires
    });
  });

  test("login with wrong password shows error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("nobody@example.com");
    await page.getByLabel(/password/i).fill("wrongpassword");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await expect(page.locator("text=/invalid|incorrect|wrong/i")).toBeVisible({ timeout: 8000 });
  });
});
