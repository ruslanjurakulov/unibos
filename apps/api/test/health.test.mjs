import { test } from "node:test";
import assert from "node:assert/strict";
import { createApplication } from "../dist/application.js";
import { InfrastructureProbes } from "../dist/probes.js";
const config = {
  mode: "test",
  host: "127.0.0.1",
  apiPort: 3001,
  databaseUrl: "postgresql://test:synthetic-test-only@127.0.0.1:1/unibos",
  redisUrl: "redis://:synthetic-test-only@127.0.0.1:1/0",
};

async function withApp(probes, check) {
  const app = await createApplication(config, probes);
  try {
    await app.listen(0, "127.0.0.1");
    await check(await app.getUrl());
  } finally {
    await app.close();
  }
}

test("live and ready are actual HTTP endpoints with safe headers", async () => {
  let postgresCalls = 0;
  let redisCalls = 0;
  await withApp(
    {
      postgres: async () => {
        postgresCalls++;
      },
      redis: async () => {
        redisCalls++;
      },
    },
    async (url) => {
      const live = await fetch(`${url}/health/live`);
      assert.equal(live.status, 200);
      assert.deepEqual(await live.json(), { status: "ok" });
      assert.equal(postgresCalls, 0);
      assert.equal(redisCalls, 0);
      const ready = await fetch(`${url}/health/ready`);
      assert.equal(ready.status, 200);
      assert.deepEqual(await ready.json(), { status: "ready" });
      assert.equal(postgresCalls, 1);
      assert.equal(redisCalls, 1);
      assert.equal(ready.headers.get("cache-control"), "no-store");
      assert.equal(ready.headers.get("x-content-type-options"), "nosniff");
      assert.equal(ready.headers.get("x-powered-by"), null);
    },
  );
});

test("either dependency failure yields 503 while liveness survives; no credentials leak", async () => {
  for (const failed of ["postgres", "redis"]) {
    const probes = { postgres: async () => {}, redis: async () => {} };
    probes[failed] = async () => {
      throw new Error("secret-password postgres://private-host/database");
    };
    await withApp(probes, async (url) => {
      const ready = await fetch(`${url}/health/ready`);
      assert.equal(ready.status, 503);
      assert.deepEqual(await ready.json(), {
        status: "error",
        statusCode: 503,
        message: "Service unavailable",
      });
      assert.equal((await fetch(`${url}/health/live`)).status, 200);
      const missing = await fetch(`${url}/private-tenant-id`);
      assert.equal(missing.status, 404);
      assert.deepEqual(await missing.json(), {
        status: "error",
        statusCode: 404,
        message: "Not found",
      });
    });
  }
});

test(
  "real unavailable Postgres/Redis connections fail with bounded cleanup",
  { timeout: 6000 },
  async () => {
    const probes = new InfrastructureProbes(config);
    try {
      await assert.rejects(probes.postgres());
      await assert.rejects(probes.redis());
    } finally {
      await probes.onApplicationShutdown();
    }
  },
);
