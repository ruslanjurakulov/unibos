// Local-only P3.2 motion and accessibility regression.
// Run: UNIBOS_TEST_BASE_URL=http://127.0.0.1:3131 node tests/website/p32-motion.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require("playwright");

const base = new URL(
  process.env.UNIBOS_TEST_BASE_URL ?? "http://127.0.0.1:3131",
);
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) {
  throw new Error("The P3.2 motion regression requires a local test server");
}

const evidence = "/workspace/work/p3.2-motion-evidence";
fs.mkdirSync(evidence, { recursive: true });
const routes = [
  ["home", "/"],
  ["solutions", "/solutions"],
  ["demo-hub", "/demo"],
  ["guest", "/demo/guest"],
  ["pricing", "/pricing"],
  ["about", "/about"],
  ["security", "/security"],
  ["faq", "/faq"],
  ["contact", "/contact"],
  ["dashboard", "/demo/dashboard"],
  ["super-admin", "/demo/super-admin"],
  ["investors", "/investors"],
];

async function open(context, path) {
  const page = await context.newPage();
  await page.goto(new URL(path, base).href, { waitUntil: "networkidle" });
  return page;
}

async function motionPreference(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await open(context, "/");
  try {
    await page.waitForTimeout(100);
    assert.equal(
      await page.locator(".p3-site").getAttribute("data-motion-ready"),
      null,
    );
    assert.match(
      await page.locator("h1").innerText(),
      /platform|platforma|платформ/i,
    );
    assert.equal(
      await page
        .locator("h1")
        .evaluate((element) => getComputedStyle(element).animationName),
      "none",
    );
    const reveals = await page
      .locator("[data-motion-reveal]")
      .evaluateAll((items) =>
        items.every((element) => {
          const style = getComputedStyle(element);
          return style.opacity === "1" && style.transform === "none";
        }),
      );
    assert.equal(
      reveals,
      true,
      "Reduced motion must keep every reveal visible",
    );
    await page.screenshot({
      path: `${evidence}/home-reduced-motion.png`,
      fullPage: true,
    });
    console.log(
      "PASS: reduced motion leaves content visible and disables entrance motion",
    );
  } finally {
    await context.close();
  }
}

async function reducedMotionPages(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  try {
    for (const [name, path] of routes) {
      const page = await open(context, path);
      const root = page.locator(".p3-site, .guest-page").first();
      assert.equal(await root.getAttribute("data-motion-ready"), null);
      const revealsAreVisible = await page
        .locator("[data-motion-reveal]")
        .evaluateAll((items) =>
          items.every((element) => {
            const style = getComputedStyle(element);
            return style.opacity === "1" && style.transform === "none";
          }),
        );
      assert.equal(
        revealsAreVisible,
        true,
        `${name} must not hide content with reduced motion enabled`,
      );
      const animatedName = await page
        .locator(".p3-hero-copy h1, .guest-cart-line, .p3-sales-chart i")
        .first()
        .evaluate((element) => getComputedStyle(element).animationName)
        .catch(() => "none");
      assert.equal(animatedName, "none", `${name} should suppress CSS motion`);
      if (name === "solutions") {
        const workflowStep = page
          .locator(".p3-solutions-content [data-motion-reveal]")
          .first();
        await workflowStep.scrollIntoViewIfNeeded();
        await workflowStep.hover();
        assert.equal(
          await workflowStep.evaluate(
            (element) =>
              new DOMMatrix(getComputedStyle(element).transform).isIdentity,
          ),
          true,
          "Reduced motion must suppress workflow hover lift",
        );
        await page.mouse.move(2, 2);
        await workflowStep.focus();
        assert.equal(
          await workflowStep.evaluate(
            (element) =>
              new DOMMatrix(getComputedStyle(element).transform).isIdentity,
          ),
          true,
          "Reduced motion must suppress workflow focus lift",
        );
      }
      await page.screenshot({
        path: `${evidence}/${name}-reduced-motion.png`,
      });
      await page.close();
      console.log(`PASS: reduced motion ${name}`);
    }
  } finally {
    await context.close();
  }
}

