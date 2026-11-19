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

export function reportCsv(report: Report): string {
  const rows: string[] = [];
  function add(values: (string | number | null)[], numeric: number[] = []) {
    rows.push(
      values
        .map((v, i) =>
          csvCell(
            v,
            numeric.includes(i) && /^-?\d+(?:\.\d+)?$/.test(String(v)),
          ),
        )
        .join(","),
    );
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
  return "\uFEFF" + rows.join("\r\n") + "\r\n";
}
