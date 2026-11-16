// P4.3.1 route discovery and demo navigation regression.
// Run against a local website on loopback only.
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const base = new URL(
  process.env.UNIBOS_TEST_BASE_URL ?? "http://127.0.0.1:3130",
);
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) {
  throw new Error("P4.3.1 navigation QA requires a local test server");
}

const paths = [
  "/",
  "/solutions",
  "/pricing",
  "/about",
  "/contact",
  "/security",
  "/faq",
  "/investors",
  "/sign-in",
  "/sign-up",
  "/dashboard",
  "/dashboard/pos",
  "/dashboard/waiter",
  "/dashboard/kitchen",
  "/demo",
  "/demo/dashboard",
  "/demo/workspace",
  "/demo/super-admin",
  "/demo/operations",
  "/demo/pos",
  "/demo/service",
  "/demo/guest",
];

async function main() {
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const errors = [];
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(new URL("/demo", base).href, { waitUntil: "networkidle" });
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of [
      "/demo/dashboard",
      "/demo/guest",
      "/demo/super-admin",
      "/demo/operations",
      "/demo/pos",
      "/demo/service",
    ]) {
      const link = page.locator(`a[href="${route}"]`).first();
      await link.waitFor();
      assert.equal(
        await link.isVisible(),
        true,
        `${route} should be discoverable from Demo Hub`,
      );
    }
    assert.equal(
      await page.locator(".p3-content-demoHub article").count(),
      6,
      "Demo Hub lists six implemented demo paths",
    );
    assert.equal(
      await page
        .locator('.p3-nav a[href="/demo"]')
        .getAttribute("aria-current"),
      "page",
      "Desktop navigation marks the active Demo Hub destination",
    );

    for (const locale of ["uz", "ru", "en"]) {
      await page.locator("#p3-locale").selectOption(locale);
      await page.waitForTimeout(50);
      assert.equal(
        await page.locator(".p3-content-demoHub article").count(),
        6,
        `${locale} keeps all demo paths`,
      );
    }

    await page.goto(new URL("/demo/pos", base).href, {
      waitUntil: "networkidle",
    });
    await page.getByRole("link", { name: "Barcha demolar" }).click();
    await page.waitForURL("**/demo");
    await page.goBack();
    await page.waitForURL("**/demo/pos");
    await page.goForward();
    await page.waitForURL("**/demo");

    await page.goto(new URL("/demo/guest", base).href, {
      waitUntil: "networkidle",
    });
    const locale = page.locator("#guest-locale");
    for (const language of ["uz", "ru", "en"]) {
      await locale.selectOption(language);
      const label =
        language === "uz"
          ? "Barcha demolar"
          : language === "ru"
            ? "Все демо"
            : "All demos";
      await page.getByRole("link", { name: label }).first().waitFor();
      await page.getByRole("link", { name: label }).first().click();
      await page.waitForURL("**/demo");
      await page.goBack();
      await page.waitForURL("**/demo/guest");
    }

    await page.goto(new URL("/demo/service", base).href, {
      waitUntil: "networkidle",
    });
    for (const role of ["Kassir", "Oshxona", "Ofitsiant"]) {
      const roleButton = page.getByRole("button", {
        name: new RegExp(role, "i"),
      });
      await roleButton.click();
      assert.equal(
        await roleButton.getAttribute("aria-pressed"),
        "true",
        `The ${role} role is selected in the shared service demo page`,
      );
    }
    await page.locator('header a[href="/demo"]').click();
    await page.waitForURL("**/demo");

    for (const route of paths) {
      const response = await page.request.get(new URL(route, base).href);
      assert.ok(
        response.status() === 200,
        `${route} returned ${response.status()}`,
      );
      await page.goto(new URL(route, base).href, {
        waitUntil: "domcontentloaded",
      });
      const links = await page
        .locator("a[href]")
        .evaluateAll((anchors) =>
          anchors.map((anchor) => anchor.getAttribute("href")).filter(Boolean),
        );
      for (const href of links) {
        const destination = new URL(href, base);
        if (
          destination.origin !== base.origin ||
          destination.pathname.startsWith("/api/")
        )
          continue;
        assert.ok(
          paths.includes(destination.pathname),
          `${route} contains an internal link to unlisted route ${destination.pathname}`,
        );
      }
    }

    await page.goto(new URL("/demo", base).href, { waitUntil: "networkidle" });
    const menuLabels = {
      uz: ["Navigatsiyani ochish", "Navigatsiyani yopish"],
      ru: ["Открыть навигацию", "Закрыть навигацию"],
      en: ["Open navigation", "Close navigation"],
    };
    for (const locale of ["uz", "ru", "en"]) {
      await page.locator("#p3-locale").selectOption(locale);
      await page.getByRole("button", { name: menuLabels[locale][0] }).click();
      assert.equal(
        await page
          .locator("#p3-main-nav a")
          .first()
          .evaluate((element) => element === document.activeElement),
        true,
        `${locale}: opening mobile navigation moves focus into the menu`,
      );
      assert.equal(
        await page
          .locator('#p3-main-nav a[href="/demo"]')
          .getAttribute("aria-current"),
        "page",
        `${locale}: mobile navigation marks the active destination`,
      );
      await page.keyboard.press("Escape");
      assert.equal(
        await page
          .getByRole("button", { name: menuLabels[locale][0] })
          .getAttribute("aria-expanded"),
        "false",
        `${locale}: Escape closes the mobile menu`,
      );
      assert.equal(
        await page
          .getByRole("button", { name: menuLabels[locale][0] })
          .evaluate((element) => element === document.activeElement),
        true,
        `${locale}: Escape restores focus to the menu toggle`,
      );
    }

    for (const width of [320, 390, 768, 1024, 1366, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      assert.equal(
        overflow,
        false,
        `Demo Hub has no horizontal overflow at ${width}px`,
      );
    }

    assert.deepEqual(errors, [], "No uncaught browser runtime errors");
    console.log(
      `PASS: six demo entries, UZ/RU/EN hub and mobile menu, POS and guest return paths, service role selection, ${paths.length} routes return HTTP 200, seven viewport widths have no overflow`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
