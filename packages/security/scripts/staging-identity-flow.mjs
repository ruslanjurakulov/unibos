import { randomBytes } from "node:crypto";
import { betterAuth } from "better-auth";
import { verifyPassword } from "better-auth/crypto";
import pg from "pg";
import {
  createAuthOptions,
  verifyRestrictedIdentityRole,
} from "../dist/index.js";
import { stagingConnection } from "../../database/staging-bootstrap.mjs";

import { IdentityProvisionError } from "./staging-identity-diagnostic.mjs";

const aliases = new Map([
  ["owner", "owner@unibos-staging.invalid"],
  ["qa", "qa@unibos-staging.invalid"],
  ["qa-cashier", "qa-cashier@unibos-staging.invalid"],
  ["qa-kitchen", "qa-kitchen@unibos-staging.invalid"],
  ["qa-waiter", "qa-waiter@unibos-staging.invalid"],
]);
const origin = "https://unibos-maintenance.invalid";

export function identitySettings(env) {
  const url = env.UNIBOS_STAGING_AUTH_URL;
  const pgConfig = stagingConnection({
    ...env,
    UNIBOS_STAGING_MIGRATION_URL: url,
  });
  if (pgConfig.user !== "unibos_auth")
    throw new Error("Restricted staging identity role required");
  const password = env.UNIBOS_SYNTHETIC_PASSWORD;
  const email = aliases.get(env.UNIBOS_SYNTHETIC_ALIAS);
  if (
    !email ||
    typeof password !== "string" ||
    password.length < 24 ||
    password.length > 128 ||
    password === pgConfig.password
  )
    throw new Error("Invalid synthetic identity settings");
  return { url, email, password };
}

export function provisionHostedIdentity(env) {
  return provisionSyntheticIdentity(identitySettings(env));
}

// The CLI validates the designated hosted database before this entry point.
// The integration suite supplies a uniquely named disposable loopback database.
export function provisionLocalFixtureIdentity(settings) {
  const url = new URL(settings.url);
  if (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL ||
    url.hostname !== "127.0.0.1" ||
    url.username !== "unibos_auth" ||
    !/^\/unibos_identity_test_[a-f0-9]{32}$/.test(url.pathname)
  )
    throw new Error("Disposable local identity database required");
  return provisionSyntheticIdentity(settings);
}

async function provisionSyntheticIdentity({ url, email, password }) {
  if (![...aliases.values()].includes(email))
    throw new Error("Synthetic mailbox required");
  const database = new URL(url);
  const config = {
    mode: "test",
    secret: randomBytes(48).toString("base64url"),
    baseURL: origin,
    trustedOrigins: [origin],
    enableSignup: true,
    authDatabaseUrl: url,
  };
  const pool = new pg.Pool({
    connectionString: url,
    max: 3,
    connectionTimeoutMillis: 10000,
    statement_timeout: 10000,
    query_timeout: 12000,
    application_name: "unibos-identity-maintenance",
  });
  // An idle connection can disappear while the provider wakes or sleeps. The next query
  // reports a classified failure if it cannot reconnect.
  pool.on("error", () => undefined);
  let lock;
  let stage = "connect";
  try {
    lock = await pool.connect();
    stage = "role-check";
    await verifyRestrictedIdentityRole(lock);
    stage = "target-lock";
    const {
      rows: [target],
    } = await lock.query(
      "SELECT current_user=session_user AND current_user='unibos_auth' AND current_database()=$1 AS valid, pg_try_advisory_lock(817624923) AS acquired",
      [decodeURIComponent(database.pathname.slice(1))],
    );
    if (!target.valid || !target.acquired)
      throw new Error("Unsafe or busy staging target");
    stage = "identity-scope";
    const others = await lock.query(
      "SELECT EXISTS(SELECT FROM public.auth_users WHERE email <> ALL($1::text[])) AS exists",
      [[...aliases.values()]],
    );
    if (others.rows[0].exists)
      throw new Error("Database contains unrelated identities");
    stage = "existing-credential";
    const existing = (
      await lock.query(
        `SELECT u.id,u."emailVerified",a.password FROM public.auth_users u LEFT JOIN public.auth_accounts a ON a."userId"=u.id AND a."providerId"='credential' WHERE u.email=$1`,
        [email],
      )
    ).rows[0];
    if (existing) {
      if (
        !existing.password ||
        !(await verifyPassword({ hash: existing.password, password }))
      )
        throw new Error("Existing identity credentials differ");
      if (existing.emailVerified) return "already verified";
    }
    stage = "auth-config";
    let delivered;
    const options = createAuthOptions(config, pool);
    const auth = betterAuth({
      ...options,
      emailAndPassword: {
        ...options.emailAndPassword,
        requireEmailVerification: true,
        autoSignIn: false,
      },
      emailVerification: {
        sendOnSignUp: true,
        autoSignInAfterVerification: false,
        async sendVerificationEmail({ user, token }) {
          if (user.email !== email || delivered)
            throw new Error("Unexpected test mailbox delivery");
          delivered = { id: user.id, token };
        },
      },
    });
    stage = "register";
    if (existing) await auth.api.sendVerificationEmail({ body: { email } });
    else
      await auth.api.signUpEmail({
        body: { email, password, name: "UniBOS synthetic staging operator" },
      });
    if (!delivered) throw new Error("Synthetic verification was not delivered");
    stage = "verify-token";
    await auth.api.verifyEmail({ query: { token: delivered.token } });
    stage = "verify-result";
    const verified = await lock.query(
      'SELECT id FROM public.auth_users WHERE id=$1 AND email=$2 AND "emailVerified" IS TRUE',
      [delivered.id, email],
    );
    if (verified.rowCount !== 1)
      throw new Error("Synthetic identity verification incomplete");
    return "verified";
  } catch (error) {
    throw new IdentityProvisionError(stage, error);
  } finally {
    // Destroy the session even on failure so every exit releases its advisory lock.
    lock?.release(true);
    await pool.end();
  }
}
