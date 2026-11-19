import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { createSecurity } from "@unibos/security";
import pg from "pg";
import {
  applyMigrations,
  requireLocalMigrationEnvironment,
} from "../../infrastructure/migrate.mjs";
import {
  identitySettings,
  provisionLocalFixtureIdentity,
} from "../../packages/security/scripts/staging-identity.mjs";

const password = () => randomBytes(32).toString("base64url");
test("synthetic operator CLI rejects unapproved hosts, roles, aliases and runtime execution", () => {
  const host = "ep-fixture.region.aws.neon.tech";
  const env = {
    UNIBOS_MAINTENANCE_TARGET: "dedicated-neon-staging",
    UNIBOS_STAGING_NEON_HOST: host,
    UNIBOS_STAGING_AUTH_URL: `postgresql://unibos_auth:${password()}@${host}/unibos_staging?sslmode=verify-full`,
    UNIBOS_SYNTHETIC_ALIAS: "owner",
    UNIBOS_SYNTHETIC_PASSWORD: password(),
  };
  assert.equal(identitySettings(env).email, "owner@unibos-staging.invalid");
  for (const overrides of [
    { UNIBOS_STAGING_NEON_HOST: "ep-different.region.aws.neon.tech" },
    { UNIBOS_SYNTHETIC_ALIAS: "admin@external.org" },
    {
      UNIBOS_STAGING_AUTH_URL: env.UNIBOS_STAGING_AUTH_URL.replace(
        "unibos_auth:",
        "neondb_owner:",
      ),
    },
    {
      UNIBOS_STAGING_AUTH_URL: env.UNIBOS_STAGING_AUTH_URL.replace(
        "verify-full",
        "require",
      ),
    },
    { NODE_ENV: "production" },
    { VERCEL: "1" },
  ])
    assert.throws(() => identitySettings({ ...env, ...overrides }));
});

test("isolated synthetic signup verifies the canonical token, retries safely and grants no session, role or MFA", async () => {
  requireLocalMigrationEnvironment(process.env);
  const database = "unibos_identity_test_" + randomUUID().replaceAll("-", "");
  const rootUrl = new URL(process.env.MIGRATION_DATABASE_URL);
  const admin = new pg.Pool({ connectionString: rootUrl.href, max: 1 });
  let fixture,
    created = false;
  try {
    await admin.query(`CREATE DATABASE ${database}`);
    created = true;
    rootUrl.pathname = "/" + database;
    fixture = new pg.Pool({ connectionString: rootUrl.href, max: 1 });
    await applyMigrations(fixture, {
      appPassword: process.env.APP_DATABASE_PASSWORD,
      authPassword: process.env.AUTH_DATABASE_PASSWORD,
    });
    rootUrl.username = "unibos_auth";
    rootUrl.password = process.env.AUTH_DATABASE_PASSWORD;
    const owner = {
      url: rootUrl.href,
      email: "owner@unibos-staging.invalid",
      password: password(),
    };
    assert.equal(await provisionLocalFixtureIdentity(owner), "verified");
    assert.equal(
      await provisionLocalFixtureIdentity(owner),
      "already verified",
    );
    await assert.rejects(
      provisionLocalFixtureIdentity({ ...owner, password: password() }),
    );
    const qa = {
      ...owner,
      email: "qa@unibos-staging.invalid",
      password: password(),
    };
    assert.equal(await provisionLocalFixtureIdentity(qa), "verified");
    const {
      rows: [facts],
    } = await fixture.query(
      `SELECT (SELECT count(*)::int FROM auth_users WHERE "emailVerified" AND NOT coalesce("twoFactorEnabled",false)) AS verified,(SELECT count(*)::int FROM auth_sessions) AS sessions,(SELECT count(*)::int FROM memberships) AS memberships,(SELECT count(*)::int FROM auth_mfa_sessions) AS assurances`,
    );
    assert.deepEqual(facts, {
      verified: 2,
      sessions: 0,
      memberships: 0,
      assurances: 0,
    });
    // A separately signed runtime uses the stored credential while public signup stays closed.
    let security;
    const server = createServer(
      (request, response) => void security.nodeHandler(request, response),
    );
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const origin = `http://127.0.0.1:${server.address().port}`;
    try {
      security = await createSecurity({
        mode: "test",
        secret: password(),
        baseURL: origin,
        trustedOrigins: [origin],
        enableSignup: false,
        authDatabaseUrl: rootUrl.href,
      });
      const submit = (path, body) =>
        fetch(origin + path, {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      const registration = await submit("/api/auth/sign-up/email", {
        name: "Synthetic",
        email: "new@example.invalid",
        password: password(),
      });
      assert.ok([400, 403].includes(registration.status));
      const login = await submit("/api/auth/sign-in/email", {
        email: owner.email,
        password: owner.password,
      });
      assert.equal(login.status, 200);
      assert.ok(login.headers.getSetCookie().length > 0);
      const { user } = await login.json();
      assert.equal(user.emailVerified, true);
      assert.equal(user.email, owner.email);
      const pendingMfa = await fixture.query(
        "SELECT count(*)::int AS count FROM auth_mfa_sessions",
      );
      assert.equal(pendingMfa.rows[0].count, 0);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await security?.close();
    }
    // Simulate an interrupted registration before the test mailbox was verified.
    await fixture.query(
      'UPDATE auth_users SET "emailVerified"=false WHERE email=$1',
      [qa.email],
    );
    assert.equal(await provisionLocalFixtureIdentity(qa), "verified");
    await fixture.query(
      `INSERT INTO auth_users(id,name,email,"emailVerified") VALUES('fixture','Unrelated','other@example.invalid',false)`,
    );
    await assert.rejects(provisionLocalFixtureIdentity(owner), /unrelated/);
  } finally {
    await fixture?.end();
    if (created) await admin.query(`DROP DATABASE ${database}`);
    await admin.end();
  }
});
