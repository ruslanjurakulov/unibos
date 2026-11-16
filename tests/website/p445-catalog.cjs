// Authenticated catalog browser contract test with a synthetic API fixture.
// PostgreSQL/API integration is covered separately by the real disposable DB suite.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.BASE_URL;
if (!baseUrl) throw new Error("P4.4.5 browser QA requires BASE_URL");
const out = process.env.EVIDENCE_DIR || "/workspace/work/p4.4.5-qa";
fs.mkdirSync(out, { recursive: true });

const orgId = "0faab234-9a8a-4b25-89a2-29201c7f8acf";
const branchId = "bb68778e-3698-471b-9b2b-d6845b78d70e";
const categoryId = "5f08bc02-6c3d-4b4f-bd7a-7e155c8aa401";
const productId = "604a1bb4-3632-4b61-aaf6-14e65796edaf";
const product2Id = "704a1bb4-3632-4b61-aaf6-14e65796edaf";

function apiFixture() {
  const state = {
    categories: [],
    products: [],
    prices: new Map(),
    availability: new Map(),
    staleNextPrice: false,
    requests: [],
  };
  const route = async (route, request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const method = request.method();
    let body = {};
    try {
      body = request.postDataJSON() || {};
    } catch {}
    state.requests.push({ method, path: url.pathname, body });
    let payload = {};
    let status = 200;
    if (url.pathname === "/api/v1/me/workspace-capabilities") {
      payload = {
        organizations: [
          {
            id: orgId,
            name: "Test Restaurant",
            roles: ["owner"],
            capabilities: ["catalog.manage", "catalog.read"],
            branches: [
              {
                id: branchId,
                name: "Main branch",
                roles: [],
                effectiveRoles: ["owner"],
                capabilities: ["catalog.manage", "catalog.read"],
                navigation: [
                  {
                    id: "workspace",
                    href: `/dashboard?organizationId=${orgId}&branchId=${branchId}`,
                  },
                  {
                    id: "menu",
                    href: `/dashboard/menu?organizationId=${orgId}&branchId=${branchId}`,
                  },
                ],
              },
            ],
          },
        ],
      };
    } else if (/\/catalog\/categories$/.test(url.pathname)) {
      if (method === "GET") payload = { categories: state.categories };
      else if (method === "POST") {
        const category = {
          id: categoryId,
          name: body.name,
          description: null,
          sort_order: body.sortOrder,
          active: true,
        };
        state.categories = [category];
        payload = { category };
        status = 201;
      }
    } else if (
      new RegExp(`/catalog/categories/${categoryId}$`).test(url.pathname)
    ) {
      const category = state.categories[0];
      Object.assign(category, body);
      payload = { category };
    } else if (/\/catalog\/products$/.test(url.pathname)) {
      if (method === "GET") payload = { products: state.products };
      else if (method === "POST") {
        const product = {
          id: productId,
          category_id: body.categoryId,
          category_name: "Drinks",
          name: body.name,
          description: body.description,
          image_key: body.imageKey,
          sort_order: 0,
          active: true,
        };
        state.products = [product];
        payload = { product };
        status = 201;
      }
    } else if (
      new RegExp(`/catalog/products/(${productId}|${product2Id})$`).test(
        url.pathname,
      )
    ) {
      const product = state.products.find(
        (item) => item.id === url.pathname.split("/").at(-1),
      );
      Object.assign(product, body);
      payload = { product };
    } else if (
      new RegExp(`/branches/${branchId}/catalog$`).test(url.pathname)
    ) {
      payload = {
        products: state.products
          .filter((product) => product.active)
          .map((product) => {
            const current = state.prices.get(product.id);
            return {
              ...product,
              available: state.availability.get(product.id) ?? true,
              price_version: current?.id ?? null,
              price_minor: current?.price_minor ?? null,
              currency_code: current?.currency_code ?? null,
            };
          }),
      };
    } else if (
      new RegExp(`/branches/${branchId}/catalog/${productId}/price$`).test(
        url.pathname,
      )
    ) {
      const current = state.prices.get(productId);
      if (method === "GET") {
        payload = { priceHistory: current ? [current] : [] };
      } else if (method === "POST") {
        if (
          state.staleNextPrice ||
          (current?.id ?? null) !== body.expectedPriceVersionId
        ) {
          state.staleNextPrice = false;
          status = 409;
          payload = { message: "Version conflict" };
        } else {
          const version = {
            id: current
              ? "804a1bb4-3632-4b61-aaf6-14e65796edaf"
              : "904a1bb4-3632-4b61-aaf6-14e65796edaf",
            price_minor: String(body.priceMinor),
            currency_code: body.currencyCode,
            effective_at: new Date().toISOString(),
          };
          state.prices.set(productId, version);
          payload = { price: version };
          status = 201;
        }
      }
    } else if (
      new RegExp(
        `/branches/${branchId}/catalog/${productId}/availability$`,
      ).test(url.pathname)
    ) {
      state.availability.set(productId, body.available);
      payload = { availability: { available: body.available } };
    } else {
      status = 404;
      payload = { message: "Not found" };
    }
    return route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  };
  return { route, state };
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const failures = [];
  try {
    const viewports = process.env.VIEWPORTS
      ? process.env.VIEWPORTS.split(",").map(Number)
      : [320, 390, 768, 1024, 1366, 1440, 1920];
    for (const width of viewports) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
      });
      const page = await context.newPage();
      const fixture = apiFixture();
      page.on("pageerror", (error) =>
        failures.push(`${width}px: ${error.message}`),
      );
      await page.route("**/api/**", fixture.route);
      await page.goto(
        `${baseUrl}/dashboard/menu?organizationId=${orgId}&branchId=${branchId}`,
      );
      await page.getByRole("heading", { name: "Katalog boshqaruvi" }).waitFor();
      await page.getByLabel("Kategoriya nomi").fill("Ichimliklar");
      await page.getByLabel("Kategoriya nomi").press("Enter");
      await page.getByText("Kategoriya qo‘shildi.").waitFor();
      await page
        .getByLabel("Nomi", { exact: true })
        .first()
        .fill("Ichimliklar yangi");
      await page.getByRole("button", { name: "Saqlash" }).first().click();
      await page.locator("#product-name").fill("Ko‘k choy");
      await page.getByLabel("Tavsif").fill("Yangi damlangan choy");
      await page.locator("#product-category").selectOption(categoryId);
      await page
        .getByLabel("Mahsulot rasmi kaliti")
        .fill("/images/products/tea.webp");
      await page.getByLabel("Narx (UZS)").first().fill("12.50");
      await page.getByRole("button", { name: "Mahsulot qo‘shish" }).click();
      await page.getByText("Mahsulot qo‘shildi.").waitFor();
      await page.getByText("Ko‘k choy").first().waitFor();
      const record = page
        .locator("details")
        .filter({ has: page.getByText("Ko‘k choy") })
        .first();
      await record.locator("summary").click();
      await record.getByRole("button", { name: /Filialda mavjud/ }).click();
      await page.getByText("Filialdagi mavjudlik yangilandi.").waitFor();
      await record.getByRole("button", { name: "Narxlar tarixi" }).click();
      await record.getByText("12,50 UZS").last().waitFor();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      assert.equal(
        overflow,
        false,
        `${width}px catalog UI must not overflow horizontally`,
      );
      await page.getByRole("button", { name: "Dark" }).click();
      await page.getByRole("button", { name: "Light" }).waitFor();
      await page.getByRole("button", { name: "Light" }).click();
      await page.getByRole("button", { name: "Dark" }).waitFor();
      if (width === 320) {
        await page.screenshot({
          path: path.join(out, "catalog-owner-mobile.png"),
          fullPage: true,
        });
      }
      if (width === 1440) {
        await page.screenshot({
          path: path.join(out, "catalog-owner-desktop.png"),
          fullPage: true,
        });
        fixture.state.staleNextPrice = true;
        await page.locator("input[name=price]").fill("15.00");
        await page
          .locator("input[name=price]")
          .locator("xpath=ancestor::form")
          .getByRole("button", { name: "Saqlash" })
          .click();
        await page
          .getByText(
            "Mahsulot ma’lumotlari saqlandi, lekin narx versiyasi yangilandi.",
          )
          .waitFor();
        await record.getByRole("button", { name: "Arxivlash" }).click();
        await page.getByText("Holat yangilandi.").waitFor();
        const archivedPrice = record.locator("input[name=price]");
        assert.equal(await archivedPrice.isDisabled(), true);
        await record.getByLabel("Tavsif").fill("Arxivlangan tavsif tahriri");
        const priceWritesBeforeArchivedEdit = fixture.state.requests.filter(
          (request) =>
            request.path.endsWith("/price") && request.method === "POST",
        ).length;
        await record.getByRole("button", { name: "Saqlash" }).click();
        await page.getByText("Mahsulot yangilandi.").waitFor();
        assert.equal(
          fixture.state.requests.filter(
            (request) =>
              request.path.endsWith("/price") && request.method === "POST",
          ).length,
          priceWritesBeforeArchivedEdit,
          "Saving archived product metadata must not attempt a price write",
        );
        await page.getByLabel("Til / Язык / Language").selectOption("ru");
        await page
          .getByRole("heading", { name: "Управление каталогом" })
          .waitFor();
        await page.getByLabel("Til / Язык / Language").selectOption("en");
        await page
          .getByRole("heading", { name: "Catalog management" })
          .waitFor();
        assert.ok(
          fixture.state.requests.some(
            (request) =>
              request.path.endsWith("/price") &&
              request.method === "POST" &&
              request.body.expectedPriceVersionId,
          ),
        );
      }
      const alerts = (await page.locator("[role=alert]").allTextContents())
        .map((text) => text.trim())
        .filter(Boolean);
      assert.equal(
        alerts.length,
        0,
        `${width}px alerts: ${alerts.join(" | ")}`,
      );
      await context.close();
    }
    assert.deepEqual(failures, [], "No uncaught browser errors");
    console.log(
      JSON.stringify({
        result: "PASS",
        viewports,
        screenshots: out,
        browserApi: "synthetic fixtures only",
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
