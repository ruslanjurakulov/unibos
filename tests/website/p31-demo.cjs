// Local-only P3.1 UI regression. The guest cart never calls an API.
// Run: UNIBOS_TEST_BASE_URL=http://127.0.0.1:3130 node tests/website/p31-demo.cjs
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const base = new URL(
  process.env.UNIBOS_TEST_BASE_URL ?? "http://127.0.0.1:3130",
);
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) {
  throw new Error("The P3.1 UI regression requires a local test server");
}

const locales = {
  uz: {
    close: "Savatni yopish",
    empty: "Savat hozircha bo‘sh.",
    salad: "Ko‘katli salat",
    remove: "Savatdan olib tashlash",
    unit: "Birlik narxi: $8.50",
    yearly: "Yillik narx tasdiqlanmagan",
  },
  en: {
    close: "Close cart",
    empty: "Your cart is empty.",
    salad: "Garden greens",
    remove: "Remove from cart",
    unit: "Unit price: $8.50",
    yearly: "Annual price is not approved",
  },
  ru: {
    close: "Закрыть корзину",
    empty: "Корзина пока пуста.",
    salad: "Садовая зелень",
    remove: "Удалить из корзины",
    unit: "Цена за единицу: $8.50",
    yearly: "Годовая цена не утверждена",
  },
};

async function makeBrowserPage(browser, path, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  let apiCalls = 0;
  await page.route(`${base.origin}/api/**`, async (route) => {
    apiCalls += 1;
    await route.abort();
  });
  await page.goto(new URL(path, base).href, { waitUntil: "networkidle" });
  return { context, page, apiCalls: () => apiCalls };
}

