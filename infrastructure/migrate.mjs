import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import pg from "pg";
import { createRuntimeRoles, migrateBusiness } from "@unibos/database";
export async function applyMigrations(admin, passwords) {
  await createRuntimeRoles(admin, passwords);
  for (const [id, file] of [
    ["auth-001", "001-auth.sql"],
    ["auth-002", "002-rate-retention-index.sql"],
  ])
    await applyAuthMigration(admin, id, file);
  await migrateBusiness(admin);
}
async function applyAuthMigration(admin, id, file) {
  const sql = await readFile(
    new URL(`../packages/security/migrations/${file}`, import.meta.url),
    "utf8",
  );
  const checksum = createHash("sha256").update(sql).digest("hex");
  const client = await admin.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [817624920]);
    await client.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    await client.query(
      "CREATE TABLE IF NOT EXISTS public.unibos_auth_migrations(id text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    await client.query(
      "REVOKE ALL ON public.unibos_auth_migrations FROM PUBLIC,unibos_app,unibos_auth",
    );
    const applied = await client.query(
      "SELECT checksum FROM public.unibos_auth_migrations WHERE id=$1",
      [id],
    );
    if (applied.rowCount) {
      if (applied.rows[0].checksum !== checksum)
        throw new Error("Applied identity migration checksum mismatch");
    } else {
      await client.query(sql);
      await client.query(
        "INSERT INTO public.unibos_auth_migrations(id,checksum) VALUES($1,$2)",
        [id, checksum],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export function requireLocalMigrationEnvironment(env) {
  if (!env.MIGRATION_DATABASE_URL || env.NODE_ENV === "production")
    throw new Error("Local-only migration environment required");
  const url = new URL(env.MIGRATION_DATABASE_URL);
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !url.pathname.startsWith("/unibos") ||
    ["unibos_app", "unibos_auth"].includes(url.username)
  ) {
    throw new Error("Separate loopback UniBOS migration connection required");
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  let admin;
  try {
    requireLocalMigrationEnvironment(process.env);
    admin = new pg.Pool({
      connectionString: process.env.MIGRATION_DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 3000,
    });
    await applyMigrations(admin, {
      appPassword: process.env.APP_DATABASE_PASSWORD,
      authPassword: process.env.AUTH_DATABASE_PASSWORD,
    });
    console.log(
      "PASS: versioned local identity/business migrations; separate restricted roles; no credential values printed",
    );
  } catch {
    console.error(
      "Local database migration failed; inspect reviewed schema/configuration without exposing credentials",
    );
    process.exitCode = 1;
  } finally {
    if (admin) await admin.end();
  }
}
