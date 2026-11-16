// Local browser regression for the synthetic cashier → kitchen → waiter flow.
// Run against a loopback web server: UNIBOS_TEST_BASE_URL=http://127.0.0.1:3132 node tests/website/p43-service.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require("playwright");

const base = new URL(
  process.env.UNIBOS_TEST_BASE_URL ?? "http://127.0.0.1:3132",
);
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname))
  throw new Error("P4.3 browser test is local-only");
const evidence = "/workspace/work/p4.3-qa";
fs.mkdirSync(evidence, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    for (const width of [320, 390, 768, 1024, 1366, 1440, 1920]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        hasTouch: width === 390,
        isMobile: width === 390,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      await page.goto(new URL("/demo/service", base).href, {
        waitUntil: "networkidle",
      });
      const createOrder = page.getByRole("button", {
        name: "Demo buyurtma yaratish",
      });
      if (width === 390) await createOrder.tap();
      else await createOrder.click();
      if (width === 390)
        await page.screenshot({
          path: `${evidence}/cashier-order-390.png`,
          fullPage: true,
        });
      if (width === 1440)
        await page.screenshot({
          path: `${evidence}/cashier-order-1440.png`,
          fullPage: true,
        });
      const waiterTab = page.getByRole("button", {
        name: "Ofitsiant",
        exact: true,
      });
      if (width === 320) {
        const kitchenTab = page.getByRole("button", {
          name: "Oshxona",
          exact: true,
        });
        await kitchenTab.focus();
        await page.keyboard.press("Enter");
        assert.equal(await kitchenTab.getAttribute("aria-pressed"), "true");
        assert.equal(
          await page
            .locator("button")
            .evaluateAll((buttons) =>
              buttons.every((button) =>
                Boolean(
                  button.getAttribute("aria-label") || button.innerText.trim(),
                ),
              ),
            ),
          true,
          "Every button has an accessible name",
        );
        await waiterTab.click();
      } else {
        await page
          .getByRole("button", { name: "Ofitsiant", exact: true })
          .click();
      }
      await page.getByRole("button", { name: "Oshxonaga yuborish" }).click();
      await page.getByRole("button", { name: "Oshxona", exact: true }).click();
      const originalTicket = page
        .locator("article")
        .filter({ hasText: "#2401" });
      await originalTicket
        .getByRole("button", { name: "Qabul qilish" })
        .click();
      await originalTicket
        .getByRole("button", { name: "Tayyorlashni boshlash" })
        .click();
      await originalTicket
        .getByRole("button", { name: "Tayyor deb belgilash" })
        .click();
      if (width === 390)
        await page.screenshot({
          path: `${evidence}/kitchen-ready-390.png`,
          fullPage: true,
        });
      if (width === 1440)
        await page.screenshot({
          path: `${evidence}/kitchen-ready-1440.png`,
          fullPage: true,
        });
      await waiterTab.click();
      const readyTicket = page.locator("article").filter({ hasText: "#2401" });
      assert.equal(await readyTicket.count(), 1);
      if (width === 390)
        await page.screenshot({
          path: `${evidence}/waiter-ready-390.png`,
          fullPage: true,
        });
      await readyTicket
        .getByRole("button", { name: "Mijozga yetkazildi" })
        .click();
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      assert.equal(overflow, false, `No horizontal overflow at ${width}px`);
      assert.match(
        await page.locator("[role=status]").innerText(),
        /yetkazildi/i,
      );
      assert.equal(await page.getByText("#2401").count(), 0);
      assert.equal(await page.getByText("#2402").count(), 1);
      await page.getByRole("button", { name: "Oshxona", exact: true }).click();
      const addedTicket = page.locator("article").filter({ hasText: "#2402" });
      await addedTicket.getByRole("button", { name: "Qabul qilish" }).click();
      await addedTicket
        .getByRole("button", { name: "Tayyorlashni boshlash" })
        .click();
      await addedTicket
        .getByRole("button", { name: "Tayyor deb belgilash" })
        .click();
      await waiterTab.click();
      const addedReadyTicket = page
        .locator("article")
        .filter({ hasText: "#2402" });
      await addedReadyTicket
        .getByRole("button", { name: "Mijozga yetkazildi" })
        .click();
      assert.equal(await page.getByText("#2402").count(), 0);
      if (width === 390) {
        await page.screenshot({
          path: `${evidence}/service-mobile-390.png`,
          fullPage: true,
        });
        await page.getByLabel("Til").selectOption("ru");
        assert.equal(
          await page.getByRole("heading", { level: 1 }).innerText(),
          "Поток заказа",
        );
        await page.getByLabel("Язык").selectOption("en");
        assert.equal(
          await page.getByRole("heading", { level: 1 }).innerText(),
          "Order flow",
        );
        await page.getByRole("button", { name: /theme: light/i }).click();
        assert.equal(
          await page
            .locator("main")
            .evaluate((el) => getComputedStyle(el).backgroundColor),
          "rgb(23, 33, 29)",
        );
        await page.screenshot({
          path: `${evidence}/service-mobile-dark.png`,
          fullPage: true,
        });
      }
      if (width === 1440)
        await page.screenshot({
          path: `${evidence}/service-desktop-1440.png`,
          fullPage: true,
        });
      await context.close();
      console.log(
        `PASS: cashier → kitchen → waiter flow, reduced motion and no horizontal overflow at ${width}px`,
      );
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
