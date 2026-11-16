import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Pool, PoolClient } from "pg";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USER_ID = /^[A-Za-z0-9_-]{1,128}$/;
const LOCK_ID = 817624921;

export class TenantAccessError extends Error {
  readonly code = "TENANT_ACCESS_DENIED";
  constructor() {
    super("Tenant access denied");
    this.name = "TenantAccessError";
  }
}

export interface Organization {
  id: string;
  name: string;
  created_by: string;
  created_at: Date;
}

/** No caller input may supply SQL or change the verified user's transaction identity. */
export async function withUserTransaction<T>(
  pool: Pool,
  userId: string,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return transaction(pool, userId, "", callback);
}

export async function withTenantTransaction<T>(
  pool: Pool,
  userId: string,
  organizationId: string,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!UUID.test(organizationId)) throw new TenantAccessError();
  return transaction(pool, userId, organizationId, async (client) => {
    const result = await client.query<{ allowed: boolean }>(
      "SELECT private.member_of($1::uuid) AS allowed",
      [organizationId],
    );
    if (!result.rows[0]?.allowed) throw new TenantAccessError();
    return callback(client);
  });
}

async function transaction<T>(
  pool: Pool,
  userId: string,
  organizationId: string,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!USER_ID.test(userId)) throw new TenantAccessError();
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query("SET LOCAL lock_timeout = '2s'");
    await client.query(
      "SELECT set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true)",
      [userId, organizationId],
    );
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      discard = true;
    }
    throw error;
  } finally {
    // Local GUCs disappear after COMMIT/ROLLBACK; reset also clears pre-existing
    // session-level values on a reused connection before another borrower.
    if (!discard) {
      try {
        await client.query("RESET app.user_id; RESET app.organization_id");
      } catch {
        discard = true;
      }
    }
    client.release(discard);
  }
}

/** Onboarding creates only a new organization owned by the authenticated actor. */
export async function createOrganization(
  client: PoolClient,
  name: string,
): Promise<Organization> {
  const result = await client.query<Organization>(
    "SELECT * FROM private.create_organization($1::text)",
    [name],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Organization creation failed");
  return row;
}

interface RolePasswords {
  appPassword: string;
  authPassword: string;
}

/** Explicit local provisioning. Existing role passwords are never silently rotated. */
export async function createRuntimeRoles(
  adminPool: Pool,
  passwords: RolePasswords,
): Promise<void> {
  for (const password of [passwords.appPassword, passwords.authPassword]) {
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(password)) {
      throw new Error("Runtime role password must be a strong generated value");
    }
  }
  const client = await adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_ID]);
    for (const [name, login, bypass, password] of [
      ["unibos_app", true, false, passwords.appPassword],
      ["unibos_auth", true, false, passwords.authPassword],
      ["unibos_rls_guard", false, true, ""],
      ["unibos_onboarding", false, true, ""],
    ] as const) {
      const result = await client.query<{
        rolsuper: boolean;
        rolbypassrls: boolean;
        rolcanlogin: boolean;
        rolcreaterole: boolean;
        rolcreatedb: boolean;
        rolinherit: boolean;
      }>(
        "SELECT rolsuper, rolbypassrls, rolcanlogin, rolcreaterole, rolcreatedb, rolinherit FROM pg_roles WHERE rolname = $1",
        [name],
      );
      const row = result.rows[0];
      if (!row) {
        // Names are a closed constant list and password alphabet is validated above.
        await client.query(
          `CREATE ROLE ${name} ${login ? "LOGIN" : "NOLOGIN"} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT ${bypass ? "BYPASSRLS" : "NOBYPASSRLS"}${login ? ` PASSWORD '${password}'` : ""}`,
        );
      } else if (
        row.rolsuper ||
        row.rolcreaterole ||
        row.rolcreatedb ||
        row.rolinherit ||
        row.rolcanlogin !== login ||
        row.rolbypassrls !== bypass
      ) {
        throw new Error(`Unsafe existing role attributes for ${name}`);
      }
      const memberships = await client.query(
        "SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=$1",
        [name],
      );
      if (memberships.rowCount)
        throw new Error(`Unexpected role membership for ${name}`);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Auth schema must already exist. No DDL/admin pool is used by runtime requests. */
export async function migrateBusiness(adminPool: Pool): Promise<void> {
  for (const [id, file] of [
    ["unibos-business-001", "001-business-security.sql"],
    ["unibos-business-002", "002-audit-permission-details.sql"],
    ["unibos-business-003", "003-restaurant-catalog-tables.sql"],
    ["unibos-business-004", "004-unified-orders.sql"],
    ["unibos-business-005", "005-kitchen-operations.sql"],
  ] as const)
    await applyBusinessMigration(adminPool, id, file);
}

async function applyBusinessMigration(
  adminPool: Pool,
  migrationKey: string,
  file: string,
): Promise<void> {
  const sql = await readFile(resolve(__dirname, "../migrations", file), "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");
  const client = await adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_ID]);
    await client.query(`CREATE TABLE IF NOT EXISTS public.unibos_business_migrations (
      id text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query(
      "REVOKE ALL ON public.unibos_business_migrations FROM PUBLIC, unibos_app, unibos_auth",
    );
    const applied = await client.query<{ checksum: string }>(
      "SELECT checksum FROM public.unibos_business_migrations WHERE id=$1",
      [migrationKey],
    );
    if (applied.rows[0]) {
      if (applied.rows[0].checksum !== checksum)
        throw new Error("Applied business migration checksum mismatch");
    } else {
      await client.query(sql);
      await client.query(
        "INSERT INTO public.unibos_business_migrations (id,checksum) VALUES ($1,$2)",
        [migrationKey, checksum],
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
