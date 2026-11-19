import assert from "node:assert/strict";

export async function checkOwnerAnalytics({
  callAs,
  fixture,
  orgA,
  orgB,
  branchA,
  branchA2,
  branchB,
  winnerUser,
  productId,
  from,
  to,
}) {
  const path = (org, branch) =>
    `/api/v1/organizations/${org}/branches/${branch}/analytics`;
  const target = path(orgA, branchA);
  const period = `?from=${from}&to=${to}`;
  const response = await callAs("owner_a", target + period);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const report = await response.json();
  assert.equal(report.organizationId, orgA);
  assert.equal(report.branchId, branchA);
  const uzs = report.currencies.find((row) => row.currency === "UZS");
  // 18,750 initial dine-in + three additions of 14,000 + 28,000 pickup.
  assert.equal(uzs.orderCount, 2);
  assert.equal(uzs.orderTotalMinor, "88750");
  assert.equal(uzs.averageOrderMinor, "44375");
  assert.equal(uzs.settlementCount, 1);
  assert.equal(uzs.settledMinor, "28000");
  assert.equal(uzs.ledgerAlerts, 0);
  assert.equal(report.products.length, 1);
  const item = report.products[0];
  assert.equal(item.productId, productId);
  assert.equal(item.name, "Renamed soup");
  assert.equal(Number(item.quantity), 2);
  assert.equal(item.totalMinor, "28000");
  const cashier = report.cashiers.find(
    (row) => row.cashierId === winnerUser && row.currency === "UZS",
  );
  assert.equal(cashier.settlementCount, 1);
  assert.equal(cashier.settledMinor, "28000");
  const closedShift = report.cashiers.find(
    (row) => row.cashierId === "cashier_a",
  );
  assert.equal(closedShift.closedShifts, 1);
  assert.equal(closedShift.expectedMinor, "14000");
  assert.equal(closedShift.countedMinor, "14000");
  assert.equal(closedShift.varianceMinor, "0");
  assert.equal(closedShift.varianceAlerts, 0);
  assert.equal(
    report.kitchen.find((row) => row.status === "SERVED")?.ticketCount,
    1,
  );
  assert.equal(
    report.kitchen.find((row) => row.status === "CANCELLED")?.ticketCount,
    1,
  );
  assert.equal(typeof report.averagePreparationSeconds, "number");
  assert.ok(report.averagePreparationSeconds >= 0);

  assert.equal((await callAs("multi_scope_a", target + period)).status, 200);
  assert.equal(
    (await callAs("multi_scope_a", path(orgB, branchB) + period)).status,
    403,
  );
  for (const actor of [
    "cashier_a",
    "administrator_a",
    "accountant_a",
    "staff_a",
    "kitchen_a",
    "owner_b",
  ]) {
    assert.equal((await callAs(actor, target + period)).status, 403, actor);
  }
  assert.equal(
    (await callAs("owner_a", path(orgA, branchB) + period)).status,
    403,
  );

  // Populate a fixed UTC interval in the disposable database. Adjacent rows are
  // separated by one PostgreSQL microsecond. The amount exceeds JS's safe integer.
  await fixture.query(
    `INSERT INTO orders(organization_id,branch_id,created_by,fulfillment_type,status,currency_code,subtotal_minor,total_minor,created_at)
    SELECT $1, branch, 'owner_a', 'PICKUP', status, currency, amount, amount, instant
    FROM (VALUES
      ($2::uuid, 'SUBMITTED','USD',17::bigint,'2020-02-28T23:59:59.999999Z'::timestamptz),
      ($2, 'SUBMITTED','USD',9007199254740993,'2020-02-29T00:00:00Z'),
      ($2, 'SUBMITTED','EUR',83,'2020-02-29T23:59:59.999999Z'),
      ($2, 'CANCELLED','EUR',120,'2020-02-29T12:00:00Z'),
      ($2, 'SUBMITTED','EUR',23,'2020-03-01T00:00:00Z'),
      ($3, 'SUBMITTED','EUR',95,'2020-02-29T00:00:00Z'))
    AS rows(branch,status,currency,amount,instant)`,
    [orgA, branchA, branchA2],
  );
  const boundary = await callAs(
    "owner_a",
    target + "?from=2020-02-29&to=2020-02-29",
  );
  assert.equal(boundary.status, 200);
  const fixed = await boundary.json();
  assert.equal(fixed.currencies.length, 2);
  const usd = fixed.currencies.find((row) => row.currency === "USD");
  assert.equal(usd.orderCount, 1);
  assert.equal(usd.orderTotalMinor, "9007199254740993");
  assert.equal(usd.averageOrderMinor, "9007199254740993");
  const eur = fixed.currencies.find((row) => row.currency === "EUR");
  assert.equal(eur.orderCount, 1);
  assert.equal(eur.cancelledCount, 1);
  assert.equal(eur.orderTotalMinor, "83");
  assert.equal(eur.settledMinor, "0");
  assert.deepEqual(fixed.products, []);
  assert.equal(fixed.averagePreparationSeconds, null);
  const other = await callAs(
    "owner_a",
    path(orgA, branchA2) + "?from=2020-02-29&to=2020-02-29",
  );
  assert.equal(other.status, 200);
  const sibling = await other.json();
  assert.equal(sibling.currencies.length, 1);
  assert.equal(sibling.currencies[0].orderTotalMinor, "95");
}
