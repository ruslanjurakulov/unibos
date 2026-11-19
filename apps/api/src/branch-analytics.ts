import type { PoolClient } from "pg";

export function analyticsDateRange(query: URLSearchParams) {
  const from = query.get("from");
  const to = query.get("to");
  if (query.size !== 2 || !isUtcDate(from) || !isUtcDate(to)) return null;
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  return days >= 1 && days <= 92 ? { from, to } : null;
}

function isUtcDate(value: string | null): value is string {
  if (!value || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return (
    Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

// Every aggregate uses the same statement snapshot and the same verified branch.
// PostgreSQL numeric values stay exact until serialized as decimal strings.
export async function readBranchAnalytics(
  client: PoolClient,
  organizationId: string,
  branchId: string,
  range: { from: string; to: string },
) {
  const result = await client.query(
    `WITH scope AS MATERIALIZED (
       SELECT b.organization_id, b.id AS branch_id,
         ($3::date::timestamp AT TIME ZONE 'UTC') AS starts_at,
         (($4::date + 1)::timestamp AT TIME ZONE 'UTC') AS ends_at
       FROM public.branches b
       WHERE b.organization_id=$1 AND b.id=$2 AND private.org_manager(b.organization_id)
     ), orders_by_currency AS (
       SELECT o.currency_code AS currency,
         count(*) FILTER (WHERE o.status <> 'CANCELLED') AS orders,
         count(*) FILTER (WHERE o.status = 'CANCELLED') AS cancellations,
         sum(o.total_minor) FILTER (WHERE o.status <> 'CANCELLED') AS order_total,
         round(avg(o.total_minor) FILTER (WHERE o.status <> 'CANCELLED')) AS average_order
       FROM scope s JOIN public.orders o USING (organization_id, branch_id)
       WHERE o.created_at >= s.starts_at AND o.created_at < s.ends_at
       GROUP BY o.currency_code
     ), payments AS (
       SELECT p.id, p.organization_id, p.branch_id, p.order_id, p.cashier_user_id,
              p.currency_code, p.amount_minor
       FROM scope s JOIN public.cash_payments p USING (organization_id, branch_id)
       WHERE p.created_at >= s.starts_at AND p.created_at < s.ends_at AND p.status='RECORDED'
     ), ledger_checks AS (
       SELECT p.id, count(l.id) FILTER (WHERE l.currency_code=p.currency_code AND
         l.amount_minor=p.amount_minor AND (
           (l.account_code='CASH_DRAWER' AND l.direction='DEBIT') OR
           (l.account_code='ORDER_RECEIVABLE' AND l.direction='CREDIT')
         )) AS matching_entries
       FROM payments p LEFT JOIN public.cash_payment_ledger_entries l
         ON l.organization_id=p.organization_id AND l.branch_id=p.branch_id AND l.payment_id=p.id
       GROUP BY p.id
     ), settlements AS (
       SELECT p.currency_code AS currency, count(*) AS settlements,
         sum(p.amount_minor) AS settled, count(*) FILTER (WHERE l.matching_entries<>2) AS alerts
       FROM payments p JOIN ledger_checks l USING (id)
       GROUP BY p.currency_code
     ), currency_rows AS (
       SELECT currency, coalesce(o.orders,0) AS "orderCount",
         coalesce(o.cancellations,0) AS "cancelledCount", coalesce(o.order_total,0)::text AS "orderTotalMinor",
         o.average_order::text AS "averageOrderMinor", coalesce(p.settlements,0) AS "settlementCount",
         coalesce(p.settled,0)::text AS "settledMinor", coalesce(p.alerts,0) AS "ledgerAlerts"
       FROM orders_by_currency o FULL JOIN settlements p USING (currency)
     ), paid_lines AS (
       SELECT i.id, i.product_id, i.currency_code AS currency, i.product_name_snapshot, i.created_at,
         i.quantity, i.line_total_minor
       FROM payments p JOIN public.order_items i USING (organization_id, branch_id, order_id)
     ), product_sales AS (
       SELECT product_id, currency, sum(quantity) AS units, sum(line_total_minor) AS total
       FROM paid_lines GROUP BY product_id, currency
     ), ranked_products AS (
       SELECT *, row_number() OVER (PARTITION BY currency ORDER BY units DESC, product_id) AS rank
       FROM product_sales
     ), top_products AS (
       SELECT * FROM ranked_products WHERE rank<=10
     ), snapshot_names AS (
       SELECT DISTINCT ON (l.currency,l.product_id) l.currency,l.product_id,l.product_name_snapshot AS name
       FROM paid_lines l JOIN top_products tp USING (currency,product_id)
       ORDER BY l.currency,l.product_id,l.created_at DESC,l.id DESC
     ), cashier_payments AS (
       SELECT cashier_user_id, currency_code, count(*) AS settlements, sum(amount_minor) AS settled
       FROM payments GROUP BY cashier_user_id, currency_code
     ), closed_shifts AS (
       SELECT sh.cashier_user_id, sh.currency_code, count(*) AS shifts,
         sum(sh.closing_expected_minor) AS expected, sum(sh.counted_cash_minor) AS counted,
         sum(sh.variance_minor) AS variance, count(*) FILTER (WHERE sh.variance_minor<>0) AS alerts
       FROM scope s JOIN public.cash_shifts sh USING (organization_id, branch_id)
       WHERE sh.status='CLOSED' AND sh.closed_at >= s.starts_at AND sh.closed_at < s.ends_at
       GROUP BY sh.cashier_user_id, sh.currency_code
     ), cashier_rows AS (
       SELECT cashier_user_id AS "cashierId", currency_code AS currency,
         coalesce(p.settlements,0) AS "settlementCount", coalesce(p.settled,0)::text AS "settledMinor",
         coalesce(sh.shifts,0) AS "closedShifts", coalesce(sh.expected,0)::text AS "expectedMinor",
         coalesce(sh.counted,0)::text AS "countedMinor", coalesce(sh.variance,0)::text AS "varianceMinor",
         coalesce(sh.alerts,0) AS "varianceAlerts"
       FROM cashier_payments p FULL JOIN closed_shifts sh USING (cashier_user_id, currency_code)
     ), ticket_counts AS (
       SELECT t.status, count(*) AS "ticketCount"
       FROM scope s JOIN public.kitchen_tickets t USING (organization_id, branch_id)
       WHERE t.created_at >= s.starts_at AND t.created_at < s.ends_at GROUP BY t.status
     ), preparation AS (
       SELECT round(avg(extract(epoch FROM finish.created_at - start.created_at))) AS seconds
       FROM scope s JOIN public.kitchen_ticket_events finish USING (organization_id, branch_id)
       JOIN public.kitchen_ticket_events start ON start.organization_id=finish.organization_id
         AND start.branch_id=finish.branch_id AND start.ticket_id=finish.ticket_id
         AND start.version=finish.version-1 AND start.to_status='PREPARING'
       WHERE finish.from_status='PREPARING' AND finish.to_status='READY'
         AND finish.created_at >= s.starts_at AND finish.created_at < s.ends_at
         AND finish.created_at >= start.created_at
     )
     SELECT coalesce((SELECT json_agg(c ORDER BY c.currency) FROM currency_rows c),'[]') AS currencies,
       coalesce((SELECT json_agg(json_build_object(
         'productId',product_id,'name',name,'currency',currency,'quantity',units::text,'totalMinor',total::text)
         ORDER BY currency,rank) FROM top_products JOIN snapshot_names USING (currency,product_id)),'[]') AS products,
       coalesce((SELECT json_agg(c ORDER BY c.currency, c."cashierId") FROM cashier_rows c),'[]') AS cashiers,
       coalesce((SELECT json_agg(t ORDER BY t.status) FROM ticket_counts t),'[]') AS kitchen,
       (SELECT seconds::double precision FROM preparation) AS "averagePreparationSeconds"
     FROM scope`,
    [organizationId, branchId, range.from, range.to],
  );
  if (!result.rows.length) return null;
  return { version: 1, organizationId, branchId, ...range, ...result.rows[0] };
}
