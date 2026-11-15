import assert from "node:assert/strict";
import test from "node:test";
import {
  TenantAccessError,
  withUserTransaction,
  withTenantTransaction,
} from "../dist/index.js";

function poolFixture({ rollbackFails = false } = {}) {
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push([sql, params]);
      if (rollbackFails && sql === "ROLLBACK")
        throw new Error("connection lost");
      return { rows: [{ allowed: true }] };
    },
    release: (discard) => calls.push(["release", discard]),
  };
  return { pool: { connect: async () => client }, client, calls };
}

test("invalid identity and tenant inputs fail before borrowing a connection", async () => {
  const pool = {
    connect: () => {
      throw new Error("must not connect");
    },
  };
  await assert.rejects(
    withUserTransaction(pool, "invalid;actor", async () => undefined),
    TenantAccessError,
  );
  await assert.rejects(
    withTenantTransaction(
      pool,
      "valid_actor",
      "not-a-uuid",
      async () => undefined,
    ),
    TenantAccessError,
  );
});

test("callback failures roll back and clear pooled identity context", async () => {
  const { pool, calls } = poolFixture();
  const failure = new Error("application failure");
  await assert.rejects(
    withUserTransaction(pool, "actor", async () => {
      throw failure;
    }),
    (error) => error === failure,
  );
  assert(calls.some(([sql]) => sql === "ROLLBACK"));
  assert(
    calls.some(
      ([sql]) => sql === "RESET app.user_id; RESET app.organization_id",
    ),
  );
  assert.deepEqual(calls.at(-1), ["release", false]);
  const identity = calls.find(([sql]) => sql.startsWith("SELECT set_config"));
  assert.deepEqual(identity[1], ["actor", ""]);
});

test("failed rollback discards the connection instead of leaking transaction identity", async () => {
  const { pool, calls } = poolFixture({ rollbackFails: true });
  await assert.rejects(
    withUserTransaction(pool, "actor", async () => {
      throw new Error("failed");
    }),
  );
  assert.deepEqual(calls.at(-1), ["release", true]);
});
