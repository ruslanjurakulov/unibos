// Browser coverage uses synthetic HTTP fixtures; PostgreSQL and auth have separate integration tests.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const base = new URL(
  process.env.UNIBOS_TEST_BASE_URL ?? "http://127.0.0.1:43100",
);
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname),
  "Analytics fixtures require a local web server",
);
const org = "0faab234-9a8a-4b25-89a2-29201c7f8acf";
const primary = "bb68778e-3698-471b-9b2b-d6845b78d70e";
const secondary = "db68778e-3698-471b-9b2b-d6845b78d70e";
const name = "Lunch set";
const formulaName = '=SUM(1,2) "Lunch"';
const locales = {
  uz: "Filial hisoboti",
  ru: "Отчёт филиала",
  en: "Branch report",
};

async function run() {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let denied = false,
      offline = false,
      forbidNext = false,
      testCsvName = false,
      largeTotal = false;
    const requests = [];
    const capabilities = () => ({
      organizations: [
        {
          id: org,
          name: "River Kitchen",
          roles: ["owner"],
          branches: [primary, secondary].map((id, i) => ({
            id,
            name: i ? "South" : "Central",
            roles: [],
            effectiveRoles: [denied ? "waiter" : "owner"],
            capabilities: denied ? [] : ["analytics.read"],
            navigation: denied
              ? []
              : [
                  {
                    id: "analytics",
                    href: `/dashboard/analytics?organizationId=${org}&branchId=${id}`,
                  },
                ],
          })),
        },
      ],
    });
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/v1/me/workspace-capabilities")
        return route.fulfill({ json: capabilities() });
      assert.match(
        url.pathname,
        new RegExp(
          `^/api/v1/organizations/${org}/branches/(${primary}|${secondary})/analytics$`,
        ),
      );
      const branchId = url.pathname.split("/").at(-2);
      const from = url.searchParams.get("from"),
        to = url.searchParams.get("to");
      requests.push({ branchId, from, to });
      if (offline || forbidNext)
        return route.fulfill({ status: offline ? 503 : 403, json: {} });
      const isEmpty = branchId === secondary;
      return route.fulfill({
        json: {
          version: 1,
          organizationId: org,
          branchId,
          from,
          to,
          currencies: isEmpty
            ? []
            : [
                {
                  currency: "UZS",
                  orderCount: 3,
                  cancelledCount: 1,
                  orderTotalMinor: largeTotal
                    ? "900719925474099312345"
                    : "10200000",
                  averageOrderMinor: "3400000",
                  settlementCount: 2,
                  settledMinor: "7500000",
                  ledgerAlerts: 0,
                },
              ],
          products: isEmpty
            ? []
            : [
                {
                  productId: "meal",
                  currency: "UZS",
                  name: testCsvName ? formulaName : name,
                  quantity: "2",
                  totalMinor: "7500000",
                },
              ],
          cashiers: isEmpty
            ? []
            : [
                {
                  cashierId: "cashier-01",
                  currency: "UZS",
                  settlementCount: 2,
                  settledMinor: "7500000",
                  closedShifts: 1,
                  expectedMinor: "8000000",
                  countedMinor: "7999000",
                  varianceMinor: "-1000",
                  varianceAlerts: 1,
                },
              ],
          kitchen: isEmpty ? [] : [{ status: "READY", ticketCount: 2 }],
          averagePreparationSeconds: isEmpty ? null : 147,
        },
      });
    });
    const routePath = `/dashboard/analytics?organizationId=${org}&branchId=${primary}`;
    await page.goto(new URL(routePath, base).href);
    const product = page.getByRole("rowheader", { name, exact: true });
    await product.waitFor();
    for (const [code, title] of Object.entries(locales)) {
      await page.getByLabel("Til / Язык / Language").selectOption(code);
      await page.getByRole("heading", { level: 1, name: title }).waitFor();
    }
    await page.getByLabel("Date (UTC)").fill("2024-02-29");
    await product.waitFor();
    const filter = async (period, from, to) => {
      const done = page.waitForResponse(
        (r) =>
          r.url().includes(`analytics?from=${from}&to=${to}`) &&
          r.status() === 200,
      );
      await page.getByRole("button", { name: period, exact: true }).click();
      await done;
      await product.waitFor();
    };
    await filter("Month", "2024-02-01", "2024-02-29");
    await filter("Week", "2024-02-26", "2024-03-03");
    await filter("Day", "2024-02-29", "2024-02-29");
    testCsvName = true;
    const downloadEvent = page.waitForEvent("download");
    const beforeExport = requests.length;
    await page
      .getByRole("button", { name: "Download CSV", exact: true })
      .click();
    const download = await downloadEvent;
    testCsvName = false;
    assert.equal(
      requests.length,
      beforeExport + 1,
      "export checks current API access",
    );
    assert.ok(download.suggestedFilename().includes(primary));
    const csv = await fs.readFile(await download.path(), "utf8");
    assert.ok(csv.includes(`"'=SUM(1,2) ""Lunch"""`));
    assert.ok(csv.includes('"-1000"'));
    testCsvName = true;
    const xmlEvent = page.waitForEvent("download");
    const beforeXml = requests.length;
    await page.getByRole("button", { name: "Download Excel (.xml)" }).click();
    const workbook = await xmlEvent;
    testCsvName = false;
    assert.equal(requests.length, beforeXml + 1);
    assert.match(workbook.suggestedFilename(), /\.xml$/);
    const workbookXml = await fs.readFile(await workbook.path(), "utf8");
    const workbookEvidence = await page.evaluate((xml) => {
      const workbook = new DOMParser().parseFromString(xml, "application/xml");
      const ns = "urn:schemas-microsoft-com:office:spreadsheet";
      return {
        invalid: workbook.getElementsByTagName("parsererror").length,
        names: Array.from(workbook.getElementsByTagNameNS(ns, "Data"))
          .filter((node) => node.getAttributeNS(ns, "Type") === "String")
          .map((node) => node.textContent),
        formulas: Array.from(
          workbook.getElementsByTagNameNS(ns, "Cell"),
        ).filter((node) => node.hasAttributeNS(ns, "Formula")).length,
      };
    }, workbookXml);
    assert.equal(workbookEvidence.invalid, 0);
    assert.ok(workbookEvidence.names.includes(formulaName));
    assert.equal(workbookEvidence.formulas, 0);
    for (const width of [320, 390, 768, 1024, 1366, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const overflowing = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      assert.equal(
        overflowing,
        false,
        `no horizontal page overflow at ${width}px`,
      );
      const splitAmounts = await page
        .locator("dd span, td span")
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => {
              const range = document.createRange();
              range.selectNodeContents(node);
              return range.getClientRects().length > 1;
            })
            .map((node) => node.textContent),
        );
      assert.deepEqual(
        splitAmounts,
        [],
        `readable monetary values at ${width}px`,
      );
      if (process.env.UNIBOS_QA_OUT && [390, 1440].includes(width)) {
        await fs.mkdir(process.env.UNIBOS_QA_OUT, { recursive: true });
        await page.screenshot({
          path: path.join(process.env.UNIBOS_QA_OUT, `analytics-${width}.png`),
          fullPage: true,
        });
      }
    }
    largeTotal = true;
    await page.setViewportSize({ width: 320, height: 900 });
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    const exactAmount = page
      .locator("dd")
      .filter({ hasText: "9,007,199,254,740,993,123.45" });
    await exactAmount.waitFor();
    assert.ok(
      await exactAmount.evaluate(
        (node) => node.scrollWidth <= node.clientWidth,
      ),
      "even very large totals fit the metric without clipping",
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    largeTotal = false;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("button", { name: "Dark theme" }).focus();
    await page.keyboard.press("Space");
    assert.equal(
      await page
        .getByRole("button", { name: "Dark theme" })
        .getAttribute("aria-pressed"),
      "true",
    );
    await page
      .getByRole("combobox", { name: /^Branch/ })
      .selectOption(secondary);
    await page
      .getByText("This branch has no records for the selected period.")
      .waitFor();
    assert.equal(await product.count(), 0);
    await page.getByRole("combobox", { name: /^Branch/ }).selectOption(primary);
    await product.waitFor();
    offline = true;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page
      .getByText("The reporting service is unavailable.", { exact: false })
      .waitFor();
    assert.equal(await product.count(), 0);
    offline = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await product.waitFor();
    forbidNext = true;
    await page.getByRole("button", { name: "Download CSV" }).click();
    await page
      .getByText(
        "An owner or director role and a verified MFA session are required.",
      )
      .waitFor();
    assert.equal(await product.count(), 0);
    assert.equal(
      await page.getByRole("button", { name: "Download CSV" }).count(),
      0,
    );
    forbidNext = false;
    denied = true;
    const prior = requests.length;
    await page.reload();
    await page
      .getByText(
        "An owner or director role and a verified MFA session are required.",
      )
      .waitFor();
    assert.equal(requests.length, prior, "no report request for denied role");
    assert.deepEqual(errors, []);
    console.log(
      "PASS: owner analytics synthetic browser workflow, UTC calendar filters, CSV/Excel authorization and escaping, context change, failure/recovery, UZ/RU/EN, dark mode, keyboard and seven viewports",
    );
  } finally {
    await browser.close();
  }
}
run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
