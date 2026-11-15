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
  assert.throws(
    () =>
      readRuntimeConfig({
        ...base,
        NODE_ENV: "production",
        DATABASE_URL: databaseUrl,
        REDIS_URL: base.REDIS_URL.replace("redis:", "rediss:"),
      }),
    /AUTH_ENABLED/,
  );
});

const securityBase = {
  ...base,
  AUTH_ENABLED: "true",
  AUTH_ALLOW_SIGNUP: "true",
  BETTER_AUTH_SECRET: "synthetic-secret-for-configuration-tests-only",
  AUTH_BASE_URL: "http://127.0.0.1:3001",
  AUTH_TRUSTED_ORIGINS: "http://127.0.0.1:3001,http://127.0.0.1:3000",
  DATABASE_URL: "postgresql://unibos_app:synthetic-test-only@127.0.0.1/unibos",
  AUTH_DATABASE_URL:
    "postgresql://unibos_auth:synthetic-test-only@127.0.0.1/unibos",
};

test("identity configuration is immutable, exact-origin and uses separate roles", () => {
  const config = readRuntimeConfig(securityBase);
  assert.ok(Object.isFrozen(config.security));
  assert.ok(Object.isFrozen(config.security.trustedOrigins));
  assert.equal(config.security.enableSignup, true);
  assert.deepEqual(config.security.trustedOrigins, [
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3000",
  ]);
});

test("unsafe auth configuration fails without credential disclosure", () => {
  for (const patch of [
    { AUTH_ENABLED: "yes" },
    { AUTH_ALLOW_SIGNUP: "yes" },
    { BETTER_AUTH_SECRET: "short" },
    { AUTH_BASE_URL: undefined },
    { AUTH_BASE_URL: "https://trusted.invalid/callback" },
    { AUTH_BASE_URL: "https://user:password@trusted.invalid" },
    { AUTH_TRUSTED_ORIGINS: "https://*.example.invalid" },
    { AUTH_TRUSTED_ORIGINS: "http://external.example.invalid" },
    { AUTH_TRUSTED_ORIGINS: "https://trusted.invalid#fragment" },
    { AUTH_DATABASE_URL: securityBase.DATABASE_URL },
    { DATABASE_URL: base.DATABASE_URL },
  ])
    assert.throws(
      () => readRuntimeConfig({ ...securityBase, ...patch }),
      (error) => {
        assert.ok(!error.message.includes("synthetic-test-only"));
        assert.ok(!error.message.includes("password@"));
        return true;
      },
    );
});

test("production identity rejects local origins, unverified TLS and unverified signup", () => {
  const production = {
    ...securityBase,
    NODE_ENV: "production",
    AUTH_ALLOW_SIGNUP: "false",
    DATABASE_URL: `${securityBase.DATABASE_URL}?sslmode=verify-full`,
    AUTH_DATABASE_URL: `${securityBase.AUTH_DATABASE_URL}?sslmode=verify-full`,
    REDIS_URL: base.REDIS_URL.replace("redis:", "rediss:"),
    AUTH_BASE_URL: "https://api.example.invalid",
    AUTH_TRUSTED_ORIGINS: "https://workspace.example.invalid",
  };
  assert.equal(readRuntimeConfig(production).security.mode, "production");
  assert.throws(
    () => readRuntimeConfig({ ...production, AUTH_ALLOW_SIGNUP: "true" }),
    /verified email/,
  );
  assert.throws(
    () =>
      readRuntimeConfig({ ...production, AUTH_BASE_URL: "http://127.0.0.1" }),
    /AUTH_BASE_URL/,
  );
  assert.throws(
    () =>
      readRuntimeConfig({
        ...production,
        AUTH_DATABASE_URL: securityBase.AUTH_DATABASE_URL,
      }),
    /verified TLS/,
  );
});
