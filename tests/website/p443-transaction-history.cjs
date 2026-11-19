const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const base = new URL(
  process.env.UNIBOS_TEST_BASE_URL ?? "http://127.0.0.1:3130",
);
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) {
  throw new Error("P4.4.3 browser QA requires a local test server");
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
  await page.route("**/api/me", (route) =>
    route.fulfill({ json: { mfaVerified: true } }),
  );
  await page.route("**/api/v1/me/workspace-capabilities", (route) =>
    route.fulfill({
      json: {
        organizations: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Demo Restaurant",
            roles: [],
            branches: [
              {
                id: "22222222-2222-4222-8222-222222222222",
                name: "Main",
                roles: ["accountant"],
                effectiveRoles: ["accountant"],
                capabilities: ["transactions.read"],
                navigation: [
                  {
                    id: "payments",
                    href: "/dashboard/payments?organizationId=11111111-1111-4111-8111-111111111111&branchId=22222222-2222-4222-8222-222222222222",
                  },
                ],
              },
            ],
          },
        ],
      },
    }),
  );
  await page.route(
    "**/api/v1/organizations/*/branches/*/cash-payments**",
    async (route) => {
      const url = new URL(route.request().url());
      const pageNumber = Number(url.searchParams.get("page") ?? 1);
      await route.fulfill({
        json: {
          mode: "INTEGRATED",
          canRecord: false,
          activeShift: null,
          unpaidOrders: [],
          payments:
            pageNumber === 1
              ? [
                  {
                    id: "pay-12345678",
                    order_id: "order-12345678",
                    shift_id: "shift-12345678",
                    cashier_user_id: "cashier-demo",
                    payment_method: "CASH",
                    payment_status: "RECORDED",
                    order_payment_status: "PAID",
                    currency_code: "UZS",
                    amount_minor: "8500000",
                    cash_received_minor: "10000000",
                    change_minor: "1500000",
                    created_at: "2026-11-16T10:00:00.000Z",
                    table_id: null,
                    table_name: null,
                    order_total_minor: "8500000",
                    items: [
                      {
                        name: "Demo osh",
                        quantity: "2",
                        lineTotalMinor: "8500000",
                      },
                    ],
                    audit_history: [
                      {
                        eventType: "CASH_PAYMENT_RECORDED",
                        actorUserId: "cashier-demo",
                        createdAt: "2026-11-16T10:00:00.000Z",
                      },
                    ],
                  },
                ]
              : [],
          pagination: { page: pageNumber, pageSize: 25, total: 26 },
          reconciliation: {
            total: 1,
            duplicate_payment_orders: 0,
            incomplete_payments: 0,
            unpaid_order_mismatches: 0,
            unmatchedPaidOrders: 0,
            unknownPayments: 0,
            by_currency: [
              {
                currencyCode: "UZS",
                paymentCount: 1,
                paymentTotalMinor: "9007199254740993",
                ledgerCashDebitMinor: "9007199254740993",
                ledgerReceivableCreditMinor: "9007199254740993",
              },
            ],
            shifts: [
              {
                id: "shift-12345678",
                status: "CLOSED",
                currency_code: "UZS",
                cashier_user_id: "cashier-demo",
                expected_cash_minor: "5000000",
                counted_cash_minor: "5000000",
                variance_minor: "0",
                ledger_cash_debit_minor: "8500000",
                ledger_matches: true,
              },
            ],
          },
        },
      });
    },
  );
  try {
    const url = new URL("/dashboard/payments", base);
    url.searchParams.set(
      "organizationId",
      "11111111-1111-4111-8111-111111111111",
    );
    url.searchParams.set("branchId", "22222222-2222-4222-8222-222222222222");
    await page.goto(url.href);
    await page.getByRole("heading", { name: "Naqd to‘lovlar" }).waitFor();
    await page.getByRole("heading", { name: "Yarashtirish" }).waitFor();
    await page.getByText("Demo osh").waitFor();
    await page.getByText(/90,071,992,547,409\.93/).waitFor();
    assert.equal(
      await page
        .getByText(
          "Bu vakolat doirasi moliyaviy tarixni faqat ko‘rishga ruxsat beradi.",
        )
        .count(),
      2,
    );
    await page.locator("p[role='alert']").waitFor({ state: "detached" });
    assert.equal(await page.locator("p[role='alert']").count(), 0);
    await page.screenshot({
      path: "/workspace/work/p4.4-qa/p443-history-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel("To‘lov holati").selectOption("RECORDED");
    await page.getByLabel("Buyurtma ID").fill("order-12345678");
    const filteredRequest = page.waitForRequest((request) => {
      const query = new URL(request.url()).searchParams;
      return (
        request.url().includes("cash-payments") &&
        query.get("paymentStatus") === "RECORDED"
      );
    });
    await page.getByRole("button", { name: "Filtrlash" }).click();
    const filteredApiRequest = await filteredRequest;
    const filteredQuery = new URL(filteredApiRequest.url()).searchParams;
    assert.equal(filteredQuery.get("paymentStatus"), "RECORDED");
    assert.equal(filteredQuery.get("orderId"), "order-12345678");
    const nextRequest = page.waitForRequest(
      (request) => new URL(request.url()).searchParams.get("page") === "2",
    );
    await page.getByRole("button", { name: "Keyingi" }).click();
    const pagedApiRequest = await nextRequest;
    assert.equal(new URL(pagedApiRequest.url()).searchParams.get("page"), "2");
    await page.locator("main > div > header select").selectOption("ru");
    await page.getByRole("heading", { name: "Сверка" }).waitFor();
    await page.locator("main > div > header select").selectOption("en");
    await page.getByRole("heading", { name: "Reconciliation" }).waitFor();
    await page.locator("button").filter({ hasText: "Light" }).click();
    assert.match(await page.locator("main").getAttribute("class"), /dark/);
    await page.locator("button").filter({ hasText: "Dark" }).click();
    assert.doesNotMatch(
      await page.locator("main").getAttribute("class"),
      /dark/,
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [320, 390, 768, 1024, 1366, 1440, 1920]) {
      await page.setViewportSize({ width, height: 960 });
      const dimensions = await page.evaluate(() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
      }));
      assert.ok(
        dimensions.document <= dimensions.viewport,
        `horizontal overflow at ${width}px`,
      );
    }
    await page.getByLabel("Payment status").selectOption("");
    await page.getByLabel("Order ID").fill("");
    const resetRequest = page.waitForRequest((request) => {
      const query = new URL(request.url()).searchParams;
      return (
        request.url().includes("cash-payments") &&
        query.get("page") === "1" &&
        !query.has("orderId")
      );
    });
    await page.getByRole("button", { name: "Apply filters" }).click();
    await resetRequest;
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.screenshot({
      path: "/workspace/work/p4.4-qa/p443-history-desktop.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);

    const cashierPage = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    const cashierErrors = [];
    let rejected = false;
    let cashierPostCount = 0;
    let cashierMode = "conflict";
    const cashierIdempotencyKeys = [];
    cashierPage.on("pageerror", (error) => cashierErrors.push(error.message));
    await cashierPage.route("**/api/me", (route) =>
      route.fulfill({ json: { mfaVerified: true } }),
    );
    await cashierPage.route("**/api/v1/me/workspace-capabilities", (route) =>
      route.fulfill({
        json: {
          organizations: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              name: "Demo Restaurant",
              roles: [],
              branches: [
                {
                  id: "22222222-2222-4222-8222-222222222222",
                  name: "Main",
                  roles: ["cashier"],
                  effectiveRoles: ["cashier"],
                  capabilities: ["payments.cash_record"],
                  navigation: [
                    {
                      id: "payments",
                      href: "/dashboard/payments?organizationId=11111111-1111-4111-8111-111111111111&branchId=22222222-2222-4222-8222-222222222222",
                    },
                  ],
                },
              ],
            },
          ],
        },
      }),
    );
    await cashierPage.route(
      "**/api/v1/organizations/*/branches/*/cash-payments**",
      async (route) => {
        if (route.request().method() === "POST") {
          cashierPostCount += 1;
          cashierIdempotencyKeys.push(
            route.request().postDataJSON().idempotencyKey,
          );
          if (cashierMode === "conflict") {
            rejected = true;
            await route.fulfill({
              status: 409,
              json: { code: "ORDER_NOT_PAYABLE" },
            });
          } else if (cashierPostCount === 1) {
            rejected = true;
            await route.fulfill({
              status: 500,
              json: { code: "UNKNOWN_RESULT" },
            });
          } else {
            rejected = true;
            await route.fulfill({
              status: 201,
              json: { payment: { id: "pay-retry" } },
            });
          }
          return;
        }
        await route.fulfill({
          json: {
            mode: "INTEGRATED",
            canRecord: true,
            activeShift: {
              id: "shift-active",
              currency_code: "UZS",
              version: 1,
            },
            unpaidOrders: rejected
              ? []
              : [
                  {
                    id: "order-raced",
                    status: "SUBMITTED",
                    currency_code: "UZS",
                    total_minor: "8500000",
                    created_at: "2026-11-16T10:00:00.000Z",
                    table_id: null,
                    items: [
                      {
                        name: "Demo osh",
                        quantity: "1",
                        lineTotalMinor: "8500000",
                      },
                    ],
                  },
                ],
            payments: rejected
              ? [
                  {
                    id: "pay-winner",
                    order_id: "order-raced",
                    shift_id: "shift-active",
                    cashier_user_id: "other-cashier",
                    payment_method: "CASH",
                    payment_status: "RECORDED",
                    order_payment_status: "PAID",
                    currency_code: "UZS",
                    amount_minor: "8500000",
                    cash_received_minor: "8500000",
                    change_minor: "0",
                    created_at: "2026-11-16T10:00:00.000Z",
                    table_id: null,
                    table_name: null,
                    order_total_minor: "8500000",
                    items: [
                      {
                        name: "Demo osh",
                        quantity: "1",
                        lineTotalMinor: "8500000",
                      },
                    ],
                    audit_history: [
                      {
                        eventType: "CASH_PAYMENT_RECORDED",
                        actorUserId: "other-cashier",
                        createdAt: "2026-11-16T10:00:00.000Z",
                      },
                    ],
                  },
                ]
              : [],
            pagination: { page: 1, pageSize: 25, total: rejected ? 1 : 0 },
            reconciliation: {
              total: rejected ? 1 : 0,
              duplicate_payment_orders: 0,
              incomplete_payments: 0,
              unpaid_order_mismatches: 0,
              unmatchedPaidOrders: 0,
              unknownPayments: 0,
              by_currency: rejected
                ? [
                    {
                      currencyCode: "UZS",
                      paymentCount: 1,
                      paymentTotalMinor: "8500000",
                      ledgerCashDebitMinor: "8500000",
                      ledgerReceivableCreditMinor: "8500000",
                    },
                  ]
                : [],
              shifts: [],
            },
          },
        });
      },
    );
    try {
      const cashierUrl = new URL("/dashboard/payments", base);
      cashierUrl.searchParams.set(
        "organizationId",
        "11111111-1111-4111-8111-111111111111",
      );
      cashierUrl.searchParams.set(
        "branchId",
        "22222222-2222-4222-8222-222222222222",
      );
      await cashierPage.goto(cashierUrl.href);
      await cashierPage
        .getByRole("heading", { name: "Naqd to‘lovlar" })
        .waitFor();
      await cashierPage.getByText("Demo osh").waitFor();
      await cashierPage.getByLabel("Mijoz bergan naqd pul").fill("85000");
      const postRequest = cashierPage.waitForRequest(
        (request) =>
          request.method() === "POST" &&
          request.url().includes("cash-payments/orders"),
      );
      await cashierPage
        .getByRole("button", { name: "Naqd to‘lovni qayd etish" })
        .click();
      await postRequest;
      await cashierPage
        .getByText(
          "Buyurtma holati o‘zgargan. Tarix yangilandi; to‘lovni qayta yuborishdan oldin buyurtmani tekshiring.",
        )
        .waitFor();
      await cashierPage.getByText("To‘lanmagan buyurtma yo‘q.").waitFor();
      assert.equal(
        await cashierPage
          .getByRole("button", { name: "Shu to‘lovni xavfsiz qayta yuborish" })
          .count(),
        0,
      );
      assert.equal(
        await cashierPage.evaluate(() =>
          sessionStorage.getItem("unibos.cash-payment.pending"),
        ),
        null,
      );
      assert.equal(
        await cashierPage
          .locator("body")
          .getAttribute("data-unibos-workspace-locked"),
        null,
      );
      cashierMode = "ambiguous";
      cashierPostCount = 0;
      cashierIdempotencyKeys.length = 0;
      rejected = false;
      await cashierPage.reload();
      await cashierPage.getByText("Demo osh").waitFor();
      await cashierPage.getByLabel("Mijoz bergan naqd pul").fill("85000");
      await cashierPage
        .getByRole("button", { name: "Naqd to‘lovni qayd etish" })
        .click();
      const unknownOutcome = cashierPage.getByText(
        "Server javobi noma’lum. Xuddi shu amal kaliti bilan xavfsiz qayta urinishingiz mumkin.",
        { exact: true },
      );
      await unknownOutcome.waitFor();
      assert.equal(await unknownOutcome.count(), 1);
      assert.notEqual(
        await cashierPage.evaluate(() =>
          sessionStorage.getItem("unibos.cash-payment.pending"),
        ),
        null,
      );
      assert.equal(
        await cashierPage
          .locator("body")
          .getAttribute("data-unibos-workspace-locked"),
        "true",
      );
      await cashierPage
        .getByRole("button", { name: "Shu to‘lovni xavfsiz qayta yuborish" })
        .click();
      await cashierPage.getByText("To‘lov qayd etildi").waitFor();
      assert.equal(cashierIdempotencyKeys.length, 2);
      assert.equal(cashierIdempotencyKeys[0], cashierIdempotencyKeys[1]);
      assert.equal(
        await cashierPage.evaluate(() =>
          sessionStorage.getItem("unibos.cash-payment.pending"),
        ),
        null,
      );
      assert.equal(
        await cashierPage
          .locator("body")
          .getAttribute("data-unibos-workspace-locked"),
        null,
      );
      rejected = false;
      cashierMode = "conflict";
      cashierPostCount = 0;
      cashierIdempotencyKeys.length = 0;
      await cashierPage.addInitScript(() => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key === "unibos.cash-payment.pending")
            throw new DOMException("Storage disabled", "QuotaExceededError");
          return original.call(this, key, value);
        };
      });
      await cashierPage.reload();
      await cashierPage.getByText("Demo osh").waitFor();
      await cashierPage.getByLabel("Mijoz bergan naqd pul").fill("85000");
      await cashierPage
        .getByRole("button", { name: "Naqd to‘lovni qayd etish" })
        .click();
      await cashierPage
        .getByText(
          "Brauzer xavfsiz qayta urinish kalitini saqlay olmadi. To‘lov yuborilmadi; sessiya xotirasi ruxsatini tekshiring.",
        )
        .waitFor();
      assert.equal(cashierPostCount, 0);
      assert.equal(
        await cashierPage.evaluate(() =>
          sessionStorage.getItem("unibos.cash-payment.pending"),
        ),
        null,
      );
      assert.equal(
        await cashierPage
          .locator("body")
          .getAttribute("data-unibos-workspace-locked"),
        null,
      );
      assert.deepEqual(cashierErrors, []);
    } finally {
      await cashierPage.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
