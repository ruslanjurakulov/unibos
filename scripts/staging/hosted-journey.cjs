"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const {
  session,
  acquireRunLock,
  SafeFailure,
  check,
  uuid,
  origin,
} = require("./hosted-session.cjs");

const roles = ["cashier", "kitchen", "waiter"];
const names = {
  organization: "UniBOS Synthetic Service Journey v1",
  branch: "QA Journey Branch v1",
  category: "QA Journey category v1",
  product: "QA Journey soup v1",
  table: "QA-J01",
};
function stableKey(branch, action) {
  check(uuid(branch), "invalid branch identity");
  const data = createHash("sha256")
    .update([origin, "hosted-journey-v1", branch, action].join("|"))
    .digest();
  data[6] = (data[6] & 15) | 128;
  data[8] = (data[8] & 63) | 128;
  const hex = data.toString("hex", 0, 16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
// Keep resource bindings across runs. The server independently deduplicates every
// order, transition, shift operation and settlement using the stable request keys.
function journal() {
  const dir = path.join(process.env.LOCALAPPDATA, "UniBOS", "staging-qa");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "p46-hosted-journey-v1.json");
  const ids = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, "utf8"))
    : {};
  return {
    has: (kind) => Object.hasOwn(ids, kind),
    bind(kind, id) {
      check(uuid(id), "invalid " + kind + " id");
      if (this.has(kind)) {
        check(ids[kind] === id, "previous " + kind + " changed");
        return;
      }
      ids[kind] = id;
      const temp = file + "." + randomUUID() + ".tmp";
      try {
        fs.writeFileSync(temp, JSON.stringify(ids), {
          flag: "wx",
          flush: true,
        });
        fs.renameSync(temp, file);
      } finally {
        if (fs.existsSync(temp)) fs.unlinkSync(temp);
      }
    },
  };
}
async function runJourney(clients, userIds, state) {
  const { qa: owner, cashier, kitchen, waiter } = clients;
  async function entity(kind, url, collection, body, match) {
    const list = (await owner.request("find " + kind, url))[collection];
    check(
      Array.isArray(list) && list.length < 100,
      "unexpected, incomplete or busy fixture " + collection,
    );
    const found = list.filter(match);
    check(found.length <= 1, "ambiguous synthetic " + kind);
    let item = found[0];
    if (!item) {
      check(!state.has(kind), "previous " + kind + " missing");
      item = (
        await owner.request("create " + kind, url, {
          method: "POST",
          body,
          expected: 201,
        })
      )[kind];
    }
    check(item && match(item), "unexpected " + kind);
    state.bind(kind, item.id);
    return item;
  }
  const org = await entity(
    "organization",
    "/api/organizations",
    "organizations",
    { name: names.organization },
    (r) => r.name === names.organization,
  );
  const own = await owner.request(
    "verify owner scope",
    "/api/v1/me/workspace-capabilities",
  );
  check(
    own.userId === userIds.qa &&
      own.organizations.some(
        (r) => r.id === org.id && r.roles.includes("owner"),
      ),
    "missing owner membership",
  );
  const orgPath = "/api/organizations/" + org.id;
  const branch = await entity(
    "branch",
    orgPath + "/branches",
    "branches",
    { name: names.branch },
    (r) => r.name === names.branch && r.organization_id === org.id,
  );
  const location = orgPath + "/branches/" + branch.id;
  const ops = "/api/v1/organizations/" + org.id + "/branches/" + branch.id;
  const key = (action) => stableKey(branch.id, action);
  for (const role of roles) {
    const staff = clients[role];
    const lookup = () =>
      staff.request("check role scope", "/api/v1/me/workspace-capabilities");
    let scope = await lookup();
    if (scope.organizations.length === 0) {
      await owner.request("assign " + role, orgPath + "/memberships", {
        method: "POST",
        body: { userId: userIds[role], branchId: branch.id, role },
        expected: 201,
      });
      scope = await lookup();
    }
    const current = scope.organizations[0];
    check(
      scope.userId === userIds[role] &&
        scope.organizations.length === 1 &&
        current.id === org.id &&
        current.roles.length === 0 &&
        current.branches.length === 1 &&
        current.branches[0].id === branch.id &&
        current.branches[0].effectiveRoles.join(",") === role,
      "unexpected permissions for " + role,
    );
  }
  const catalog = orgPath + "/catalog";
  const category = await entity(
    "category",
    catalog + "/categories",
    "categories",
    { name: names.category },
    (r) => r.name === names.category,
  );
  const product = await entity(
    "product",
    catalog + "/products",
    "products",
    { name: names.product, categoryId: category.id },
    (r) => r.category_id === category.id && r.name === names.product,
  );
  const table = await entity(
    "table",
    location + "/tables",
    "tables",
    {
      tableCode: names.table,
      displayName: "Synthetic journey table",
      seats: 2,
    },
    (r) => r.table_code === names.table,
  );
  let pos = await cashier.request("read cashier POS", ops + "/pos");
  let row = pos.products.find((p) => p.id === product.id);
  check(
    row && row.available && pos.tables.some((t) => t.id === table.id),
    "POS fixture unavailable",
  );
  if (row.price_version === null && !state.has("price")) {
    await owner.request(
      "set first synthetic price",
      location + "/catalog/" + product.id + "/price",
      {
        method: "POST",
        body: {
          expectedPriceVersionId: null,
          priceMinor: 12500,
          currencyCode: "UZS",
        },
        expected: 201,
      },
    );
    pos = await cashier.request("re-read POS price", ops + "/pos");
    row = pos.products.find((p) => p.id === product.id);
  }
  check(
    row?.price_minor === "12500" && row.currency_code === "UZS",
    "synthetic price mismatch",
  );
  state.bind("price", row.price_version);
  const shifts = ops + "/cash-shifts";
  const open = await cashier.request("open or recover QA shift", shifts, {
    method: "POST",
    expected: [200, 201],
    body: {
      idempotencyKey: key("open"),
      currencyCode: "UZS",
      openingAmountMinor: "5000",
    },
  });
  const shift = open.shift;
  state.bind("shift", shift.id);
  check(
    shift.cashier_user_id === userIds.cashier &&
      shift.branch_id === branch.id &&
      shift.opening_amount_minor === "5000",
    "wrong shift",
  );
  const submitted = await cashier.request(
    "submit or recover QA order",
    ops + "/orders",
    {
      method: "POST",
      expected: [200, 201],
      body: {
        idempotencyKey: key("order"),
        fulfillmentType: "DINE_IN",
        tableId: table.id,
        note: "UniBOS hosted journey v1",
        items: [
          {
            productId: product.id,
            quantity: "2",
            priceVersion: row.price_version,
            notes: "Synthetic: no onions",
          },
        ],
      },
    },
  );
  const { order, ticketId } = submitted;
  state.bind("order", order.id);
  state.bind("ticket", ticketId);
  check(
    order.table_id === table.id &&
      order.total_minor === "25000" &&
      order.created_by === userIds.cashier &&
      submitted.items.length === 1 &&
      submitted.items[0].product_id === product.id,
    "wrong canonical order",
  );
  const queue = ops + "/kitchen/tickets",
    floor = ops + "/waiter";
  const tickets = (await kitchen.request("read kitchen queue", queue)).tickets;
  const ticket = tickets.find((t) => t.id === ticketId);
  if (ticket)
    check(
      ticket.order_id === order.id &&
        ticket.items[0].quantity === "2.000" &&
        ticket.items[0].notes === "Synthetic: no onions" &&
        !Object.hasOwn(ticket, "total_minor"),
      "wrong kitchen projection",
    );
  else check(submitted.duplicate, "new order missing from kitchen");
  for (const [index, action] of ["ACCEPT", "START", "READY"].entries()) {
    const done = await kitchen.request(
      "kitchen " + action,
      queue + "/" + ticketId,
      {
        method: "PATCH",
        body: {
          idempotencyKey: key(action),
          expectedVersion: index + 1,
          transition: action,
        },
      },
    );
    check(
      done.ticketId === ticketId &&
        (done.duplicate === true ||
          done.status === ["ACCEPTED", "PREPARING", "READY"][index]),
      "wrong ticket acknowledgement",
    );
  }
  const visible = (
    await waiter.request("read waiter tickets", floor)
  ).tickets.find((t) => t.id === ticketId);
  if (visible)
    check(
      visible.status === "READY" && visible.order_id === order.id,
      "waiter did not see ready ticket",
    );
  const served = await waiter.request("serve ticket", floor + "/" + ticketId, {
    method: "PATCH",
    body: {
      idempotencyKey: key("serve"),
      expectedVersion: 4,
      transition: "SERVE",
    },
  });
  check(
    served.ticketId === ticketId &&
      (served.duplicate === true || (served.status === "SERVED" && visible)),
    "wrong served ticket",
  );
  const payments = ops + "/cash-payments";
  const record = payments + "/orders/" + order.id;
  const body = { idempotencyKey: key("cash"), cashReceivedMinor: "30000" };
  await waiter.request("waiter forbidden to settle", record, {
    method: "POST",
    body,
    expected: 403,
  });
  const first = await cashier.request(
    "record or recover internal cash settlement",
    record,
    { method: "POST", body, expected: [200, 201] },
  );
  const retry = await cashier.request("verify idempotent settlement", record, {
    method: "POST",
    body,
  });
  const p = first.payment;
  state.bind("payment", p.id);
  check(
    retry.duplicate === true &&
      retry.payment.id === p.id &&
      p.order_id === order.id &&
      p.shift_id === shift.id &&
      p.amount_minor === "25000" &&
      p.change_minor === "5000" &&
      p.fiscal_status === "NOT_ISSUED",
    "wrong settlement",
  );
  const history = await cashier.request(
    "read authorized transaction history",
    payments + "?orderId=" + order.id,
  );
  check(
    history.payments.length === 1 && history.payments[0].id === p.id,
    "wrong settlement history",
  );
  const closeUrl = shifts + "/" + shift.id;
  // In this dedicated empty shift the single payment moves version 1 to 2.
  // Reusing the original version also binds both close requests on later runs.
  const closing = await cashier.request(
    "begin or recover shift close",
    closeUrl + "/begin-close",
    {
      method: "POST",
      expected: [200, 201],
      body: {
        idempotencyKey: key("begin-close"),
        expectedVersion: 2,
        countedCashMinor: "30000",
      },
    },
  );
  check(closing.shift.id === shift.id, "wrong closing shift");
  const closed = (
    await cashier.request(
      "confirm or recover shift close",
      closeUrl + "/confirm-close",
      {
        method: "POST",
        expected: [200, 201],
        body: { idempotencyKey: key("confirm-close"), expectedVersion: 3 },
      },
    )
  ).shift;
  check(
    closed.id === shift.id &&
      closed.status === "CLOSED" &&
      closed.counted_cash_minor === "30000" &&
      closed.variance_minor === "0",
    "wrong closed shift",
  );
  const reportUrl =
    ops +
    "/analytics?from=" +
    shift.opened_at.slice(0, 10) +
    "&to=" +
    closed.closed_at.slice(0, 10);
  await kitchen.request(
    "kitchen forbidden to read financial analytics",
    reportUrl,
    { expected: 403 },
  );
  const analytics = await owner.request("read owner analytics", reportUrl);
  const totals = analytics.currencies.find((c) => c.currency === "UZS");
  check(
    analytics.organizationId === org.id &&
      analytics.branchId === branch.id &&
      totals?.orderCount === 1 &&
      totals.orderTotalMinor === "25000" &&
      totals.settlementCount === 1 &&
      totals.settledMinor === "25000" &&
      totals.ledgerAlerts === 0,
    "analytics totals mismatch",
  );
  check(
    analytics.cashiers.some(
      (c) =>
        c.cashierId === userIds.cashier &&
        c.closedShifts === 1 &&
        c.expectedMinor === "30000" &&
        c.countedMinor === "30000" &&
        c.varianceAlerts === 0,
    ) &&
      analytics.kitchen.some(
        (t) => t.status === "SERVED" && t.ticketCount === 1,
      ) &&
      analytics.products.some(
        (item) => item.productId === product.id && item.totalMinor === "25000",
      ),
    "analytics details mismatch",
  );
  return {
    orderId: order.id,
    ticketId,
    paymentId: p.id,
    shiftId: shift.id,
    currency: "UZS",
    settledMinor: p.amount_minor,
    varianceMinor: closed.variance_minor,
  };
}

