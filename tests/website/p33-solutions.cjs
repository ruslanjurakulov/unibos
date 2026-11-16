// Local-only P3.3 visual and responsive regression for the Solutions page.
// Run: UNIBOS_TEST_BASE_URL=http://127.0.0.1:3131 node tests/website/p33-solutions.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require("playwright");

const base = new URL(
  process.env.UNIBOS_TEST_BASE_URL ?? "http://127.0.0.1:3131",
);
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) {
  throw new Error("The P3.3 Solutions regression requires a local test server");
}

const evidence = "/workspace/work/p3.3-solutions-evidence";
fs.mkdirSync(evidence, { recursive: true });

const widths = [320, 390, 768, 1440, 1920];
const locales = ["uz", "ru", "en"];
const titles = {
  uz: "Restoraningiz uchun to‘liq ekotizim",
  ru: "Полная экосистема для вашего ресторана",
  en: "A complete ecosystem for your restaurant",
};
const showcaseNames = {
  uz: [
    "Buyurtma boshqaruvi",
    "Stol va zal boshqaruvi",
    "Menyu (QR/NFC)",
    "Ombor va ta’minot",
    "Xodimlar va ish vaqti",
    "Hisobot va moliya",
  ],
  ru: [
    "Управление заказами",
    "Зал и столы",
    "Меню (QR/NFC)",
    "Склад и поставки",
    "Команда и смены",
    "Отчёты и финансы",
  ],
  en: [
    "Order management",
    "Tables and floor",
    "Menu (QR/NFC)",
    "Inventory and supply",
    "Team and work hours",
    "Reports and finance",
  ],
};

function allRevealsVisible(elements) {
  return elements.every((element) => {
    const style = getComputedStyle(element);
    return style.opacity === "1" && new DOMMatrix(style.transform).isIdentity;
  });
}

