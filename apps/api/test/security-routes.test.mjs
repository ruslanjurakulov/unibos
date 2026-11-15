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
