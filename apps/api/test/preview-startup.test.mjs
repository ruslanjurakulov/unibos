import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { createPreviewHandler } from "../dist/staging.js";

test("embedded Preview ignores listener settings and reports only fixed server-side initialization codes", async (t) => {
  const socket = createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const secret = randomBytes(48).toString("hex");
  const origin = "https://staging.example.invalid";
  const connection = (role) =>
    "postgresql://" +
    role +
    ":" +
    secret +
    "@127.0.0.1:" +
    port +
    "/unibos_staging?sslmode=verify-full";
  const settings = {
    NODE_ENV: "production",
    HOST: "provider-owned-host",
    PORT: "provider-owned-socket",
    AUTH_BASE_URL: origin,
    AUTH_TRUSTED_ORIGINS: origin,
    DATABASE_URL: connection("unibos_app"),
    AUTH_DATABASE_URL: connection("unibos_auth"),
    REDIS_URL: "rediss://default:" + secret + "@127.0.0.1:6379",
    BETTER_AUTH_SECRET: secret,
    AUTH_ENABLED: "true",
    AUTH_ALLOW_SIGNUP: "false",
  };
  const logs = t.mock.method(console, "error", () => {});
  for (const [key, value] of Object.entries(settings)) set(key, value);
  function set(key, value) {
    const old = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (old === undefined) delete process.env[key];
      else process.env[key] = old;
    });
  }
  async function check(expected, url = origin) {
    logs.mock.resetCalls();
    await assert.rejects(createPreviewHandler(url), {
      message: "Preview API unavailable",
    });
    assert.deepEqual(
      logs.mock.calls.map((call) => call.arguments),
      [["unibos.preview.init." + expected]],
    );
  }
  await check("ORIGIN_GUARD", "https://other.example.invalid");
  await check("AUTH_DB_UNAVAILABLE");
  process.env.DATABASE_URL = "redacted.invalid." + secret;
  await check("RUNTIME_CONFIG");
});
