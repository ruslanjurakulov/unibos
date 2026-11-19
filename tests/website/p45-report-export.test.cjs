const assert = require("node:assert/strict");
const test = require("node:test");
const {
  reportSpreadsheetXml,
  reportCsv,
} = require("../../apps/website/app/dashboard/analytics/report.ts");

const report = {
  version: 1,
  organizationId: "org",
  branchId: "branch",
  from: "2026-01-01",
  to: "2026-01-31",
  currencies: [
    {
      currency: "UZS",
      orderCount: 1,
      cancelledCount: 0,
      orderTotalMinor: "9007199254740993",
      averageOrderMinor: null,
      settlementCount: 1,
      settledMinor: "10000",
      ledgerAlerts: 0,
    },
  ],
  products: [
    {
      productId: "0000123",
      name: "=2+2</Data>&\r\n🍲\u0001",
      currency: "UZS",
      quantity: "1.250",
      totalMinor: "10000",
    },
  ],
  cashiers: [
    {
      cashierId: "@cashier",
      currency: "UZS",
      settlementCount: 1,
      settledMinor: "10000",
      closedShifts: 1,
      expectedMinor: "10000",
      countedMinor: "9990",
      varianceMinor: "-10",
      varianceAlerts: 1,
    },
  ],
  kitchen: [{ status: "SERVED", ticketCount: 1 }],
  averagePreparationSeconds: 0,
};

test("SpreadsheetML exports all report sections and preserves exact values and literal product text", () => {
  const xml = reportSpreadsheetXml(report);
  assert.match(xml, /urn:schemas-microsoft-com:office:spreadsheet/);
  for (const header of [
    "organization_id",
    "average_order_minor",
    "product_id",
    "closed_shifts",
    "ticket_status",
    "average_preparation_seconds",
  ]) {
    assert.ok(xml.includes(`<Data ss:Type="String">${header}</Data>`));
  }
  for (const text of [
    "9007199254740993",
    "0000123",
    "@cashier",
    "=2+2&lt;/Data&gt;&amp;&#13;\n🍲�",
  ]) {
    assert.ok(xml.includes(`<Data ss:Type="String">${text}</Data>`));
  }
  for (const amount of ["10000", "-10", "0", "1.250"]) {
    assert.ok(xml.includes(`<Data ss:Type="Number">${amount}</Data>`));
  }
  assert.ok(xml.includes("<Cell/>"));
  assert.ok(!xml.includes("ss:Formula"));
  assert.ok(!xml.includes("\u0001"));
});

test("CSV keeps its existing escaping, decimal strings, row endings and UTF-8 BOM", () => {
  const csv = reportCsv(report);
  assert.ok(
    csv.startsWith(
      '\uFEFF"organization_id","branch_id","from_utc","to_utc"\r\n',
    ),
  );
  assert.ok(csv.includes('"9007199254740993",""'));
  assert.ok(
    csv.includes('"0000123","\'=2+2</Data>&\r\n🍲\u0001","UZS","1.250"'),
  );
  assert.ok(csv.includes('"\'@cashier"'));
  assert.ok(csv.includes('"-10"'));
  assert.ok(csv.endsWith('"average_preparation_seconds"\r\n"0"\r\n'));
});