async function runContext(browser, reducedMotion) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (!request.url().startsWith(base.origin)) {
      errors.push(`Unexpected external request: ${request.url()}`);
    }
  });

  try {
    const response = await page.goto(new URL("/solutions", base).href, {
      waitUntil: "networkidle",
    });
    assert.equal(response.status(), 200);
    if (reducedMotion === "no-preference") {
      const performance = await page.evaluate(() => {
        const navigation = window.performance.getEntriesByType("navigation")[0];
        const chunks = window.performance
          .getEntriesByType("resource")
          .filter((entry) => /\/_next\/static\/chunks\//.test(entry.name));
        return {
          domContentLoadedMs: Math.round(
            navigation?.domContentLoadedEventEnd ?? 0,
          ),
          jsChunkBytes: chunks.reduce(
            (total, entry) =>
              total + (entry.transferSize || entry.encodedBodySize || 0),
            0,
          ),
          resourceCount: performance.getEntriesByType("resource").length,
        };
      });
      assert.ok(
        performance.domContentLoadedMs < 5000,
        `Solutions DOMContentLoaded exceeded 5 seconds: ${performance.domContentLoadedMs}ms`,
      );
      assert.ok(
        performance.jsChunkBytes < 4_000_000,
        `Solutions JavaScript chunks exceeded 4 MB: ${performance.jsChunkBytes}`,
      );
      fs.writeFileSync(
        `${evidence}/solutions-performance.json`,
        `${JSON.stringify(performance, null, 2)}\n`,
      );
    }
    await page.locator(".p3-solutions-hero h1").waitFor();
    const locale = page.locator("#p3-locale");
    const theme = page.locator(".p3-theme-toggle");
    const hero = page.locator(".p3-solutions-hero");
    const cards = hero.locator("a[data-motion-reveal]");
    const moduleCards = page.locator(
      ".p3-solutions-more section[class*=moduleSection] > div > a",
    );

    const firstCard = cards.first();
    await firstCard.focus();
    assert.equal(
      await firstCard.evaluate((element) => element === document.activeElement),
      true,
      "Hero links must be keyboard-focusable",
    );
    assert.ok(
      (await firstCard.getAttribute("href"))?.startsWith("/"),
      "Hero links must have a local destination",
    );
    await page.keyboard.press("Enter");
    await page.waitForURL("**/demo/guest");
    await page.goBack({ waitUntil: "networkidle" });

    for (const width of widths) {
      await page.setViewportSize({
        width,
        height: width < 500 ? 844 : width < 900 ? 1024 : 900,
      });
      for (const lang of locales) {
        await locale.selectOption(lang);
        assert.equal(await page.locator("main").getAttribute("lang"), lang);
        assert.equal(
          (await hero.locator("h1").innerText()).trim(),
          titles[lang],
        );
        assert.equal(
          await cards.count(),
          6,
          "The hero keeps six reference cards",
        );
        assert.equal(
          await moduleCards.count(),
          11,
          "The complete product module list remains below the hero",
        );

        for (const name of showcaseNames[lang]) {
          assert.ok(
            (await hero.getByRole("link", { name }).count()) > 0,
            `Missing ${lang} hero card: ${name}`,
          );
        }

        for (const appearance of ["light", "dark"]) {
          let dark = (await page.locator(".p3-dark").count()) > 0;
          if ((appearance === "dark") !== dark) {
            await theme.click();
            dark = (await page.locator(".p3-dark").count()) > 0;
          }
          assert.equal(dark, appearance === "dark");

          const state = await page.evaluate(() => {
            const root = document.querySelector(".p3-site");
            const featureCards = [
              ...document.querySelectorAll(
                ".p3-solutions-hero a[data-motion-reveal]",
              ),
            ];
            return {
              viewport: innerWidth,
              document: Math.max(
                document.documentElement.scrollWidth,
                document.body.scrollWidth,
              ),
              motionReady: root?.getAttribute("data-motion-ready") ?? null,
              revealsVisible: featureCards.every((element) => {
                const style = getComputedStyle(element);
                return (
                  style.opacity === "1" &&
                  new DOMMatrix(style.transform).isIdentity
                );
              }),
              cardBackground: featureCards[1]
                ? getComputedStyle(featureCards[1]).backgroundColor
                : null,
              contrast: featureCards.map((card) =>
                (() => {
                  const parse = (value) =>
                    value
                      .match(/[\d.]+/g)
                      .slice(0, 3)
                      .map(Number);
                  const luminance = (value) => {
                    const [red, green, blue] = parse(value).map((channel) => {
                      const normalized = channel / 255;
                      return normalized <= 0.04045
                        ? normalized / 12.92
                        : ((normalized + 0.055) / 1.055) ** 2.4;
                    });
                    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
                  };
                  const ratio = (foreground, background) => {
                    const colors = [
                      luminance(foreground),
                      luminance(background),
                    ].sort((a, b) => b - a);
                    return (colors[0] + 0.05) / (colors[1] + 0.05);
                  };
                  const background = getComputedStyle(card).backgroundColor;
                  return [
                    ratio(getComputedStyle(card).color, background),
                    ratio(
                      getComputedStyle(card.querySelector("p")).color,
                      background,
                    ),
                    ratio(
                      getComputedStyle(card.querySelector("svg")).color,
                      background,
                    ),
                    ratio(
                      getComputedStyle(card.querySelector("span")).color,
                      background,
                    ),
                  ];
                })(),
              ),
              cardBounds: featureCards.map((card) => {
                const bounds = card.getBoundingClientRect();
                return { top: bounds.top, bottom: bounds.bottom };
              }),
              brokenImages: [...document.images]
                .filter((image) => image.complete && image.naturalWidth === 0)
                .map((image) => image.src),
            };
          });

          assert.ok(
            state.document <= width,
            `Horizontal overflow at ${width}px/${lang}/${appearance}/${reducedMotion}`,
          );
          assert.equal(state.brokenImages.length, 0);
          assert.ok(
            state.contrast.flat().every((ratio) => ratio >= 4.5),
            `Card text/icon contrast fell below 4.5:1 at ${width}px/${lang}/${appearance}: ${JSON.stringify(state.contrast)}`,
          );
          if (width === 1440 && lang === "uz" && appearance === "light") {
            assert.ok(
              state.cardBounds.every(
                (bounds) => bounds.top >= 0 && bounds.bottom <= 900,
              ),
              "All six solution cards should fit in the 1440x900 first screen",
            );
          }
          if (reducedMotion === "reduce") {
            assert.equal(state.motionReady, null);
            assert.equal(state.revealsVisible, true);
          }
          if (width === 1440 && lang === "uz" && appearance === "light") {
            await page.screenshot({
              path: `${evidence}/solutions-after-1440.png`,
              fullPage: false,
            });
          }
          if (width === 320 && lang === "uz" && appearance === "light") {
            await page.screenshot({
              path: `${evidence}/solutions-after-320.png`,
              fullPage: false,
            });
          }
          if (width === 1440 && lang === "uz" && appearance === "dark") {
            await page.screenshot({
              path: `${evidence}/solutions-after-dark.png`,
              fullPage: false,
            });
          }
        }
      }
    }

    if (reducedMotion === "reduce") {
      await page.setViewportSize({ width: 1440, height: 900 });
      await locale.selectOption("uz");
      if ((await page.locator(".p3-dark").count()) > 0) await theme.click();
      await page.locator(".p3-solutions-hero").evaluate((element) => {
        element.scrollIntoView({ block: "start" });
      });
      const allVisible = await page
        .locator("[data-motion-reveal]")
        .evaluateAll(allRevealsVisible);
      assert.equal(allVisible, true);
      await page.screenshot({
        path: `${evidence}/solutions-after-reduced-motion.png`,
        fullPage: false,
      });
    }
  } finally {
    assert.deepEqual(errors, [], "No page errors or external requests");
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    await runContext(browser, "no-preference");
    console.log("PASS: Solutions 30 locale/theme/viewport states");
    await runContext(browser, "reduce");
    console.log(
      "PASS: Solutions 30 reduced-motion locale/theme/viewport states",
    );
    console.log(
      "PASS: six hero cards, all 11 lower modules, no overflow or broken image",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