async function cinematicSequence(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await context.addInitScript(() => {
    window.__p32Lcp = null;
    window.__p32EventDurations = [];
    if ("PerformanceObserver" in window) {
      const observer = new PerformanceObserver((entries) => {
        const last = entries.getEntries().at(-1);
        if (last) window.__p32Lcp = Math.round(last.startTime);
      });
      observer.observe({ type: "largest-contentful-paint", buffered: true });
      try {
        const eventObserver = new PerformanceObserver((entries) => {
          window.__p32EventDurations.push(
            ...entries.getEntries().map((entry) => Math.round(entry.duration)),
          );
        });
        eventObserver.observe({
          type: "event",
          buffered: true,
          durationThreshold: 16,
        });
      } catch {
        /* Event Timing is not exposed by every Chromium build. */
      }
    }
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  await page.goto(new URL("/", base).href, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(90);
  const headline = page.locator(".p3-hero-copy h1");
  assert.equal(
    await headline.evaluate(
      (element) => getComputedStyle(element).animationName,
    ),
    "p3-copy-enter",
    "Hero headline should use the sequenced entrance animation",
  );
  await page.screenshot({ path: `${evidence}/home-hero-motion-frame.png` });
  await page.waitForTimeout(700);
  await headline.waitFor({ state: "visible" });
  assert.equal(
    await headline.evaluate((element) => getComputedStyle(element).opacity),
    "1",
  );
  await page.screenshot({ path: `${evidence}/home-hero-settled.png` });

  const reveal = page.locator(".p3-home-modules [data-motion-reveal]").first();
  await reveal.scrollIntoViewIfNeeded();
  await page.waitForFunction(
    (selector) =>
      document.querySelector(selector)?.classList.contains("is-motion-visible"),
    await reveal.evaluate((element) =>
      element.matches(".p3-home-modules [data-motion-reveal]")
        ? ".p3-home-modules [data-motion-reveal]"
        : "",
    ),
  );
  await page.waitForTimeout(620);
  assert.equal(
    await reveal.evaluate((element) => getComputedStyle(element).opacity),
    "1",
  );
  await page.screenshot({
    path: `${evidence}/home-scroll-reveal.png`,
    fullPage: true,
  });

  const art = page.locator(".p3-hero-art img");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(80);
  const before = await art.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  await page.evaluate(() => window.scrollTo(0, 260));
  await page.waitForTimeout(80);
  const after = await art.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  assert.notEqual(
    before,
    after,
    "Hero artwork should respond to subtle desktop scroll parallax",
  );
  await page.locator(".p3-theme-toggle").click();
  await page.waitForTimeout(50);
  console.log(
    "PASS: home cinematic entrance, scroll reveal and desktop parallax",
  );

  const cdpMetrics = await cdp.send("Performance.getMetrics");
  const metricMap = Object.fromEntries(
    cdpMetrics.metrics.map(({ name, value }) => [name, value]),
  );
  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const resources = performance
      .getEntriesByType("resource")
      .filter((entry) => /\/_next\/static\/chunks\//.test(entry.name));
    return {
      domContentLoadedMs: Math.round(navigation?.domContentLoadedEventEnd ?? 0),
      loadEventMs: Math.round(navigation?.loadEventEnd ?? 0),
      jsChunkTransferBytes: resources.reduce(
        (sum, entry) =>
          sum + (entry.transferSize || entry.encodedBodySize || 0),
        0,
      ),
      longTaskCount: performance.getEntriesByType("longtask").length,
      longestObservedEventMs: Math.max(0, ...window.__p32EventDurations),
      cls: performance
        .getEntriesByType("layout-shift")
        .filter((entry) => !entry.hadRecentInput)
        .reduce((sum, entry) => sum + entry.value, 0),
      lcpMs: window.__p32Lcp ?? null,
    };
  });
  metrics.jsHeapUsedBytes = Math.round(metricMap.JSHeapUsedSize ?? 0);
  metrics.scriptDurationMs = Math.round((metricMap.ScriptDuration ?? 0) * 1000);
  metrics.taskDurationMs = Math.round((metricMap.TaskDuration ?? 0) * 1000);
  await context.close();
  return metrics;
}

async function pageMatrix(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
  });
  let checked = 0;
  try {
    for (const [name, path] of routes) {
      const page = await open(context, path);
      if (name === "dashboard") {
        const chartBars = page.locator(".p3-sales-chart i");
        assert.ok((await chartBars.count()) > 0);
        assert.match(
          await chartBars
            .first()
            .evaluate((element) => getComputedStyle(element).animationName),
          /corp-chart-enter|none/,
        );
      }
      if (name === "demo-hub") {
        assert.equal(
          await page
            .locator(".p3-content-demoHub [data-motion-reveal]")
            .count(),
          3,
        );
      }
      if (name === "solutions") {
        assert.ok((await page.locator("[data-motion-reveal]").count()) >= 4);
      }
      if (name === "faq") {
        const first = page.locator(".p3-content details").first();
        const marker = first.locator("summary b");
        const summary = first.locator("summary");
        await summary.focus();
        await page.keyboard.press("Enter");
        assert.equal(await first.evaluate((element) => element.open), true);
        await page.waitForTimeout(240);
        assert.notEqual(
          await marker.evaluate(
            (element) => getComputedStyle(element).transform,
          ),
          "none",
        );
        await page.screenshot({ path: `${evidence}/faq-open.png` });
        await page.keyboard.press("Enter");
        assert.equal(await first.evaluate((element) => element.open), false);
      }
      if (name === "guest") {
        const addButton = page
          .getByRole("button", {
            name: /add to demo cart|demo savatga|Добавить/i,
          })
          .first();
        await addButton.focus();
        await page.keyboard.press("Enter");
        assert.match(
          await page.locator(".guest-cart").innerText(),
          /1.*\$8\.50/,
        );
        const preview = page.getByRole("button", {
          name: /preview cart|savatni ko‘rish|Посмотреть/i,
        });
        await preview.focus();
        await page.keyboard.press("Enter");
        await page.waitForTimeout(250);
        assert.equal(
          await page.getByRole("dialog").evaluate((element) => element.open),
          true,
        );
        await page.screenshot({ path: `${evidence}/guest-cart-open.png` });
        const line = page.locator(".guest-cart-line").first();
        await line
          .getByRole("button", {
            name: /remove from cart|savatdan olib tashlash|Удалить из корзины/i,
          })
          .click();
        await page.emulateMedia({ reducedMotion: "reduce" });
        await line.waitFor({ state: "detached" });
        assert.match(await page.getByRole("dialog").innerText(), /\$0\.00/);
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await page.keyboard.press("Escape");
        await page.getByRole("dialog").waitFor({ state: "hidden" });
      }
      if (name === "pricing") {
        const annual = page.getByRole("button", {
          name: /annual|yillik|за год/i,
        });
        await annual.focus();
        await page.keyboard.press("Space");
        assert.equal(await annual.getAttribute("aria-pressed"), "true");
        assert.ok(
          (await page.locator(".p3-price-card").first().innerText()).length > 0,
        );
        await page.screenshot({ path: `${evidence}/pricing-annual.png` });
      }
      if (name === "contact") {
        const cta = page.locator(".p3-contact-card button");
        await cta.focus();
        assert.equal(
          await cta.evaluate((element) => element === document.activeElement),
          true,
        );
        await page.keyboard.press("Enter");
        assert.equal(await page.getByRole("status").count(), 1);
      }
      if (name === "about" || name === "security") {
        assert.ok((await page.locator("[data-motion-reveal]").count()) > 0);
      }
      if (name === "dashboard") {
        assert.match(
          await page
            .locator(".p3-corp-title h1")
            .evaluate((element) => getComputedStyle(element).fontFamily),
          /Inter/i,
        );
      }
      if (name === "investors") {
        assert.equal(
          await page
            .locator(".p3-content-investors [data-motion-reveal]")
            .count(),
          0,
          "Investors page motion should remain unchanged",
        );
      }
      const focusTarget = page
        .locator(
          name === "guest"
            ? ".demo-topbrand"
            : ["dashboard", "super-admin"].includes(name)
              ? ".p3-corp-rail a"
              : ".p3-brand",
        )
        .first();
      await focusTarget.focus();
      await page.keyboard.press("Tab");
      assert.equal(
        await focusTarget.evaluate(
          (element) => element !== document.activeElement,
        ),
        true,
        `${name} should advance focus with Tab`,
      );
      if (name === "super-admin") {
        assert.match(
          await page
            .locator(".p3-corp-title h1")
            .evaluate((element) => getComputedStyle(element).fontFamily),
          /Inter/i,
        );
      }
      await page.screenshot({
        path: `${evidence}/${name}-final.png`,
      });
      await page.close();
      checked += 1;
      console.log(`PASS: motion surfaces and keyboard flow ${name}`);
    }
  } finally {
    await context.close();
  }
  return checked;
}

