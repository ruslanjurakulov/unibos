import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createRuntimeRoles, withMigrationTransaction } from "@unibos/database";
import { applyMigrations } from "../../infrastructure/migrate.mjs";

const database = "unibos_staging";
const roles = [
  "unibos_app",
  "unibos_auth",
  "unibos_rls_guard",
  "unibos_onboarding",
];

export function stagingConnection(env) {
  if (
    env.UNIBOS_MAINTENANCE_TARGET !== "dedicated-neon-staging" ||
    env.NODE_ENV === "production" ||
    env.VERCEL ||
    env.VERCEL_ENV
  )
    throw new Error("Dedicated staging maintenance process required");
  const host = env.UNIBOS_STAGING_NEON_HOST || "";
  if (
    !/^ep-[a-z0-9-]+(?:\.[a-z0-9-]+)+\.neon\.tech$/.test(host) ||
    host.split(".")[0].endsWith("-pooler")
  )
    throw new Error("An approved direct Neon endpoint is required");
  const url = new URL(env.UNIBOS_STAGING_MIGRATION_URL);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== host ||
    (url.port && url.port !== "5432") ||
    url.hash ||
    url.pathname !== `/${database}` ||
    url.search !== "?sslmode=verify-full" ||
    !url.username ||
    !url.password
  )
    throw new Error(
      "Staging migration connection does not match the designated target",
    );
  return {
    host,
    port: 5432,
    database,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl: { rejectUnauthorized: true },
    max: 1,
    connectionTimeoutMillis: 10000,
  };
}

export async function bootstrapEmptyStaging(pool, passwords) {
  if (
    !passwords.appPassword ||
    passwords.appPassword === passwords.authPassword
  )
    throw new Error("Distinct staging runtime passwords are required");
  await withMigrationTransaction(pool, async (client) => {
    await client.query("SET LOCAL lock_timeout='10s'");
    await client.query(
      "SELECT pg_advisory_xact_lock(817624920), pg_advisory_xact_lock(817624921)",
    );
    const {
      rows: [checks],
    } = await client.query(
      `SELECT current_database()=$1 AND current_user=session_user
      AND current_user=pg_get_userbyid(d.datdba) AND NOT r.rolsuper AND r.rolcreaterole AND r.rolbypassrls
      AND current_setting('server_version_num')::int >= 160000 AS eligible,
      NOT EXISTS (SELECT FROM pg_roles WHERE rolname=ANY($2::text[]))
      AND NOT EXISTS (SELECT FROM pg_namespace n WHERE n.nspname NOT IN ('pg_catalog','pg_toast','information_schema','public') AND n.nspname !~ '^pg_(temp|toast_temp)_[0-9]+$')
      AND NOT EXISTS (SELECT FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public')
      AND NOT EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND NOT EXISTS (SELECT FROM pg_depend dep WHERE dep.classid='pg_class'::regclass AND dep.objid=c.oid AND dep.deptype='e'))
      AND NOT EXISTS (SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND NOT EXISTS (SELECT FROM pg_depend dep WHERE dep.classid='pg_proc'::regclass AND dep.objid=p.oid AND dep.deptype='e')) AS fresh
      FROM pg_roles r JOIN pg_database d ON d.datname=current_database() WHERE r.rolname=current_user`,
      [database, roles],
    );
    if (!checks?.eligible)
      throw new Error(
        "Dedicated database owner must have effective CREATEROLE and BYPASSRLS",
      );
    if (!checks.fresh)
      throw new Error(
        "New isolated staging database and unused runtime roles required",
      );
    const target = { transaction: client };
    await client.query("SET LOCAL createrole_self_grant='inherit,set'");
    await createRuntimeRoles(target, passwords);
    await client.query("CREATE SCHEMA private");
    await client.query(
      "GRANT CREATE ON SCHEMA private TO unibos_rls_guard,unibos_onboarding",
    );
    await applyMigrations(target, passwords);
    await client.query(
      "REVOKE CREATE ON SCHEMA private FROM unibos_rls_guard,unibos_onboarding",
    );
    await client.query(
      "REVOKE unibos_app,unibos_auth,unibos_rls_guard,unibos_onboarding FROM CURRENT_USER",
    );
    const { rows: violations } = await client.query(
      `SELECT rolname FROM pg_roles r WHERE rolname=ANY($1::text[]) AND (
      pg_has_role(current_user,r.oid,'SET') OR pg_has_role(current_user,r.oid,'USAGE') OR rolreplication
      OR has_schema_privilege(r.oid,'private','CREATE') OR has_schema_privilege(r.oid,'public','CREATE'))`,
      [roles],
    );
    if (violations.length)
      throw new Error("Temporary staging grants remaining");
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  let pool;
  try {
    const connection = stagingConnection(process.env);
    if (
      [
        process.env.UNIBOS_STAGING_APP_PASSWORD,
        process.env.UNIBOS_STAGING_AUTH_PASSWORD,
      ].includes(connection.password)
    )
      throw new Error("Separate maintenance credential required");
    pool = new pg.Pool(connection);
    await bootstrapEmptyStaging(pool, {
      appPassword: process.env.UNIBOS_STAGING_APP_PASSWORD,
      authPassword: process.env.UNIBOS_STAGING_AUTH_PASSWORD,
    });
    console.log(
      "PASS: new dedicated staging schema initialized; temporary role grants revoked",
    );
  } catch {
    console.error(
      "Staging bootstrap failed. Verify the dedicated endpoint, empty database and administrative capabilities.",
    );
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}