async function main() {
  check(
    process.platform === "win32" && process.env.LOCALAPPDATA,
    "Windows CurrentUser required",
  );
  const gate = process.env.UNIBOS_GATE_PASSWORD;
  check(gate && gate.length >= 32, "missing gate credential");
  const clients = {};
  for (const role of ["qa", ...roles]) {
    const prefix =
      role === "qa" ? "UNIBOS_QA" : "UNIBOS_QA_" + role.toUpperCase();
    const alias = role === "qa" ? "qa" : "qa-" + role;
    const password = process.env[prefix + "_PASSWORD"];
    check(password && password.length >= 12, "missing password for " + alias);
    clients[role] = session(
      alias,
      gate,
      password,
      process.env[prefix + "_TOTP"],
    );
  }
  const lock = await acquireRunLock();
  const userIds = {};
  let journeyError;
  let result;
  try {
    await clients.qa.request("unauthenticated admission", "/api/health/ready", {
      admit: false,
      expected: 401,
    });
    check(
      (await clients.qa.request("staging readiness", "/api/health/ready"))
        .status === "ready",
      "staging dependencies unavailable",
    );
    for (const [role, client] of Object.entries(clients))
      userIds[role] = await client.login();
    check(
      new Set(Object.values(userIds)).size === 4,
      "QA sessions must have different users",
    );
    result = await runJourney(clients, userIds, journal());
  } catch (error) {
    journeyError = error;
  } finally {
    const cleanup = await Promise.allSettled(
      Object.values(clients).map((client) => client.signOut()),
    );
    for (const client of Object.values(clients)) client.clear();
    lock.close();
    const failed = cleanup.find((entry) => entry.status === "rejected");
    if (failed && !journeyError) journeyError = failed.reason;
  }
  if (journeyError) throw journeyError;
  console.log("PASS hosted synthetic journey " + JSON.stringify(result));
}
module.exports = { stableKey, runJourney };
if (require.main === module)
  main().catch((e) => {
    console.error(
      "STOP " +
        (e instanceof SafeFailure ? e.message : "local processing failed"),
    );
    process.exitCode = 1;
  });
