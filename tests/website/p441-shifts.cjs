// Local browser regression with a synthetic API. PostgreSQL-backed proof is the integration suite.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const base = new URL(
  process.env.UNIBOS_TEST_BASE_URL ?? "http://127.0.0.1:3130",
);
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) {
  throw new Error("P4.4.1 browser QA requires a local test server");
}
const evidenceDir = process.env.UNIBOS_QA_OUT ?? "/workspace/work/p4.4-qa";
const org = "0faab234-9a8a-4b25-89a2-29201c7f8acf";
const branch = "bb68778e-3698-471b-9b2b-d6845b78d70e";
const shiftId = "2faab234-9a8a-4b25-89a2-29201c7f8acf";

async function main() {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
  });
  const errors = [];
  let active = null;
  let movements = [];
  let closed = [];
  let timeoutAfterMovementCommit = true;
  const idempotencyResults = new Map();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let body = {};
    if (url.pathname === "/api/me") body = { mfaVerified: true };
    else if (url.pathname === "/api/v1/me/workspace-capabilities") {
      body = {
        organizations: [
          {
            id: org,
            name: "Test Restaurant",
            roles: [],
            branches: [
              {
                id: branch,
                name: "Test Branch",
                roles: ["cashier"],
                effectiveRoles: ["cashier"],
                capabilities: ["workspace.view", "shifts.open", "shifts.close"],
                navigation: [
                  {
                    id: "workspace",
                    href: `/dashboard?organizationId=${org}&branchId=${branch}`,
                  },
                  {
                    id: "shifts",
                    href: `/dashboard/shifts?organizationId=${org}&branchId=${branch}`,
                  },
                ],
              },
            ],
          },
        ],
      };
    } else if (
      url.pathname.endsWith("/cash-shifts") &&
      route.request().method() === "GET"
    ) {
      body = { activeShift: active, movements, history: closed };
    } else if (
      url.pathname.endsWith("/cash-shifts") &&
      route.request().method() === "POST"
    ) {
      const request = route.request().postDataJSON();
      active = {
        id: shiftId,
        status: "OPEN",
        currency_code: request.currencyCode,
        opening_amount_minor: request.openingAmountMinor,
        expected_current_minor: request.openingAmountMinor,
        version: 1,
      };
      body = { shift: active, duplicate: false };
    } else if (url.pathname.endsWith("/movements")) {
      const request = route.request().postDataJSON();
      const cached = idempotencyResults.get(request.idempotencyKey);
      if (cached) body = cached;
      else {
        movements.push({
          movement_type: request.movementType,
          amount_minor: request.amountMinor,
          reason: request.reason,
        });
        const sign = request.movementType === "CASH_IN" ? 1 : -1;
        active.expected_current_minor = String(
          Number(active.expected_current_minor) +
            sign * Number(request.amountMinor),
        );
        active.version += 1;
        body = { shift: active, movement: movements[movements.length - 1] };
        idempotencyResults.set(request.idempotencyKey, body);
        if (timeoutAfterMovementCommit) {
          timeoutAfterMovementCommit = false;
          await route.abort("timedout");
          return;
        }
      }
    } else if (url.pathname.endsWith("/begin-close")) {
      const request = route.request().postDataJSON();
      active = {
        ...active,
        status: "CLOSING",
        closing_expected_minor: active.expected_current_minor,
        counted_cash_minor: request.countedCashMinor,
        version: active.version + 1,
      };
      body = { shift: active };
    } else if (url.pathname.endsWith("/confirm-close")) {
      active = {
        ...active,
        status: "CLOSED",
        variance_minor: String(
          Number(active.counted_cash_minor) -
            Number(active.closing_expected_minor),
        ),
        version: active.version + 1,
        closed_at: new Date().toISOString(),
      };
      closed = [active];
      active = null;
      body = { shift: closed[0] };
    } else {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  try {
    await page.goto(
      new URL(
        `/dashboard/shifts?organizationId=${org}&branchId=${branch}`,
        base,
      ).href,
    );
    await page.getByRole("heading", { name: "Kassa smenalari" }).waitFor();
    await page.getByLabel("Boshlang‘ich naqd pul (tiyin)").fill("10000");
    await page.getByRole("button", { name: "Smenani ochish" }).click();
    await page.getByText(/100[,.]00/).first().waitFor();
    await page.screenshot({
      path: path.join(evidenceDir, "p441-shift-active-desktop.png"),
      fullPage: true,
    });
    await page.getByLabel("Miqdor (tiyin)").fill("5000");
    await page.getByLabel("Sabab").fill("Synthetic float top-up");
    await page.getByRole("button", { name: "Harakatni qayd etish" }).click();
    await page.getByText("Server javobi noaniq", { exact: false }).waitFor();
    assert.equal(
      await page
        .locator("li")
        .filter({ hasText: "Synthetic float top-up" })
        .count(),
      0,
    );
    await page
      .getByRole("button", { name: "Shu amalni xavfsiz qayta tekshirish" })
      .click();
    await page
      .locator("li")
      .filter({ hasText: "Synthetic float top-up" })
      .waitFor();
    assert.equal(
      movements.length,
      1,
      "retry must not duplicate a committed movement",
    );
    await page.getByText(/150[,.]00/).first().waitFor();
    await page.screenshot({
      path: path.join(evidenceDir, "p441-shift-movements-desktop.png"),
      fullPage: true,
    });
    await page.getByLabel("Sanab chiqilgan naqd pul (tiyin)").fill("15000");
    await page.getByRole("button", { name: "Yopishni boshlash" }).click();
    await page.getByRole("button", { name: "Yopishni tasdiqlash" }).click();
    await page.getByText("Yopilgan smenalar").waitFor();
    await page.setViewportSize({ width: 390, height: 900 });
    const languageSelect = page.locator("header select").last();
    await languageSelect.selectOption("ru");
    await page.getByRole("heading", { name: "Кассовые смены" }).waitFor();
    await languageSelect.selectOption("en");
    await page.getByRole("heading", { name: "Cash shifts" }).waitFor();
    const theme = page.getByRole("button", { name: /Theme:/ });
    await theme.click();
    assert.equal(await theme.getAttribute("aria-pressed"), "true");
    for (const width of [320, 390, 768, 1024, 1366, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      assert.equal(overflow, false, `horizontal overflow at ${width}px`);
      if (width === 390)
        await page.screenshot({
          path: path.join(evidenceDir, "p441-cash-shifts-mobile.png"),
          fullPage: true,
        });
      if (width === 1440)
        await page.screenshot({
          path: path.join(evidenceDir, "p441-cash-shifts-desktop.png"),
          fullPage: true,
        });
    }
    assert.equal(active, null);
    assert.equal(closed[0].variance_minor, "0");
    assert.deepEqual(errors, []);
    console.log(
      "P4.4.1 synthetic browser workflow passed: open, movement, close, UZ/RU/EN, light/dark, and seven viewport widths. This is not backend persistence proof.",
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
