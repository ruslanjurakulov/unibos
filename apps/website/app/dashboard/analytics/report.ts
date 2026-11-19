export type Period = "day" | "week" | "month";
export type Report = {
  version: 1;
  organizationId: string;
  branchId: string;
  from: string;
  to: string;
  currencies: {
    currency: string;
    orderCount: number;
    cancelledCount: number;
    orderTotalMinor: string;
    averageOrderMinor: string | null;
    settlementCount: number;
    settledMinor: string;
    ledgerAlerts: number;
  }[];
  products: {
    productId: string;
    name: string;
    currency: string;
    quantity: string;
    totalMinor: string;
  }[];
  cashiers: {
    cashierId: string;
    currency: string;
    settlementCount: number;
    settledMinor: string;
    closedShifts: number;
    expectedMinor: string;
    countedMinor: string;
    varianceMinor: string;
    varianceAlerts: number;
  }[];
  kitchen: { status: string; ticketCount: number }[];
  averagePreparationSeconds: number | null;
};
export const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export function dateRange(anchor: string, period: Period) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) return null;
  const start = new Date(anchor + "T00:00:00Z");
  if (!Number.isFinite(start.getTime()) || isoDate(start) !== anchor)
    return null;
  if (period === "week")
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  if (period === "month") start.setUTCDate(1);
  const end = new Date(start);
  if (period === "week") end.setUTCDate(end.getUTCDate() + 6);
  if (period === "month") end.setUTCMonth(end.getUTCMonth() + 1, 0);
  return { from: isoDate(start), to: isoDate(end) };
}

// Quotes alone do not prevent formulas in spreadsheet software.
function csvCell(value: string | number | null, trustedNumeric = false) {
  let text = String(value ?? "");
  if (
    !trustedNumeric &&
    (/^[\s\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/.test(text))
  )
    text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

type Cell = string | number | null;
type Row = { values: Cell[]; numeric: number[] };

function reportRows(report: Report): Row[] {
  const rows: Row[] = [];
  function add(values: Cell[], numeric: number[] = []) {
    rows.push({ values, numeric });
  }
  add(["organization_id", "branch_id", "from_utc", "to_utc"]);
  add([report.organizationId, report.branchId, report.from, report.to]);
  add([]);
  add([
    "currency",
    "orders",
    "cancelled",
    "order_total_minor",
    "average_order_minor",
    "payments",
    "settled_minor",
    "ledger_discrepancies",
  ]);
  for (const v of report.currencies)
    add(
      [
        v.currency,
        v.orderCount,
        v.cancelledCount,
        v.orderTotalMinor,
        v.averageOrderMinor,
        v.settlementCount,
        v.settledMinor,
        v.ledgerAlerts,
      ],
      [1, 2, 3, 4, 5, 6, 7],
    );
  add([]);
  add([
    "product_id",
    "product",
    "currency",
    "settled_quantity",
    "settled_total_minor",
  ]);
  for (const v of report.products)
    add([v.productId, v.name, v.currency, v.quantity, v.totalMinor], [3, 4]);
  add([]);
  add([
    "cashier_id",
    "currency",
    "payments",
    "settled_minor",
    "closed_shifts",
    "expected_minor",
    "counted_minor",
    "variance_minor",
    "variance_alerts",
  ]);
  for (const v of report.cashiers)
    add(
      [
        v.cashierId,
        v.currency,
        v.settlementCount,
        v.settledMinor,
        v.closedShifts,
        v.expectedMinor,
        v.countedMinor,
        v.varianceMinor,
        v.varianceAlerts,
      ],
      [2, 3, 4, 5, 6, 7, 8],
    );
  add([]);
  add(["ticket_status", "ticket_count"]);
  for (const v of report.kitchen) add([v.status, v.ticketCount], [1]);
  add([]);
  add(["average_preparation_seconds"]);
  add([report.averagePreparationSeconds], [0]);
  return rows;
}

function isReportNumber(value: Cell, numeric: number[], index: number) {
  return numeric.includes(index) && /^-?\d+(?:\.\d+)?$/.test(String(value));
}

export function reportCsv(report: Report): string {
  const rows = reportRows(report).map(({ values, numeric }) =>
    values
      .map((value, index) =>
        csvCell(value, isReportNumber(value, numeric, index)),
      )
      .join(","),
  );
  return "\uFEFF" + rows.join("\r\n") + "\r\n";
}

function xmlText(value: string) {
  // XML 1.0 forbids most control characters and unpaired UTF-16 surrogates.
  return value
    .replace(
      /[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu,
      "\uFFFD",
    )
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\r", "&#13;");
}

export function reportSpreadsheetXml(report: Report): string {
  const rows = reportRows(report).map(({ values, numeric }) => {
    const cells = values.map((value, index) => {
      if (value === null) return "<Cell/>";
      const text = String(value);
      // Excel rounds numeric cells after 15 digits. Keep longer amounts as exact text.
      const asNumber =
        isReportNumber(value, numeric, index) &&
        text.replace(/[-.]/g, "").length <= 15;
      return `<Cell><Data ss:Type="${asNumber ? "Number" : "String"}">${xmlText(text)}</Data></Cell>`;
    });
    return `<Row>${cells.join("")}</Row>`;
  });
  const namespace = "urn:schemas-microsoft-com:office:spreadsheet";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="${namespace}" xmlns:ss="${namespace}"><Worksheet ss:Name="Analytics"><Table>${rows.join("\n")}</Table></Worksheet></Workbook>`;
}
