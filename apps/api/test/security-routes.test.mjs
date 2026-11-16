import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  validateUuid,
  validateName,
  canManageOrganization,
  capabilitiesForMemberships,
  validateMembershipGrant,
  handleSecurityRoute,
  sendSafeApiError,
  verifyRestrictedAppPool,
} = require("../dist/security-routes.js");
const org = "0faab234-9a8a-4b25-89a2-29201c7f8acf";
const branch = "bb68778e-3698-471b-9b2b-d6845b78d70e";
const owner = [{ role: "owner", branch_id: null }];
const director = [{ role: "director", branch_id: null }];
const waiter = [{ role: "waiter", branch_id: branch }];
test("workspace capabilities follow API role policy and remain scoped to supplied memberships", () => {
  const cashierCapabilities = capabilitiesForMemberships([
    { role: "cashier", branch_id: branch },
  ]);
  assert.ok(cashierCapabilities.includes("orders.create"));
  assert.ok(cashierCapabilities.includes("payments.cash_record"));
  assert.ok(cashierCapabilities.includes("waiter.operate"));
  assert.ok(cashierCapabilities.includes("shifts.open"));
  assert.ok(!cashierCapabilities.includes("kitchen.operate"));
  assert.ok(!cashierCapabilities.includes("catalog.manage"));
  const kitchenCapabilities = capabilitiesForMemberships([
    { role: "kitchen", branch_id: branch },
  ]);
  assert.deepEqual(kitchenCapabilities, ["kitchen.operate", "workspace.view"]);
  const ownerCapabilities = capabilitiesForMemberships(owner);
  assert.ok(ownerCapabilities.includes("branches.manage"));
  assert.ok(ownerCapabilities.includes("kitchen.operate"));
  const directorCapabilities = capabilitiesForMemberships([
    { role: "director", branch_id: null },
  ]);
  assert.ok(directorCapabilities.includes("organizations.manage"));
  const administratorCapabilities = capabilitiesForMemberships([
    { role: "administrator", branch_id: branch },
  ]);
  assert.ok(administratorCapabilities.includes("catalog.branch.manage"));
  assert.ok(!administratorCapabilities.includes("catalog.manage"));
  const accountantCapabilities = capabilitiesForMemberships([
    { role: "accountant", branch_id: branch },
  ]);
  assert.deepEqual(accountantCapabilities, [
    "orders.read",
    "shifts.read",
    "transactions.read",
    "workspace.view",
  ]);
  assert.ok(!accountantCapabilities.includes("payments.cash_record"));
  const waiterCapabilities = capabilitiesForMemberships([
    { role: "waiter", branch_id: branch },
  ]);
  assert.deepEqual(waiterCapabilities, [
    "catalog.read",
    "tables.read",
    "waiter.operate",
    "workspace.view",
  ]);
});
test("names, UUIDs and membership grants reject client-controlled privilege escalation", () => {
  assert.equal(validateUuid(org), org);
  for (const value of ["../tenant", "1 OR 1=1", "not-a-uuid"])
    assert.throws(() => validateUuid(value));
  assert.equal(validateName("  Branch 1  "), "Branch 1");
  for (const value of ["", " ", "x".repeat(121), "bad\nname", null, 12])
    assert.throws(() => validateName(value));
  assert.equal(canManageOrganization(owner), true);
  assert.equal(canManageOrganization(director), true);
  assert.equal(canManageOrganization(waiter), false);
  assert.deepEqual(
    validateMembershipGrant(
      { userId: "target-user", role: "cashier", branchId: branch },
      owner,
    ),
    { userId: "target-user", role: "cashier", branchId: branch },
  );
  assert.throws(() =>
    validateMembershipGrant({ userId: "target", role: "owner" }, owner),
  );
  assert.throws(() =>
    validateMembershipGrant({ userId: "target", role: "director" }, director),
  );
  assert.throws(() =>
    validateMembershipGrant(
      {
        userId: "target",
        role: "cashier",
        branchId: branch,
        organizationId: org,
      },
      owner,
    ),
  );
  assert.throws(() =>
    validateMembershipGrant(
      { userId: "target", role: "cashier", branchId: branch },
      waiter,
    ),
  );
  assert.throws(() =>
    validateMembershipGrant({ userId: "target", role: "cashier" }, owner),
  );
});
test("startup role guard refuses privileged, inherited, owning or wrong-role connections", async () => {
  await verifyRestrictedAppPool({
    query: async () => ({ rows: [{ role_name: "unibos_app", unsafe: false }] }),
  });
  for (const row of [
    { role_name: "unibos", unsafe: false },
    { role_name: "unibos_app", unsafe: true },
  ]) {
    await assert.rejects(() =>
      verifyRestrictedAppPool({ query: async () => ({ rows: [row] }) }),
    );
  }
});
test("HTTP guards reject missing sessions, forged origins, oversized bodies and unverified MFA before database access", async () => {
  let identity = null;
  let calls = 0;
  const security = {
    getIdentity: async () => identity,
    nodeHandler: async (_req, res) => {
      res.end("auth");
    },
    close: async () => {},
  };
  let origin;
  const server = createServer((req, res) => {
    void handleSecurityRoute(req, res, {
      security,
      pool: {
        query() {
          calls++;
          throw Error("Must not query");
        },
      },
      trustedOrigins: [origin],
    })
      .then((handled) => {
        if (!handled) {
          res.statusCode = 404;
          res.end();
        }
      })
      .catch((error) => sendSafeApiError(res, error));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  origin = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${origin}/api/me`)).status, 401);
    identity = { userId: "actor", sessionId: "session", mfaVerified: false };
    assert.equal((await fetch(`${origin}/api/me`)).status, 200);
    assert.equal(
      (
        await fetch(`${origin}/api/organizations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Tenant" }),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${origin}/api/organizations`, {
          method: "POST",
          headers: {
            Origin: "https://untrusted.example",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "Tenant" }),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${origin}/api/organizations`, {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Tenant" }),
        })
      ).status,
      403,
    );
    const huge = await fetch(`${origin}/api/organizations`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x".repeat(17000) }),
    });
    assert.equal(huge.status, 413);
    identity = { ...identity, mfaVerified: true };
    assert.equal(
      (
        await fetch(`${origin}/api/organizations`, {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: "{",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(`${origin}/api/organizations`, {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Tenant", role: "owner" }),
        })
      ).status,
      400,
    );
    assert.equal(calls, 0);
    identity = null;
    assert.equal(
      (await fetch(`${origin}/api/me`)).status,
      401,
      "revocation is checked each request rather than cached",
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("workspace capability endpoint derives scoped memberships from the verified session and disables caching", async () => {
  const orgA = "0faab234-9a8a-4b25-89a2-29201c7f8acf";
  const orgB = "1faab234-9a8a-4b25-89a2-29201c7f8acf";
  const branchA = "bb68778e-3698-471b-9b2b-d6845b78d70e";
  const branchB = "cb68778e-3698-471b-9b2b-d6845b78d70e";
  let identity = null;
  const client = {
    async query(sql) {
      if (
        sql === "BEGIN" ||
        sql === "COMMIT" ||
        sql === "ROLLBACK" ||
        sql.startsWith("SELECT set_config") ||
        sql.startsWith("SET LOCAL") ||
        sql.startsWith("RESET")
      )
        return { rows: [] };
      if (
        sql.includes("FROM public.memberships m") &&
        sql.includes("JOIN public.organizations")
      )
        return {
          rows: [
            {
              organization_id: orgA,
              organization_name: "A",
              role: "cashier",
              branch_id: branchA,
            },
            {
              organization_id: orgB,
              organization_name: "B",
              role: "owner",
              branch_id: null,
            },
          ],
        };
      if (sql.includes("private.member_of"))
        return { rows: [{ allowed: true }] };
      if (sql.includes("FROM public.branches")) {
        const org = this.org;
        return {
          rows: [
            {
              id: org === orgA ? branchA : branchB,
              name: org === orgA ? "A filial" : "B filial",
            },
          ],
        };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    release() {},
  };
  const pool = {
    async connect() {
      const connection = { org: null, release() {} };
      connection.query = async (sql, params) => {
        if (sql.includes("SELECT set_config"))
          connection.org = params?.[1] || null;
        return client.query.call(connection, sql, params);
      };
      return connection;
    },
  };
  const security = {
    getIdentity: async () => identity,
    nodeHandler: async () => {},
    close: async () => {},
  };
  const server = createServer((req, res) => {
    void handleSecurityRoute(req, res, {
      security,
      pool,
      trustedOrigins: [origin],
    })
      .then((handled) => {
        if (!handled) {
          res.statusCode = 404;
          res.end();
        }
      })
      .catch((error) => sendSafeApiError(res, error));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal(
      (await fetch(`${origin}/api/v1/me/workspace-capabilities`)).status,
      401,
    );
    identity = {
      userId: "verified-user",
      sessionId: "session",
      mfaVerified: true,
    };
    const response = await fetch(
      `${origin}/api/v1/me/workspace-capabilities?role=owner`,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store, private");
    const body = await response.json();
    assert.equal(body.organizations.length, 2);
    const a = body.organizations.find((item) => item.id === orgA).branches[0];
    assert.deepEqual(a.roles, ["cashier"]);
    assert.ok(a.capabilities.includes("orders.create"));
    assert.ok(!a.capabilities.includes("kitchen.operate"));
    assert.deepEqual(
      a.navigation.map((item) => item.id),
      ["workspace", "pos", "waiter", "shifts", "payments"],
    );
    const b = body.organizations.find((item) => item.id === orgB);
    assert.ok(b.branches[0].capabilities.includes("kitchen.operate"));
    assert.ok(b.branches[0].navigation.some((item) => item.id === "menu"));
    assert.ok(
      !a.navigation.some((item) => item.id === "menu"),
      "catalog management navigation is not exposed to a cashier",
    );
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("P4 catalog mutations require an authorized MFA role and QR secrets are stored as hashes", async () => {
  let memberships = owner;
  let insertedTokenHash;
  const tokenRotationQueries = [];
  const categoryId = "5f08bc02-6c3d-4b4f-bd7a-7e155c8aa401";
  const tableId = "acd773f8-d691-4ab0-922b-e63a60f3a5ed";
  const pool = {
    async connect() {
      return {
        async query(sql, values = []) {
          if (String(sql).includes("private.member_of"))
            return { rows: [{ allowed: true }] };
          if (
            String(sql).includes(
              "SELECT role, branch_id FROM public.memberships",
            )
          )
            return { rows: memberships };
          if (String(sql).includes("INSERT INTO public.product_categories"))
            return { rows: [{ id: categoryId, name: values[1] }] };
          if (String(sql).includes("SELECT id FROM public.restaurant_tables"))
            return { rows: [{ id: tableId }] };
          if (
            String(sql).includes("UPDATE public.table_qr_tokens SET revoked_at")
          ) {
            tokenRotationQueries.push("revoke");
            return { rows: [], rowCount: 1 };
          }
          if (String(sql).includes("INSERT INTO public.table_qr_tokens")) {
            tokenRotationQueries.push("insert");
            insertedTokenHash = values[3];
            return {
              rows: [
                {
                  id: "204a1bb4-3632-4b61-aaf6-14e65796edaf",
                  table_id: tableId,
                  expires_at: values[4],
                },
              ],
            };
          }
          return { rows: [], rowCount: 0 };
        },
        release() {},
      };
    },
  };
  const security = {
    getIdentity: async () => ({
      userId: "actor",
      sessionId: "session",
      mfaVerified: true,
    }),
    nodeHandler: async (_req, res) => res.end(),
    close: async () => {},
  };
  const server = createServer((req, res) => {
    void handleSecurityRoute(req, res, {
      security,
      pool,
      trustedOrigins: [origin],
    })
      .then((handled) => {
        if (!handled) {
          res.statusCode = 404;
          res.end();
        }
      })
      .catch((error) => sendSafeApiError(res, error));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    memberships = waiter;
    const denied = await fetch(
      `${origin}/api/organizations/${org}/catalog/categories`,
      {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Drinks" }),
      },
    );
    assert.equal(denied.status, 403);

    memberships = owner;
    const created = await fetch(
      `${origin}/api/organizations/${org}/catalog/categories`,
      {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Drinks" }),
      },
    );
    assert.equal(created.status, 201);
    assert.equal((await created.json()).category.id, categoryId);

    memberships = [{ role: "administrator", branch_id: branch }];
    const forbiddenPrice = await fetch(
      `${origin}/api/organizations/${org}/branches/${branch}/catalog/${categoryId}/price`,
      {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({
          priceMinor: 1000,
          currencyCode: "UZS",
          expectedPriceVersionId: null,
        }),
      },
    );
    assert.equal(forbiddenPrice.status, 403);

    memberships = owner;
    const priceHistory = await fetch(
      `${origin}/api/organizations/${org}/branches/${branch}/catalog/${categoryId}/price`,
    );
    assert.equal(priceHistory.status, 200);
    assert.deepEqual((await priceHistory.json()).priceHistory, []);

    const qr = await fetch(
      `${origin}/api/organizations/${org}/branches/${branch}/tables/${tableId}/qr-tokens`,
      {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: "{}",
      },
    );
    assert.equal(qr.status, 201);
    const payload = await qr.json();
    assert.match(payload.secret, /^[A-Za-z0-9_-]{40,}$/);
    assert.ok(Buffer.isBuffer(insertedTokenHash));
    assert.equal(insertedTokenHash.length, 32);
    assert.notEqual(insertedTokenHash.toString("base64url"), payload.secret);
    assert.deepEqual(tokenRotationQueries, ["revoke", "insert"]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("catalog price writes use the caller's expected version and reject stale prices", async () => {
  const productId = "5f08bc02-6c3d-4b4f-bd7a-7e155c8aa401";
  const firstPriceId = "604a1bb4-3632-4b61-aaf6-14e65796edaf";
  let latestPriceId = null;
  const inserts = [];
  const pool = {
    async connect() {
      return {
        async query(sql, values = []) {
          if (String(sql).includes("private.member_of"))
            return { rows: [{ allowed: true }] };
          if (
            String(sql).includes(
              "SELECT role, branch_id FROM public.memberships",
            )
          )
            return { rows: owner };
          if (String(sql).includes("SELECT id FROM public.products"))
            return { rows: [{ id: productId }] };
          if (
            String(sql).includes("SELECT id FROM public.product_price_versions")
          )
            return { rows: latestPriceId ? [{ id: latestPriceId }] : [] };
          if (
            String(sql).includes("INSERT INTO public.product_price_versions")
          ) {
            inserts.push(values);
            latestPriceId =
              inserts.length === 1
                ? firstPriceId
                : "704a1bb4-3632-4b61-aaf6-14e65796edaf";
            return { rows: [{ id: latestPriceId, price_minor: values[3] }] };
          }
          return { rows: [], rowCount: 0 };
        },
        release() {},
      };
    },
  };
  const security = {
    getIdentity: async () => ({
      userId: "actor",
      sessionId: "session",
      mfaVerified: true,
    }),
    nodeHandler: async (_req, res) => res.end(),
    close: async () => {},
  };
  const server = createServer((req, res) => {
    void handleSecurityRoute(req, res, {
      security,
      pool,
      trustedOrigins: [origin],
    })
      .then((handled) => {
        if (!handled) {
          res.statusCode = 404;
          res.end();
        }
      })
      .catch((error) => sendSafeApiError(res, error));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const url = `${origin}/api/organizations/${org}/branches/${branch}/catalog/${productId}/price`;
  const postPrice = (expectedPriceVersionId, priceMinor) =>
    fetch(url, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        priceMinor,
        currencyCode: "UZS",
        expectedPriceVersionId,
      }),
    });
  try {
    assert.equal((await postPrice(null, 1000)).status, 201);
    assert.equal((await postPrice(null, 1200)).status, 409);
    assert.equal(
      inserts.length,
      1,
      "a stale price request must not append a version",
    );
    assert.equal((await postPrice(firstPriceId, 1200)).status, 201);
    assert.equal(inserts.length, 2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
