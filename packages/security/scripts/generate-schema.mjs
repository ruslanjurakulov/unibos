// Read-only schema planning in a freshly created, uniquely named local scratch DB.
// DDL is limited to creating/dropping this script's scratch database.
import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { Pool } from "pg";
import { getMigrations } from "better-auth/db/migration";
import { createAuthOptions } from "../dist/index.js";
const adminUrl = new URL(process.env.MIGRATION_DATABASE_URL ?? "");
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(adminUrl.hostname) ||
  process.env.NODE_ENV === "production"
)
  throw new Error("Schema generation requires local migration connection");
const database = `auth_schema_${randomUUID().replaceAll("-", "")}`;
const admin = new Pool({ connectionString: adminUrl.href });
let scratch;
try {
  await admin.query(`CREATE DATABASE "${database}"`);
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  scratch = new Pool({ connectionString: url.href });
  const options = createAuthOptions(
    {
      mode: "test",
      secret: "schema-generation-only-not-runtime-secret-0001",
      baseURL: "http://127.0.0.1:3001",
      authDatabaseUrl: url.href,
      trustedOrigins: ["http://127.0.0.1:3001"],
      enableSignup: true,
    },
    scratch,
  );
  const migration = await getMigrations(options);
  if (migration.unsafeChanges.length || migration.schemaProblems.length)
    throw new Error("Auth schema plan rejected");
  const sql = await migration.compileMigrations();
  const assurance = `\n\n-- UniBOS session-bound step-up assurance; never inferred from user enrollment.\nCREATE TABLE public.auth_mfa_sessions (\n  session_id text PRIMARY KEY REFERENCES public.auth_sessions(id) ON DELETE CASCADE,\n  user_id text NOT NULL REFERENCES public.auth_users(id) ON DELETE CASCADE,\n  verified_at timestamptz NOT NULL DEFAULT now()\n);\nCREATE INDEX auth_mfa_sessions_user_idx ON public.auth_mfa_sessions(user_id);\n`;
  const tableList = [
    "auth_users",
    "auth_sessions",
    "auth_accounts",
    "auth_verifications",
    "auth_two_factors",
    "auth_rate_limits",
    "auth_mfa_sessions",
  ]
    .map((n) => `public.${n}`)
    .join(", ");
  const grants = `\nREVOKE ALL ON ${tableList} FROM PUBLIC;\nREVOKE ALL ON ${tableList} FROM unibos_auth;\nGRANT SELECT, INSERT, UPDATE, DELETE ON ${tableList} TO unibos_auth;\n`;
  const preview = new URL(
    "../../../work/auth-schema-preview.sql",
    import.meta.url,
  );
  await mkdir(new URL(".", preview), { recursive: true });
  await writeFile(
    preview,
    `-- Better Auth 1.7.25 official getMigrations compile output.\n-- Generated against a fresh scratch DB; apply only through the reviewed migration runner.\n${sql}${assurance}${grants}`,
  );
  console.log(
    "Auth schema preview written under ignored work/; applied versioned migration files are never overwritten.",
  );
} finally {
  if (scratch) await scratch.end();
  await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
  await admin.end();
}
