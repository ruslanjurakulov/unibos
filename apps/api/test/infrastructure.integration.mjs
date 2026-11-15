import { test } from "node:test";
import assert from "node:assert/strict";
import { readRuntimeConfig } from "@unibos/runtime";
import { createApplication } from "../dist/application.js";

test(
  "real disposable local Postgres and authenticated Redis satisfy HTTP readiness",
  { timeout: 10000 },
  async () => {
    const config = readRuntimeConfig(process.env);
    assert.notEqual(config.mode, "production");
    for (const value of [config.databaseUrl, config.redisUrl]) {
      assert.ok(
        ["127.0.0.1", "localhost", "[::1]"].includes(new URL(value).hostname),
        "integration services must be local",
      );
    }
    const app = await createApplication(config);
    try {
      await app.listen(0, "127.0.0.1");
      const response = await fetch(`${await app.getUrl()}/health/ready`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: "ready" });
    } finally {
      await app.close();
    }
  },
);
