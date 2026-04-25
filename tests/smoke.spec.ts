import { expect, test } from "@playwright/test";

test("renders the online lobby entry", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "あいうえバトル Online" })).toBeVisible();
  await expect(page.getByLabel("名前")).toBeVisible();
  await expect(page.getByRole("button", { name: /部屋を作る/ })).toBeVisible();
});

test("connects host and guest through a room code", async ({ browser }) => {
  test.setTimeout(60_000);

  const host = await browser.newPage();
  const guest = await browser.newPage();

  await host.goto("/");
  await host.getByLabel("名前").fill("ホスト");
  await host.getByRole("button", { name: /部屋を作る/ }).click();
  await expect(host.getByText("部屋コード")).toBeVisible({ timeout: 20_000 });

  const roomCode = (await host.locator(".share-band strong").textContent())?.trim();
  expect(roomCode).toBeTruthy();
  expect(roomCode).toMatch(/^\d{6}$/);

  await guest.goto(`/?room=${encodeURIComponent(roomCode ?? "")}`);
  await guest.getByLabel("名前").fill("ゲスト");
  await guest.getByRole("button", { name: /参加/ }).click();

  await expect(host.locator(".player-row strong", { hasText: "ゲスト" })).toBeVisible({
    timeout: 25_000,
  });
  await expect(guest.locator(".player-row strong", { hasText: "ホスト" })).toBeVisible({
    timeout: 25_000,
  });

  await host.getByPlaceholder("例: 動物、飲みもの、文房具").fill("動物");
  await host.getByRole("button", { name: /お題を決定/ }).click();

  await expect(host.locator("h1", { hasText: "動物" })).toBeVisible();
  await expect(guest.locator("h1", { hasText: "動物" })).toBeVisible({ timeout: 15_000 });

  const secretWord = host.getByLabel("秘密の言葉");
  await expect(secretWord).toHaveAttribute("type", "text");
  await secretWord.fill("りんご");
  await expect(secretWord).toHaveValue("りんご");
  await expect(host.locator(".slot-preview .slot").nth(0)).toHaveText("り");
  await expect(host.locator(".slot-preview .slot").nth(1)).toHaveText("ん");
  await expect(host.locator(".slot-preview .slot").nth(2)).toHaveText("こ");
  await expect(host.getByRole("button", { name: /この言葉で準備/ })).toBeEnabled();
  await host.getByRole("button", { name: /この言葉で準備/ }).click();
  await expect(host.getByText("準備完了")).toBeVisible();
});
