import { test } from "node:test";
import assert from "node:assert/strict";
import { readRuntimeConfig } from "../dist/index.js";
const base = {
  DATABASE_URL: "postgresql://dev:synthetic-test-only@127.0.0.1/unibos",
  REDIS_URL: "redis://:synthetic-test-only@127.0.0.1:6379/0",
};

test("development defaults bind only loopback and configuration is immutable", () => {
  const config = readRuntimeConfig(base);
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.apiPort, 3001);
  assert.equal(config.mode, "development");
  assert.ok(Object.isFrozen(config));
});

test("malformed URLs, missing credentials and invalid ports fail without leaking values", () => {
  for (const patch of [
    { DATABASE_URL: undefined },
    { DATABASE_URL: "not-a-url/secret-value" },
    { DATABASE_URL: "https://user:secret-value@example.invalid/db" },
    { DATABASE_URL: "postgresql://dev@127.0.0.1/unibos" },
    { DATABASE_URL: "postgresql://:secret-value@127.0.0.1/unibos" },
    { DATABASE_URL: "postgresql://dev:secret-value@127.0.0.1/" },
    { REDIS_URL: "redis://127.0.0.1:6379" },
    { REDIS_URL: "redis://:secret-value@localhost:6379/#fragment" },
    { PORT: "0" },
    { PORT: "3001x" },
    { PORT: "65536" },
    { HOST: "external.example" },
    { NODE_ENV: "invalid" },
  ]) {
    assert.throws(
      () => readRuntimeConfig({ ...base, ...patch }),
      (error) => {
        assert.ok(!error.message.includes("secret-value"));
        assert.ok(!error.message.includes("synthetic-test-only"));
        return true;
      },
    );
  }
});

test("production requires verified database TLS and Redis TLS", () => {
  assert.throws(
    () => readRuntimeConfig({ ...base, NODE_ENV: "production" }),
    /verified TLS/,
  );
  const databaseUrl = `${base.DATABASE_URL}?sslmode=verify-full`;
  assert.throws(
    () =>
      readRuntimeConfig({
        ...base,
        NODE_ENV: "production",
        DATABASE_URL: databaseUrl,
      }),
    /REDIS_URL must use TLS/,
  );
  const config = readRuntimeConfig({
    ...base,
    NODE_ENV: "production",
    DATABASE_URL: databaseUrl,
    REDIS_URL: base.REDIS_URL.replace("redis:", "rediss:"),
  });
  assert.equal(config.mode, "production");
});
