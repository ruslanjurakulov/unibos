// Focused UI regression against a running local Next.js app; all API responses
// are synthetic browser mocks. This does not replace the real P2 MFA tests.
// Run: UNIBOS_TEST_BASE_URL=http://127.0.0.1:3130 node tests/website/auth-step-up.cjs
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const base = new URL(
  process.env.UNIBOS_TEST_BASE_URL ?? "http://127.0.0.1:3130",
);
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) {
  throw new Error("The UI regression requires a local test server");
}

async function scenario(browser, kind) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const calls = [];
  let signedIn = kind === "existing-totp" || kind === "existing-backup";
  let verified = false;
  await page.route(`${base.origin}/api/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    calls.push(path);
    let status = 200;
    let body = {};
    if (path === "/api/me") {
      status = signedIn ? 200 : 401;
      body = signedIn
        ? { userId: "synthetic-user", mfaVerified: verified }
        : {};
    } else if (path === "/api/organizations") {
      body = { organizations: [] };
    } else if (path === "/api/auth/sign-up/email") {
      signedIn = true;
    } else if (path === "/api/auth/sign-in/email") {
      body = { twoFactorRedirect: true };
    } else if (path === "/api/auth/two-factor/enable") {
      body = {
        totpURI: "otpauth://totp/Synthetic?secret=JBSWY3DPEHPK3PXP",
        backupCodes: ["synthetic-recovery-code"],
      };
    } else if (
      path === "/api/auth/two-factor/verify-totp" ||
      path === "/api/auth/two-factor/verify-backup-code"
    ) {
      if (request.postDataJSON().code === "000000") {
        status = 401;
      } else {
        signedIn = true;
        verified = true;
      }
    } else {
      throw new Error("Unexpected API route in auth UI regression");
    }
    await route.fulfill({ status, json: body });
  });
  try {
    await page.goto(
      new URL(kind === "enrollment" ? "/sign-up" : "/sign-in", base).href,
    );
    if (kind.startsWith("existing-")) {
      await page
        .getByRole("button", {
          name: "Verify an existing authenticator or recovery code",
        })
        .click();
      await page
        .getByRole("heading", { name: "Verify your account" })
        .waitFor();
      if (kind === "existing-backup") {
        await page
          .getByRole("button", { name: "Use a recovery code instead" })
          .click();
        await page
          .getByRole("textbox", { name: "One-time recovery code" })
          .fill("synthetic-recovery-code");
      } else {
        await page
          .getByRole("textbox", { name: "Six digit authenticator code" })
          .fill("000000");
        await page.getByRole("button", { name: "Verify and continue" }).click();
        await page
          .getByRole("alert")
          .filter({ hasText: "That code was not accepted" })
          .waitFor();
        assert.equal(new URL(page.url()).pathname, "/sign-in");
        await page
          .getByRole("textbox", { name: "Six digit authenticator code" })
          .fill("123456");
      }
      await page.getByRole("button", { name: "Verify and continue" }).click();
      await page.waitForURL("**/dashboard");
      assert.ok(!calls.includes("/api/auth/two-factor/enable"));
      assert.ok(!calls.includes("/api/auth/two-factor/get-totp-uri"));
      assert.ok(!calls.includes("/api/auth/two-factor/generate-backup-codes"));
      assert.ok(
        calls.includes(
          kind === "existing-backup"
            ? "/api/auth/two-factor/verify-backup-code"
            : "/api/auth/two-factor/verify-totp",
        ),
      );
    } else {
      if (kind === "enrollment")
        await page
          .getByLabel("Full name", { exact: true })
          .fill("Synthetic User");
      await page
        .getByLabel("Email", { exact: true })
        .fill("synthetic@example.invalid");
      await page
        .locator('input[type="password"]')
        .fill("synthetic-password-only");
      await page
        .getByRole("button", {
          name: kind === "enrollment" ? "Create account" : "Continue",
        })
        .click();
      if (kind === "enrollment") {
        // A fresh account can choose existing verification accidentally, then
        // return to enrollment without calling any factor-material endpoint.
        await page
          .getByRole("button", {
            name: "Verify an existing authenticator or recovery code",
          })
          .click();
        await page
          .getByRole("button", { name: "Back to authenticator setup" })
          .click();
        await page
          .getByLabel("Account password", { exact: true })
          .fill("synthetic-password-only");
        await page
          .getByRole("button", { name: "Set up authenticator" })
          .click();
        await page
          .getByRole("heading", { name: "Confirm your authenticator" })
          .waitFor();
      } else {
        await page
          .getByRole("heading", { name: "Verify your sign-in" })
          .waitFor();
      }
      await page
        .getByRole("textbox", { name: "Six digit authenticator code" })
        .fill("123456");
      await page.getByRole("button", { name: "Verify and continue" }).click();
      if (kind === "enrollment") {
        await page
          .getByRole("heading", { name: "Save your recovery codes" })
          .waitFor();
        await page
          .getByRole("button", { name: "Continue to workspace" })
          .click();
        assert.ok(calls.includes("/api/auth/two-factor/enable"));
      } else assert.ok(!calls.includes("/api/auth/two-factor/enable"));
      await page.waitForURL("**/dashboard");
    }
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? "/usr/bin/chromium",
  });
  try {
    for (const kind of [
      "existing-totp",
      "existing-backup",
      "enrollment",
      "password-login",
    ]) {
      await scenario(browser, kind);
      console.log(`PASS: ${kind} UI flow (mock API)`);
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
