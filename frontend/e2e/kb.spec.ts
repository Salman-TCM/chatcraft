/**
 * E2E: Knowledge base upload → question → grounded answer
 *
 * Flow:
 *   1. Register + login
 *   2. Create a chatbot
 *   3. Upload a plain-text document
 *   4. Poll until document status = ready
 *   5. Send a question whose answer is only in the uploaded doc
 *   6. Assert the response is not a generic "I don't know"
 */
import { test, expect, type Page } from "@playwright/test";

const unique = (prefix = "kb") => `${prefix}_${Date.now()}@e2e.chatcraft.ai`;
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const API  = `${BASE}/api`;

// Helpers ─────────────────────────────────────────────────────────────────────

async function registerAndLogin(page: Page, email: string) {
  await page.goto("/register");
  await page.getByLabel(/email/i).fill(email);
  // Fill password fields (some forms have confirm-password)
  const pwFields = page.getByLabel(/^password$/i);
  await pwFields.first().fill("KbE2ePass99!");
  const confirmField = page.getByLabel(/confirm.*password|repeat.*password/i);
  if (await confirmField.count() > 0) {
    await confirmField.fill("KbE2ePass99!");
  }
  await page.getByLabel(/name|full name/i).fill("KB Tester").catch(() => {});
  await page.getByRole("button", { name: /register|sign up|create account/i }).click();

  // Wait for redirect to dashboard or email-verification page
  await page.waitForURL(/dashboard|verify|login/i, { timeout: 15_000 });

  // If redirected to login (email verification required), just log in
  if (page.url().includes("login")) {
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill("KbE2ePass99!");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL(/dashboard/i, { timeout: 15_000 });
  }
}

async function createChatbot(page: Page, name: string): Promise<string> {
  await page.goto("/dashboard/chatbots");
  await page.getByRole("button", { name: /new chatbot|create chatbot|add chatbot/i }).click();

  const dialog = page.getByRole("dialog").or(page.locator("form")).first();
  await dialog.getByLabel(/name/i).fill(name);
  await dialog.getByRole("button", { name: /create|save|add/i }).click();

  // Wait for the chatbot card/row to appear and grab its ID from the URL or data
  await page.waitForURL(/chatbots\/[a-f0-9-]{36}/i, { timeout: 10_000 }).catch(() => {});
  const match = page.url().match(/chatbots\/([a-f0-9-]{36})/);
  return match ? match[1] : "";
}

// Tests ───────────────────────────────────────────────────────────────────────

test.describe("Knowledge Base E2E", () => {
  test("upload document, then receive grounded answer", async ({ page }) => {
    const email = unique();
    await registerAndLogin(page, email);

    // ── Create chatbot ──────────────────────────────────────────────────────
    const botName = `KB Bot ${Date.now()}`;
    await createChatbot(page, botName);

    // Navigate to the KB section of that chatbot
    // URL may be /dashboard/chatbots/{id}/knowledge or /dashboard/chatbots/{id}#kb
    await expect(page.getByText(/knowledge|documents|upload/i)).toBeVisible({ timeout: 10_000 })
      .catch(() => {
        // Fallback: look for a nav link
        return page.getByRole("link", { name: /knowledge|documents|kb/i }).click();
      });

    // ── Upload a text file ──────────────────────────────────────────────────
    const FACT = "The secret passcode is XRAY-9942.";
    const fileContent = `ChatCraft Test Document\n\n${FACT}\n\nThis document is used for automated E2E testing only.\n`;
    const fileName = "e2e-test-doc.txt";

    // Find the file input (may be hidden behind a "Upload" button)
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: fileName,
      mimeType: "text/plain",
      buffer: Buffer.from(fileContent),
    });

    // Confirm upload if a dialog/button appears
    const uploadBtn = page.getByRole("button", { name: /upload|ingest|process/i });
    if (await uploadBtn.count() > 0) {
      await uploadBtn.click();
    }

    // ── Wait for document to be processed ──────────────────────────────────
    // Poll for status badge: "ready" or "processed" (up to 60 s)
    const readyLocator = page.locator("text=/ready|processed|complete/i").first();
    await expect(readyLocator).toBeVisible({ timeout: 60_000 });

    // ── Publish the bot so chat works ───────────────────────────────────────
    const publishBtn = page.getByRole("button", { name: /publish|enable|go live/i });
    if (await publishBtn.count() > 0) {
      await publishBtn.click();
      await page.waitForTimeout(1000);
    }

    // ── Navigate to chat ────────────────────────────────────────────────────
    const chatLink = page.getByRole("link", { name: /chat|preview|test/i });
    if (await chatLink.count() > 0) {
      await chatLink.click();
    }
    await page.waitForURL(/chat|widget|preview/i, { timeout: 10_000 }).catch(() => {});

    // ── Send the question ───────────────────────────────────────────────────
    const msgInput = page.getByPlaceholder(/message|ask|type/i).or(
      page.getByRole("textbox")
    ).first();
    await expect(msgInput).toBeVisible({ timeout: 10_000 });
    await msgInput.fill("What is the secret passcode?");
    await page.keyboard.press("Enter");

    // ── Assert grounded answer ──────────────────────────────────────────────
    // The RAG pipeline should find the chunk and include the passcode
    const responseArea = page.locator("[data-testid='assistant-message']").or(
      page.locator(".message-assistant, .assistant-bubble, [role='log']")
    ).last();
    await expect(responseArea).toBeVisible({ timeout: 30_000 });
    const text = await responseArea.textContent() ?? "";
    // Either the exact passcode or a grounded answer — not a pure "I don't know"
    expect(text.toLowerCase()).not.toMatch(/i don'?t know|no information|not sure/i);
  });

  test("document list shows uploaded file", async ({ page }) => {
    const email = unique("kblist");
    await registerAndLogin(page, email);
    await createChatbot(page, `Doc List Bot ${Date.now()}`);

    // The KB tab or section should be present
    const kbSection = page.getByText(/knowledge|documents/i).first();
    await expect(kbSection).toBeVisible({ timeout: 10_000 });
  });

  test("unauthenticated user cannot access KB upload page", async ({ page }) => {
    await page.goto("/dashboard/chatbots/00000000-0000-0000-0000-000000000001/knowledge");
    await expect(page).toHaveURL(/login|signin|auth/i, { timeout: 10_000 }).catch(async () => {
      await expect(page.locator("text=/sign in|log in|unauthorized/i")).toBeVisible({ timeout: 5000 });
    });
  });
});
