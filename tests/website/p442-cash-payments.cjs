const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const base = new URL(
  process.env.UNIBOS_TEST_BASE_URL ?? "http://127.0.0.1:3130",
);
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) {
  throw new Error("P4.4.2 browser QA requires a local test server");
}

async function main() {
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(new URL("/demo/finance", base).href);
    await page
      .getByRole("heading", { name: "Kassa va naqd to‘lovlar" })
      .waitFor();
    await page.getByText("SUN’IY DEMO · HAQIQIY TO‘LOV EMAS").waitFor();
    await page.getByRole("button", { name: "Smenani ochish" }).click();
    await page
      .getByRole("button", { name: "Demo naqd to‘lovni qayd etish" })
      .waitFor();
    assert.match(await page.locator("body").innerText(), /15,000\.00 UZS/);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.screenshot({
      path: "/workspace/work/p4.4-qa/p442-demo-320.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "/workspace/work/p4.4-qa/p442-demo-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Demo naqd to‘lovni qayd etish" })
      .click();
    await page.getByText("Demo to‘lov qayd etildi").waitFor();
    await page.getByText("DEMO-1").waitFor();
    await page.getByText("85,000.00 UZS", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Smenani yopish" }).click();
    await page
      .getByText("Smena yopiq. Yangi to‘lov uchun smenani qayta oching.")
      .waitFor();
    await page.getByLabel("Til").selectOption("en");
    await page.getByRole("heading", { name: "Cash and payments" }).waitFor();
    await page.locator("button").filter({ hasText: "Light" }).click();
    assert.match(await page.locator("main").getAttribute("class"), /dark/);
    await page.locator("button").filter({ hasText: "Dark" }).click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [320, 390, 768, 1024, 1366, 1440, 1920]) {
      await page.setViewportSize({ width, height: 960 });
      const dimensions = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
      }));
      assert.ok(
        dimensions.document <= dimensions.viewport,
        `horizontal overflow at ${width}px: ${dimensions.document}px`,
      );
    }
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.screenshot({
      path: "/workspace/work/p4.4-qa/p442-demo-desktop.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
