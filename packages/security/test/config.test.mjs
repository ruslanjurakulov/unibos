import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import {
  createAuthOptions,
  validateSecurityConfig,
  createSecurity,
} from "../dist/index.js";
const config = {
  secret: "synthetic-long-auth-test-secret-never-used-in-production",
  baseURL: "http://127.0.0.1:3001",
  trustedOrigins: ["http://127.0.0.1:3001"],
  authDatabaseUrl:
    "postgresql://unibos_auth:synthetic-fixture-only@127.0.0.1:1/unibos",
  mode: "test",
  enableSignup: true,
};
test("auth options preserve library hashing/CSRF, immediate revocation and shared rate limits", async () => {
  const pool = new pg.Pool({ connectionString: config.authDatabaseUrl });
  try {
    const options = createAuthOptions(config, pool);
    assert.equal(options.session.cookieCache.enabled, false);
    assert.equal(options.rateLimit.storage, "database");
    assert.equal(options.rateLimit.enabled, true);
    assert.equal(options.rateLimit.customRules["/sign-in/email"].max, 5);
    assert.equal(options.advanced.defaultCookieAttributes.httpOnly, true);
    assert.equal(options.advanced.defaultCookieAttributes.sameSite, "lax");
    assert.equal(options.account.accountLinking.enabled, false);
    assert.equal(options.emailAndPassword.minPasswordLength, 12);
    assert.equal(options.logger.disabled, true);
    assert.equal(options.plugins[0].id, "two-factor");
    assert.equal(options.advanced.disableCSRFCheck, undefined);
    assert.equal(options.advanced.disableOriginCheck, undefined);
  } finally {
    await pool.end();
  }
});
test("auth factory rejects unsafe configuration and unverified production signup", () => {
  for (const patch of [
    { secret: "short" },
    { baseURL: "http://external.invalid" },
    { trustedOrigins: ["https://*.example.invalid", config.baseURL] },
    { trustedOrigins: [] },
    { authDatabaseUrl: "https://secret.invalid" },
    { mode: "production" },
    {
      mode: "production",
      baseURL: "https://api.invalid",
      trustedOrigins: ["https://api.invalid"],
      authDatabaseUrl: config.authDatabaseUrl + "?sslmode=verify-full",
    },
  ])
    assert.throws(() => validateSecurityConfig({ ...config, ...patch }));
});
test("unavailable role errors never include connection secrets", async () => {
  await assert.rejects(createSecurity(config), (error) => {
    assert.equal(
      error.message,
      "Authentication database role unavailable or unsafe",
    );
    assert.equal(error.code, "UNIBOS_AUTH_DB_UNAVAILABLE");
    assert.ok(!error.message.includes("synthetic-fixture-only"));
    return true;
  });
});

test("identity pool rejects unbounded checkout deadlines", async () => {
  for (const n of [0, 1499, 10001, Infinity, NaN, 4000.5])
    await assert.rejects(
      createSecurity(config, { connectionTimeoutMillis: n }),
      /Invalid identity connection timeout/,
    );
});
