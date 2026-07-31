import { expect, test } from "@playwright/test";

test("landing page renders product shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("BlobSafe").first()).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("button", { name: "Open vault" })).toBeVisible();
});

test("dapp routes expose production surfaces", async ({ page }) => {
  await page.goto("/app");

  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("button", { name: "ShelbyNet", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Shelby Testnet", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Groups", exact: true })).toBeVisible();

  await page.goto("/app/teams");
  await expect(page.getByRole("heading", { name: "Groups", exact: true })).toBeVisible();
  await expect(page.getByText("Recipient groups").first()).toBeVisible();

  await page.goto("/app/settings");
  await expect(page.getByRole("heading", { name: "Vault controls" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Receipt recovery" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gateway handoff" })).toBeVisible();
});

test("network preference switches the dapp shell to Shelby Testnet", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("blobsafe-shelby-network", "testnet");
  });

  await page.goto("/app");

  await expect(page.getByText("Shelby Testnet vault")).toBeVisible();
  await expect(page.getByRole("button", { name: "Shelby Testnet", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("upload and files routes show wallet-gated states", async ({ page }) => {
  await page.goto("/app/upload");
  await expect(page.getByText("Connect wallet to seal files")).toBeVisible();

  await page.goto("/app/files");
  await expect(page.getByText("Connect wallet to view owned files")).toBeVisible();
});

test("overview does not show cached receipts while wallet is disconnected", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "blobsafe-session-receipts",
      JSON.stringify([
        {
          id: "legacy",
          fileName: "legacy-wallet-file.png",
          blobName: "blobsafe/encrypted/0xabc/legacy-wallet-file.png",
          account: "0xabc",
          originalSize: 12,
          storedSize: 12,
          sha256: "abc",
          encryption: "AES-256-GCM",
          expirationMicros: Date.now() * 1000,
          uploadedAt: new Date().toISOString(),
          folder: "/",
        },
      ])
    );
  });

  await page.goto("/app");

  await expect(page.getByText("legacy-wallet-file.png")).toHaveCount(0);
  await expect(page.getByText("Connect a wallet to load vault activity for that account.")).toBeVisible();
});