async function cartFlow(browser, locale, viewport) {
  const { context, page, apiCalls } = await makeBrowserPage(
    browser,
    "/demo/guest",
    viewport,
  );
  const t = locales[locale];
  try {
    await page.locator("#guest-locale").selectOption(locale);
    const trigger = page.getByRole("button", {
      name:
        locale === "uz"
          ? "Savatni ko‘rish"
          : locale === "en"
            ? "Preview cart"
            : "Посмотреть корзину",
    });
    const countText =
      locale === "uz"
        ? "0 taom · $0.00"
        : locale === "en"
          ? "0 items · $0.00"
          : "0 блюд · $0.00";
    await page.getByText(countText).waitFor();
    await page.screenshot({
      path: `/workspace/work/p3.1-after/guest-empty-${locale}-${viewport.width}.png`,
    });

    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByText(t.empty).waitFor();
    const close = dialog.getByRole("button", { name: t.close });
    assert.equal(
      await close.evaluate((element) => element === document.activeElement),
      true,
      "The modal should focus its close control when opened",
    );
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await dialog
        .getByRole("button", {
          name:
            locale === "uz"
              ? "Menyuga qaytish"
              : locale === "en"
                ? "Continue browsing"
                : "Вернуться в меню",
        })
        .evaluate((element) => element === document.activeElement),
      true,
      "Native modal focus should wrap to its last control",
    );
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(
      await trigger.evaluate((element) => element === document.activeElement),
      true,
      "Closing the native dialog should restore focus to its trigger",
    );
    await trigger.click();
    await dialog.waitFor();
    await page.mouse.click(viewport.width - 4, viewport.height - 4);
    await dialog.waitFor({ state: "hidden" });
    assert.equal(
      await trigger.evaluate((element) => element === document.activeElement),
      true,
      "Clicking the modal backdrop should close it and restore focus",
    );

    for (const amount of [1, 1]) {
      await page
        .getByRole("button", {
          name: `${locale === "uz" ? "Demo savatga qo‘shish" : locale === "en" ? "Add to demo cart" : "Добавить в демо-корзину"}: ${t.salad}`,
        })
        .click();
    }
    const secondProduct =
      locale === "uz"
        ? "Qovurilgan baqlajon"
        : locale === "en"
          ? "Charred aubergine"
          : "Запечённый баклажан";
    await page
      .getByRole("button", {
        name: `${locale === "uz" ? "Demo savatga qo‘shish" : locale === "en" ? "Add to demo cart" : "Добавить в демо-корзину"}: ${secondProduct}`,
      })
      .click();
    const populatedCount =
      locale === "uz"
        ? "3 taom · $27.00"
        : locale === "en"
          ? "3 items · $27.00"
          : "3 блюд · $27.00";
    await page.getByText(populatedCount).waitFor();
    await trigger.click();
    await dialog.waitFor();
    const saladLine = dialog.locator(".guest-cart-line").filter({
      hasText: t.salad,
    });
    const aubergineLine = dialog.locator(".guest-cart-line").filter({
      hasText: secondProduct,
    });
    await assertText(saladLine, t.unit);
    await assertText(
      saladLine,
      locale === "uz"
        ? "Jami: $17.00"
        : locale === "en"
          ? "Line total: $17.00"
          : "Сумма: $17.00",
    );
    await assertText(
      dialog,
      locale === "uz" ? "Jami summa" : locale === "en" ? "Total" : "Итого",
    );
    await assertText(dialog, "$27.00");

    await aubergineLine
      .getByRole("button", {
        name: `${locale === "uz" ? "Miqdorni oshirish" : locale === "en" ? "Increase quantity" : "Увеличить количество"}: ${secondProduct}`,
      })
      .click();
    await assertText(dialog, "$37.00");
    await aubergineLine
      .getByRole("button", {
        name: `${locale === "uz" ? "Miqdorni kamaytirish" : locale === "en" ? "Decrease quantity" : "Уменьшить количество"}: ${secondProduct}`,
      })
      .click();
    await assertText(dialog, "$27.00");
    await aubergineLine
      .getByRole("button", { name: `${t.remove}: ${secondProduct}` })
      .click();
    await assertText(dialog, "$17.00");
    await page.screenshot({
      path: `/workspace/work/p3.1-after/guest-populated-${locale}-${viewport.width}.png`,
    });
    await saladLine
      .getByRole("button", { name: `${t.remove}: ${t.salad}` })
      .click();
    await dialog.getByText(t.empty).waitFor();
    await assertText(dialog, "$0.00");
    assert.equal(apiCalls(), 0, "Guest cart must not call any API endpoint");
    await close.click();
    await dialog.waitFor({ state: "hidden" });
    console.log(
      `PASS: cart items, quantities, totals, removal, keyboard, ${locale} ${viewport.width}px`,
    );
  } finally {
    await context.close();
  }
}

