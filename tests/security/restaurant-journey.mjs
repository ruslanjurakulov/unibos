import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { verifyHostedJourneyReplay } from "./hosted-journey-replay.mjs";

// Only the parent test provisions the disposable database. Every action below
// goes through the running API with the corresponding user's session cookies.
export async function restaurantJourney({
  owner,
  newClient,
  enroll,
  password,
  org,
  branch,
}) {
  const organization = `/api/organizations/${org}`;
  const catalog = organization + "/catalog";
  const location = organization + "/branches/" + branch;
  const ops = `/api/v1/organizations/${org}/branches/${branch}`;
  async function call(actor, path, method = "GET", body, status = 200) {
    const result = await actor.request(path, { method, body });
    assert.equal(
      result.status,
      status,
      `${method} ${path} returned ${result.status} (${result.data?.reason ?? ""})`,
    );
    return result.data;
  }
  const userIds = { qa: (await call(owner, "/api/me")).userId };
  async function staff(role) {
    const client = newClient();
    await call(client, "/api/auth/sign-up/email", "POST", {
      name: `Synthetic ${role}`,
      email: `${role}@journey.example.invalid`,
      password,
    });
    await enroll(client);
    const me = await call(client, "/api/me");
    assert.equal(me.mfaVerified, true);
    userIds[role] = me.userId;
    return client;
  }

  const cashier = await staff("cashier");
  const kitchen = await staff("kitchen");
  const waiter = await staff("waiter");
  await verifyHostedJourneyReplay(
    { qa: owner, cashier, kitchen, waiter },
    userIds,
  );
  for (const role of ["cashier", "kitchen", "waiter"]) {
    await call(
      owner,
      organization + "/memberships",
      "POST",
      {
        userId: userIds[role],
        role,
        branchId: branch,
      },
      201,
    );
  }
  const { category } = await call(
    owner,
    catalog + "/categories",
    "POST",
    { name: "Journey dishes" },
    201,
  );
  const { product } = await call(
    owner,
    catalog + "/products",
    "POST",
    {
      categoryId: category.id,
      name: "Journey soup",
      description: "Synthetic staging fixture",
      imageKey: null,
      sortOrder: 0,
    },
    201,
  );
  const { price } = await call(
    owner,
    location + "/catalog/" + product.id + "/price",
    "POST",
    {
      priceMinor: 12500,
      currencyCode: "UZS",
      expectedPriceVersionId: null,
    },
    201,
  );
  const { table } = await call(
    owner,
    location + "/tables",
    "POST",
    {
      tableCode: "J1",
      displayName: "Journey 1",
      seats: 2,
    },
    201,
  );
  const pos = await call(cashier, ops + "/pos");
  assert.ok(pos.tables.some((row) => row.id === table.id));
  const selected = pos.products.find((row) => row.id === product.id);
  assert.equal(selected.price_version, price.id);
  assert.equal(selected.available, true);

  const shifts = ops + "/cash-shifts";
  const { shift } = await call(
    cashier,
    shifts,
    "POST",
    {
      idempotencyKey: randomUUID(),
      currencyCode: "UZS",
      openingAmountMinor: "5000",
    },
    201,
  );
  const { order, ticketId } = await call(
    cashier,
    ops + "/orders",
    "POST",
    {
      idempotencyKey: randomUUID(),
      fulfillmentType: "DINE_IN",
      tableId: table.id,
      items: [
        {
          productId: product.id,
          quantity: "2",
          priceVersion: selected.price_version,
          notes: "No onions",
        },
      ],
    },
    201,
  );
  assert.equal(order.total_minor, "25000");
  const kds = ops + "/kitchen/tickets";
  const { tickets } = await call(kitchen, kds);
  const ticket = tickets.find((row) => row.id === ticketId);
  assert.equal(ticket.order_id, order.id);
  assert.equal(ticket.status, "QUEUED");
  assert.equal(ticket.items[0].notes, "No onions");
  assert.equal(ticket.items[0].quantity, "2.000");
  const floor = ops + "/waiter";
  let version = ticket.version;
  for (const [action, expected] of [
    ["ACCEPT", "ACCEPTED"],
    ["START", "PREPARING"],
    ["READY", "READY"],
  ]) {
    const updated = await call(kitchen, kds + "/" + ticketId, "PATCH", {
      idempotencyKey: randomUUID(),
      expectedVersion: version,
      transition: action,
    });
    assert.equal(updated.status, expected);
    version = updated.version;
  }
  const ready = (await call(waiter, floor)).tickets.find(
    (row) => row.id === ticketId,
  );
  assert.equal(ready.status, "READY");
  const served = await call(waiter, floor + "/" + ticketId, "PATCH", {
    idempotencyKey: randomUUID(),
    expectedVersion: ready.version,
    transition: "SERVE",
  });
  assert.equal(served.status, "SERVED");

  const payments = ops + "/cash-payments";
  const record = payments + "/orders/" + order.id;
  const paymentRequest = {
    idempotencyKey: randomUUID(),
    cashReceivedMinor: "30000",
  };
  await call(waiter, record, "POST", paymentRequest, 403);
  const { payment } = await call(cashier, record, "POST", paymentRequest, 201);
  assert.equal(payment.shift_id, shift.id);
  assert.equal(payment.amount_minor, "25000");
  assert.equal(payment.change_minor, "5000");
  assert.equal(payment.fiscal_status, "NOT_ISSUED");
  const retry = await call(cashier, record, "POST", paymentRequest);
  assert.equal(retry.payment.id, payment.id);
  const history = await call(cashier, payments + "?orderId=" + order.id);
  assert.equal(history.payments.length, 1);
  assert.equal(history.payments[0].id, payment.id);
  const begin = await call(
    cashier,
    shifts + "/" + shift.id + "/begin-close",
    "POST",
    {
      idempotencyKey: randomUUID(),
      expectedVersion: history.activeShift.version,
      countedCashMinor: "30000",
    },
    201,
  );
  const close = await call(
    cashier,
    shifts + "/" + shift.id + "/confirm-close",
    "POST",
    {
      idempotencyKey: randomUUID(),
      expectedVersion: begin.shift.version,
    },
    201,
  );
  assert.equal(close.shift.variance_minor, "0");
  const reportPath =
    ops +
    "/analytics?from=" +
    shift.opened_at.slice(0, 10) +
    "&to=" +
    close.shift.closed_at.slice(0, 10);
  await call(kitchen, reportPath, "GET", undefined, 403);
  const report = await call(owner, reportPath);
  assert.equal(report.currencies.length, 1);
  assert.deepEqual(report.currencies[0], {
    currency: "UZS",
    orderCount: 1,
    cancelledCount: 0,
    orderTotalMinor: "25000",
    averageOrderMinor: "25000",
    settlementCount: 1,
    settledMinor: "25000",
    ledgerAlerts: 0,
  });
  assert.equal(report.products[0].productId, product.id);
  assert.equal(report.cashiers[0].cashierId, payment.cashier_user_id);
  assert.equal(report.cashiers[0].expectedMinor, "30000");
  assert.equal(report.cashiers[0].varianceAlerts, 0);
  assert.deepEqual(report.kitchen, [{ status: "SERVED", ticketCount: 1 }]);
}