async function mobilePerformance(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    reducedMotion: "no-preference",
  });
  await context.addInitScript(() => {
    window.__p32Lcp = null;
    window.__p32EventDurations = [];
    if (!("PerformanceObserver" in window)) return;
    const lcpObserver = new PerformanceObserver((entries) => {
      const last = entries.getEntries().at(-1);
      if (last) window.__p32Lcp = Math.round(last.startTime);
    });
    lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
    try {
      const eventObserver = new PerformanceObserver((entries) => {
        window.__p32EventDurations.push(
          ...entries.getEntries().map((entry) => Math.round(entry.duration)),
        );
      });
      eventObserver.observe({
        type: "event",
        buffered: true,
        durationThreshold: 16,
      });
    } catch {
      /* Event Timing is not exposed by every Chromium build. */
    }
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await cdp.send("Performance.enable");
  try {
    await page.goto(new URL("/", base).href, { waitUntil: "networkidle" });
    const scroll = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const intervals = [];
          let started = 0;
          let previous = 0;
          const frame = (time) => {
            if (!started) started = time;
            if (previous) intervals.push(time - previous);
            previous = time;
            const progress = Math.min(1, (time - started) / 900);
            const maxScroll =
              document.documentElement.scrollHeight - window.innerHeight;
            document.documentElement.scrollTop = maxScroll * progress;
            if (progress >= 1) {
              const sorted = intervals.slice().sort((a, b) => a - b);
              resolve({
                frames: intervals.length,
                meanFrameMs: Number(
                  (
                    intervals.reduce((sum, value) => sum + value, 0) /
                    Math.max(1, intervals.length)
                  ).toFixed(1),
                ),
                p95FrameMs: Number(
                  (sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(1),
                ),
                framesOver25ms: intervals.filter((value) => value > 25).length,
              });
              return;
            }
            requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
        }),
    );
    await page.locator(".p3-theme-toggle").click();
    await page.waitForTimeout(80);
    const metricMap = Object.fromEntries(
      (await cdp.send("Performance.getMetrics")).metrics.map(
        ({ name, value }) => [name, value],
      ),
    );
    const navigation = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const resources = performance
        .getEntriesByType("resource")
        .filter((entry) => /\/_next\/static\/chunks\//.test(entry.name));
      return {
        lcpMs: window.__p32Lcp,
        cls: performance
          .getEntriesByType("layout-shift")
          .filter((entry) => !entry.hadRecentInput)
          .reduce((sum, entry) => sum + entry.value, 0),
        longTaskCount: performance.getEntriesByType("longtask").length,
        longestObservedEventMs: Math.max(0, ...window.__p32EventDurations),
        domContentLoadedMs: Math.round(nav?.domContentLoadedEventEnd ?? 0),
        jsChunkTransferBytes: resources.reduce(
          (sum, entry) =>
            sum + (entry.transferSize || entry.encodedBodySize || 0),
          0,
        ),
      };
    });
    return {
      viewport: "390x844, DPR 2",
      cpuThrottleRate: 4,
      ...navigation,
      scroll,
      jsHeapUsedBytes: Math.round(metricMap.JSHeapUsedSize ?? 0),
      scriptDurationMs: Math.round((metricMap.ScriptDuration ?? 0) * 1000),
      taskDurationMs: Math.round((metricMap.TaskDuration ?? 0) * 1000),
    };
  } finally {
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
    await motionPreference(browser);
    await reducedMotionPages(browser);
    const metrics = await cinematicSequence(browser);
    metrics.mobile = await mobilePerformance(browser);
    const pages = await pageMatrix(browser);
    fs.writeFileSync(
      `${evidence}/performance.json`,
      `${JSON.stringify(metrics, null, 2)}\n`,
    );
    console.log(`PASS: ${pages} page motion checks`);
    console.log(`PERFORMANCE: ${JSON.stringify(metrics)}`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