async function pricingFlow(browser, locale, viewport) {
  const { context, page } = await makeBrowserPage(
    browser,
    "/pricing",
    viewport,
  );
  try {
    await page.locator("#p3-locale").selectOption(locale);
    const cards = page.locator(".p3-price-card");
    assert.equal(await cards.count(), 3);
    const names = await cards.locator(".p3-plan-name").allTextContents();
    assert.deepEqual(names, ["Basic", "Business", "Pro"]);
    const basic = cards.nth(0);
    const business = cards.nth(1);
    const pro = cards.nth(2);
    await assertText(basic, "Basic");
    await assertText(
      basic,
      locale === "uz"
        ? "Basic tarifi"
        : locale === "en"
          ? "Basic plan"
          : "тарифа Basic",
    );
    assert.match(await pro.innerText(), /499(?:[ ,\u00a0]?000)/);
    await assertText(
      pro,
      locale === "uz" ? "Ombor" : locale === "en" ? "Inventory" : "Склад",
    );
    assert.match(await business.innerText(), /249(?:[ ,\u00a0]?000)/);
    await assertText(
      business,
      locale === "uz" ? "Buyurtma" : locale === "en" ? "Orders" : "Заказы",
    );
    const pageText = await page
      .locator("main")
      .innerText()
      .catch(async () => page.locator(".p3-site").innerText());
    assert.doesNotMatch(
      pageText,
      /349[ ,\u00a0]?000|699[ ,\u00a0]?000|1[ ,\u00a0]?299[ ,\u00a0]?000/,
    );
    assert.equal(
      await page
        .getByRole("button", {
          name:
            locale === "uz"
              ? "Oyma-oy"
              : locale === "en"
                ? "Monthly"
                : "Помесячно",
        })
        .getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `Pricing overflows at ${viewport.width}px`,
    );
    await page.screenshot({
      path: `/workspace/work/p3.1-after/pricing-monthly-${locale}-${viewport.width}.png`,
    });
    await page
      .getByRole("button", {
        name:
          locale === "uz" ? "Yillik" : locale === "en" ? "Annual" : "За год",
      })
      .click();
    for (const card of [basic, pro, business]) {
      await assertText(card, locales[locale].yearly);
    }
    assert.ok(
      (await cards.nth(0).locator("a").getAttribute("href")).includes(
        "/faq#pricing",
      ),
    );
    const theme = page.locator(".p3-theme-toggle");
    await theme.click();
    assert.equal(await page.locator(".p3-dark").count(), 1);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `Dark pricing overflows at ${viewport.width}px`,
    );
    await page.screenshot({
      path: `/workspace/work/p3.1-after/pricing-yearly-dark-${locale}-${viewport.width}.png`,
    });
    console.log(
      `PASS: pricing hypotheses, annual state, CTA, ${locale} ${viewport.width}px`,
    );
  } finally {
    await context.close();
  }
}

async function corporateFlow(browser, path, viewport) {
  const { context, page } = await makeBrowserPage(browser, path, viewport);
  try {
    if (viewport.width === 1440) {
      const slug = path.endsWith("super-admin") ? "super-admin" : "dashboard";
      await page.screenshot({
        path: `/workspace/work/p3.1-after/${slug}-1440.png`,
      });
    }
    const heading = page.locator(".p3-corp-title h1");
    const font = await heading.evaluate(
      (element) => getComputedStyle(element).fontFamily,
    );
    assert.match(
      font,
      /Inter/i,
      `Corporate heading should use Inter, got ${font}`,
    );
    assert.doesNotMatch(font, /Playfair/i);
    for (const locale of ["uz", "ru", "en"]) {
      await page.locator("#corp-locale").selectOption(locale);
      for (const dark of [false, true]) {
        const theme = page.locator(".p3-corp-theme");
        const isDark = (await page.locator(".p3-corp-dark").count()) === 1;
        if (isDark !== dark) await theme.click();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        );
        assert.equal(
          overflow,
          false,
          `${path} overflows at ${viewport.width}px`,
        );
      }
    }
    console.log(
      `PASS: corporate Inter, locale/theme and width ${path} ${viewport.width}px`,
    );
  } finally {
    await context.close();
  }
}

async function assertText(locator, text) {
  await locator.getByText(text, { exact: false }).first().waitFor();
}

(async () => {
  const fs = require("node:fs");
  fs.mkdirSync("/workspace/work/p3.1-after", { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? "/usr/bin/chromium",
  });
  try {
    for (const locale of ["uz", "en", "ru"]) {
      for (const width of [390, 1440]) {
        await cartFlow(browser, locale, { width, height: 900 });
      }
      for (const width of [320, 390, 768, 1440]) {
        await pricingFlow(browser, locale, { width, height: 900 });
      }
    }
    for (const path of ["/demo/dashboard", "/demo/super-admin"]) {
      for (const width of [320, 390, 768, 1440]) {
        await corporateFlow(browser, path, { width, height: 900 });
      }
    }
    const { context, page } = await makeBrowserPage(browser, "/", {
      width: 1440,
      height: 900,
    });
    try {
      const marketingFont = await page
        .locator(".p3-home-hero h1")
        .evaluate((element) => getComputedStyle(element).fontFamily);
      assert.match(marketingFont, /Playfair/i);
      console.log("PASS: marketing heading retains Playfair Display");
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
