import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { betterAuth } from "better-auth";
import { verifyPassword } from "better-auth/crypto";
import pg from "pg";
import { createAuthOptions, createSecurity } from "../dist/index.js";
import { stagingConnection } from "../../database/staging-bootstrap.mjs";

const aliases = new Map([
  ["owner", "owner@unibos-staging.invalid"],
  ["qa", "qa@unibos-staging.invalid"],
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
  // Exercise the application's existing catalog-of-privileges check on this role.
  const guard = await createSecurity(config);
  await guard.close();
  const pool = new pg.Pool({
    connectionString: url,
    max: 3,
    connectionTimeoutMillis: 8000,
  });
  let lock;
  try {
    lock = await pool.connect();
    const {
      rows: [target],
    } = await lock.query(
      "SELECT current_user=session_user AND current_user='unibos_auth' AND current_database()=$1 AS valid, pg_try_advisory_lock(817624923) AS acquired",
      [decodeURIComponent(database.pathname.slice(1))],
    );
    if (!target.valid || !target.acquired)
      throw new Error("Unsafe or busy staging target");
    const others = await lock.query(
      "SELECT EXISTS(SELECT FROM public.auth_users WHERE email <> ALL($1::text[])) AS exists",
      [[...aliases.values()]],
    );
    if (others.rows[0].exists)
      throw new Error("Database contains unrelated identities");
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
    if (existing) await auth.api.sendVerificationEmail({ body: { email } });
    else
      await auth.api.signUpEmail({
        body: { email, password, name: "UniBOS synthetic staging operator" },
      });
    if (!delivered) throw new Error("Synthetic verification was not delivered");
    await auth.api.verifyEmail({ query: { token: delivered.token } });
    const verified = await lock.query(
      'SELECT id FROM public.auth_users WHERE id=$1 AND email=$2 AND "emailVerified" IS TRUE',
      [delivered.id, email],
    );
    if (verified.rowCount !== 1)
      throw new Error("Synthetic identity verification incomplete");
    return "verified";
  } finally {
    // Destroy the session even on failure so every exit releases its advisory lock.
    lock?.release(true);
    await pool.end();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = await provisionSyntheticIdentity(
      identitySettings(process.env),
    );
    console.log(
      `Synthetic staging identity ${result}. Complete authenticator enrollment in the protected browser.`,
    );
  } catch {
    console.error(
      "Synthetic identity provisioning failed. Verify the staging target, restricted identity role, alias and original password.",
    );
    process.exitCode = 1;
  }
}
