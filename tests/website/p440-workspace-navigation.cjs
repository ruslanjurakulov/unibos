const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const evidenceDir = process.env.UNIBOS_QA_OUT ?? "/workspace/work/p4.4-qa";

const base = new URL(
  process.env.UNIBOS_TEST_BASE_URL ?? "http://127.0.0.1:3130",
);
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) {
  throw new Error("P4.4.0 workspace UI QA requires a local test server");
}

const orgA = "0faab234-9a8a-4b25-89a2-29201c7f8acf";
const orgB = "1faab234-9a8a-4b25-89a2-29201c7f8acf";
const branchA = "bb68778e-3698-471b-9b2b-d6845b78d70e";
const branchA2 = "db68778e-3698-471b-9b2b-d6845b78d70e";
const branchA3 = "eb68778e-3698-471b-9b2b-d6845b78d70e";
const branchB = "cb68778e-3698-471b-9b2b-d6845b78d70e";

async function main() {
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  const posRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body = {};
    if (path === "/api/v1/me/workspace-capabilities") {
      body = {
        version: 1,
        generatedAt: new Date().toISOString(),
        userId: "synthetic-user",
        organizations: [
          {
            id: orgA,
            name: "Restaurant A",
            roles: [],
            branches: [
              {
                id: branchA,
                name: "A primary",
                roles: ["cashier"],
                effectiveRoles: ["cashier"],
                capabilities: [
                  "workspace.view",
                  "orders.create",
                  "waiter.operate",
                ],
                navigation: [
                  {
                    href: `/dashboard?organizationId=${orgA}&branchId=${branchA}`,
                    id: "workspace",
                  },
                  {
                    href: `/dashboard/pos?organizationId=${orgA}&branchId=${branchA}`,
                    id: "pos",
                  },
                  {
                    href: `/dashboard/waiter?organizationId=${orgA}&branchId=${branchA}`,
                    id: "waiter",
                  },
                ],
              },
              {
                id: branchA2,
                name: "A secondary",
                roles: ["cashier", "waiter", "kitchen"],
                effectiveRoles: ["cashier", "waiter", "kitchen"],
                capabilities: [
                  "workspace.view",
                  "orders.create",
                  "waiter.operate",
                  "kitchen.operate",
                ],
                navigation: [
                  {
                    href: `/dashboard?organizationId=${orgA}&branchId=${branchA2}`,
                    id: "workspace",
                  },
                  {
                    href: `/dashboard/pos?organizationId=${orgA}&branchId=${branchA2}`,
                    id: "pos",
                  },
                  {
                    href: `/dashboard/waiter?organizationId=${orgA}&branchId=${branchA2}`,
                    id: "waiter",
                  },
                  {
                    href: `/dashboard/kitchen?organizationId=${orgA}&branchId=${branchA2}`,
                    id: "kitchen",
                  },
                ],
              },
              {
                id: branchA3,
                name: "A kitchen",
                roles: ["kitchen"],
                effectiveRoles: ["kitchen"],
                capabilities: ["workspace.view", "kitchen.operate"],
                navigation: [
                  {
                    href: `/dashboard?organizationId=${orgA}&branchId=${branchA3}`,
                    id: "workspace",
                  },
                  {
                    href: `/dashboard/kitchen?organizationId=${orgA}&branchId=${branchA3}`,
                    id: "kitchen",
                  },
                ],
              },
            ],
          },
          {
            id: orgB,
            name: "Restaurant B",
            roles: [],
            branches: [
              {
                id: branchB,
                name: "B primary",
                roles: ["kitchen"],
                effectiveRoles: ["kitchen"],
                capabilities: ["workspace.view", "kitchen.operate"],
                navigation: [
                  {
                    href: `/dashboard?organizationId=${orgB}&branchId=${branchB}`,
                    id: "workspace",
                  },
                  {
                    href: `/dashboard/kitchen?organizationId=${orgB}&branchId=${branchB}`,
                    id: "kitchen",
                  },
                ],
              },
            ],
          },
        ],
      };
    } else if (path === "/api/me") {
      body = { userId: "synthetic-user", mfaVerified: true };
    } else if (path === "/api/organizations") {
      body = {
        organizations: [
          { id: orgA, name: "Restaurant A" },
          { id: orgB, name: "Restaurant B" },
        ],
      };
    } else if (path.endsWith("/branches")) {
      const isA = path.includes(orgA);
      body = {
        branches: isA
          ? [
              { id: branchA, name: "A primary" },
              { id: branchA2, name: "A secondary" },
              { id: branchA3, name: "A kitchen" },
            ]
          : [{ id: branchB, name: "B primary" }],
      };
    } else if (
      /\/api\/v1\/organizations\/[^/]+\/branches\/[^/]+\/pos$/.test(path)
    ) {
      posRequests.push(path);
      body = {
        products: [
          {
            id: "ab68778e-3698-471b-9b2b-d6845b78d70e",
            name: "Synthetic soup",
            description: "Demo only",
            image_key: null,
            category_id: "bb68778e-3698-471b-9b2b-d6845b78d70f",
            category_name: "Demo",
            available: true,
            price_version: "2026-01-01T00:00:00.000Z",
            price_minor: "85000",
            currency_code: "UZS",
          },
        ],
        tables: [],
      };
    } else if (
      /\/api\/v1\/organizations\/[^/]+\/branches\/[^/]+\/waiter$/.test(path)
    ) {
      body = { products: [], orders: [], tables: [], tickets: [] };
    } else if (
      /\/api\/v1\/organizations\/[^/]+\/branches\/[^/]+\/kitchen\/tickets$/.test(
        path,
      )
    ) {
      body = { tickets: [] };
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  try {
    fs.mkdirSync(evidenceDir, { recursive: true });
    await page.goto(new URL("/dashboard", base).href, {
      waitUntil: "networkidle",
    });
    const shell = page.locator("main > section[aria-label]");
    await shell.waitFor();
    await page.getByRole("link", { name: /Kassir POS/ }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Oshxona" }).count(), 0);
    await page.screenshot({
      path: path.join(evidenceDir, "p440-owner-cashier-desktop.png"),
      fullPage: true,
    });

    const orgSelect = page.getByLabel("Tashkilot");
    await orgSelect.selectOption(orgB);
    await page.waitForURL(new RegExp(`organizationId=${orgB}`));
    await page.getByRole("link", { name: "Oshxona" }).waitFor();
    assert.equal(
      await page.getByRole("link", { name: /Kassir POS/ }).count(),
      0,
    );
    assert.equal(new URL(page.url()).searchParams.get("branchId"), branchB);

    await page.getByLabel("Язык").selectOption("ru");
    assert.equal(await page.getByLabel("Организация").count(), 1);
    await page.getByLabel("Язык").selectOption("en");
    assert.equal(await page.getByLabel("Organization").count(), 1);
    await page.getByLabel("Language").selectOption("uz");
    assert.equal(await page.getByLabel("Tashkilot").count(), 1);
    await page.getByRole("button", { name: "Dark mode" }).click();
    assert.equal(await shell.getAttribute("data-dark"), "true");
    await page.getByRole("button", { name: "Light mode" }).click();
    assert.equal(await shell.getAttribute("data-dark"), "false");

    await page.evaluate(() => {
      document.body.dataset.unibosWorkspaceLocked = "true";
    });
    await page.waitForTimeout(30);
    assert.equal(await page.getByLabel("Filial").isDisabled(), true);
    await page.evaluate(() => {
      document.body.dataset.unibosWorkspaceLocked = "false";
    });

    await page.goto(
      new URL(
        "/dashboard?organizationId=" + orgA + "&branchId=" + branchA,
        base,
      ).href,
      { waitUntil: "networkidle" },
    );
    await page.getByRole("link", { name: "Kassir POS" }).click();
    await page.waitForURL(/\/dashboard\/pos\?/);
    await page
      .getByRole("button", { name: "Synthetic soup savatga qo‘shish" })
      .waitFor();
    await shell.getByLabel("Filial").selectOption(branchA2);
    await page.waitForURL(new RegExp(`branchId=${branchA2}`));
    await page.waitForFunction(
      (id) =>
        performance
          .getEntriesByType("resource")
          .some((entry) => entry.name.includes(id)),
      branchA2,
    );
    await page.getByLabel("Faol filial").waitFor();
    assert.equal(await page.getByLabel("Faol filial").inputValue(), branchA2);
    assert.ok(posRequests.at(-1).includes(`/branches/${branchA2}/pos`));
    await page
      .getByRole("button", { name: "Synthetic soup savatga qo‘shish" })
      .click();
    assert.equal(await shell.getByLabel("Filial").isDisabled(), true);
    await page
      .getByRole("button", { name: "Synthetic soupni olib tashlash" })
      .click();
    await page.waitForFunction(
      () => document.body.dataset.unibosWorkspaceLocked !== "true",
    );
    const backRequest = page.waitForResponse((response) =>
      new URL(response.url()).pathname.includes(
        "/branches/" + branchA + "/pos",
      ),
    );
    await page.goBack();
    await backRequest;
    await page.waitForURL(new RegExp("branchId=" + branchA));
    assert.equal(await page.getByLabel("Faol filial").inputValue(), branchA);
    const forwardRequest = page.waitForResponse((response) =>
      new URL(response.url()).pathname.includes(
        "/branches/" + branchA2 + "/pos",
      ),
    );
    await page.goForward();
    await forwardRequest;
    await page.waitForURL(new RegExp("branchId=" + branchA2));
    await shell.getByLabel("Filial").selectOption(branchA);
    await page.waitForURL(new RegExp(`branchId=${branchA}`));

    await page.goto(
      new URL(
        `/dashboard/waiter?organizationId=${orgA}&branchId=${branchA}`,
        base,
      ).href,
      { waitUntil: "networkidle" },
    );
    await page.getByRole("heading", { name: "Ofitsiant ish joyi" }).waitFor();
    await shell.getByLabel("Til").selectOption("ru");
    const waiterRequest = page.waitForResponse((response) =>
      new URL(response.url()).pathname.includes(`/branches/${branchA2}/waiter`),
    );
    await shell.locator("select").nth(1).selectOption(branchA2);
    await waiterRequest;
    await page.waitForURL(new RegExp(`branchId=${branchA2}`));
    await page.waitForTimeout(100);
    assert.equal(
      await page
        .locator("main label")
        .filter({ hasText: "Filial" })
        .last()
        .locator("select")
        .inputValue(),
      branchA2,
    );
    assert.equal(new URL(page.url()).searchParams.get("branchId"), branchA2);

    await page.goto(
      new URL(
        `/dashboard/kitchen?organizationId=${orgA}&branchId=${branchA2}`,
        base,
      ).href,
      { waitUntil: "networkidle" },
    );
    await page.getByRole("heading", { name: "Oshxona ekrani" }).waitFor();
    const kitchenRequest = page.waitForResponse((response) =>
      new URL(response.url()).pathname.includes(
        `/branches/${branchA3}/kitchen/tickets`,
      ),
    );
    await shell.locator("select").nth(1).selectOption(branchA3);
    await kitchenRequest;
    await page.waitForURL(new RegExp(`branchId=${branchA3}`));
    assert.equal(new URL(page.url()).searchParams.get("branchId"), branchA3);
    assert.equal(
      await page
        .locator("main label")
        .filter({ hasText: "Filial" })
        .last()
        .locator("select")
        .inputValue(),
      branchA3,
    );

    for (const width of [320, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(30);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      assert.equal(overflow, false, `horizontal overflow at ${width}px`);
      if (width <= 760) {
        const menu = page.getByRole("button", { name: "Навигация" });
        await menu.click();
        assert.equal(await page.locator("#workspace-links").isVisible(), true);
        await page.keyboard.press("Escape");
        assert.equal(await menu.getAttribute("aria-expanded"), "false");
        assert.equal(
          await menu.evaluate((button) => document.activeElement === button),
          true,
        );
        await menu.click();
        assert.equal(await page.locator("#workspace-links").isVisible(), true);
        if (width === 390) {
          await page.screenshot({
            path: path.join(evidenceDir, "p440-kitchen-mobile.png"),
            fullPage: true,
          });
        }
        await menu.click();
      }
    }
    assert.deepEqual(errors, []);
    console.log(
      "P4.4.0 workspace browser QA passed: scoped role navigation, context switching, lock state, RU labels, and six viewport widths.",
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
