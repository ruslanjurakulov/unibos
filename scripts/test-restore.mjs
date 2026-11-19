import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { createRuntimeRoles } from "@unibos/database";
import { applyMigrations } from "../infrastructure/migrate.mjs";

// The rehearsal accepts a tool directory, never a database URI or existing data directory.
const bin =
  process.env.POSTGRES_BINDIR ||
  execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim();
const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("PG")),
);
const administrator = "unibos_restore_admin";
const root = mkdtempSync(join(tmpdir(), "unibos-dr-"));
const archive = join(root, "snapshot.dump");
const randomPassword = () => randomBytes(32).toString("hex");

function command(binary, args, env = {}) {
  return execFileSync(join(bin, binary), args, {
    env: { ...cleanEnv, ...env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

function stopCluster(data) {
  if (existsSync(join(data, "postmaster.pid")))
    command("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
}

function cleanup() {
  for (const name of ["source", "target"])
    stopCluster(join(root, name, "data"));
  rmSync(root, { recursive: true, force: true });
}

for (const [signal, code] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
]) {
  process.once(signal, () => {
    cleanup();
    process.exit(code);
  });
}

async function withCluster(name, job) {
  const dir = join(root, name);
  const data = join(dir, "data");
  const passwordFile = join(dir, "pw");
  const password = randomPassword();
  mkdirSync(dir, { mode: 0o700 });
  writeFileSync(passwordFile, password, { mode: 0o600 });
  command("initdb", [
    "-D",
    data,
    "-U",
    administrator,
    "--pwfile",
    passwordFile,
    "-A",
    "scram-sha-256",
    "--locale=C",
    "-E",
    "UTF8",
    "-c",
    "listen_addresses=",
    "-c",
    `unix_socket_directories=${dir}`,
    "-c",
    "unix_socket_permissions=0700",
  ]);
  const connection = {
    host: dir,
    port: 5432,
    database: "postgres",
    user: administrator,
    password,
    ssl: false,
  };
  const admin = new pg.Pool({
    ...connection,
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  try {
    command("pg_ctl", [
      "-D",
      data,
      "-l",
      join(dir, "server.log"),
      "-w",
      "start",
    ]);
    await job(
      admin,
      connection,
      {
        PGHOST: dir,
        PGPORT: "5432",
        PGUSER: administrator,
        PGPASSWORD: password,
      },
      { appPassword: randomPassword(), authPassword: randomPassword() },
    );
  } finally {
    await admin.end();
    stopCluster(data);
  }
}

async function ledgers(admin) {
  const { rows } =
    await admin.query(`SELECT id, checksum, applied_at::text FROM public.unibos_business_migrations
    UNION ALL SELECT id, checksum, applied_at::text FROM public.unibos_auth_migrations ORDER BY id`);
  assert.ok(rows.some(({ id }) => id === "auth-002"));
  assert.ok(rows.some(({ id }) => id === "unibos-business-007"));
  return rows;
}

async function verifyAccess(admin, connection, roles, organizations) {
  const { rows } = await admin.query(
    "SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid='public.organizations'::regclass",
  );
  assert.deepEqual(rows, [{ relrowsecurity: true, relforcerowsecurity: true }]);
  const app = new pg.Client({
    ...connection,
    user: "unibos_app",
    password: roles.appPassword,
  });
  await app.connect();
  try {
    assert.equal((await app.query("SELECT id FROM organizations")).rowCount, 0);
    for (const { actor, id } of organizations) {
      await app.query("SELECT set_config('app.user_id',$1,false)", [actor]);
      assert.deepEqual((await app.query("SELECT id FROM organizations")).rows, [
        { id },
      ]);
    }
    await assert.rejects(app.query("SELECT id FROM auth_users"), {
      code: "42501",
    });
    await assert.rejects(
      app.query("SELECT id FROM unibos_business_migrations"),
      { code: "42501" },
    );
  } finally {
    await app.end();
  }
}

try {
  let expectedLedgers;
  const organizations = [];
  const version = command("pg_dump", ["--version"]).trim();
  await withCluster("source", async (admin, _connection, env, roles) => {
    await applyMigrations(admin, roles);
    for (const actor of ["synthetic-a", "synthetic-b"]) {
      await admin.query(
        'INSERT INTO auth_users(id, name, email, "emailVerified") VALUES($1, $1, $2, false)',
        [actor, `${actor}@example.invalid`],
      );
      await admin.query("SELECT set_config('app.user_id',$1,false)", [actor]);
      const {
        rows: [org],
      } = await admin.query("SELECT id FROM private.create_organization($1)", [
        actor,
      ]);
      organizations.push({ actor, id: org.id });
    }
    expectedLedgers = await ledgers(admin);
    command(
      "pg_dump",
      ["--format=custom", "--file", archive, "--dbname=postgres"],
      env,
    );
  });
  await withCluster("target", async (admin, connection, env, roles) => {
    // Logical dumps omit global roles. Recreate their reviewed attributes with fresh credentials before restoring ACLs and ownership.
    await createRuntimeRoles(admin, roles);
    command(
      "pg_restore",
      ["--exit-on-error", "--single-transaction", "--dbname=postgres", archive],
      env,
    );
    assert.deepEqual(await ledgers(admin), expectedLedgers);
    await applyMigrations(admin, roles);
    assert.deepEqual(await ledgers(admin), expectedLedgers);
    await verifyAccess(admin, connection, roles, organizations);
  });
  console.log(
    `PASS: ${version}; restored custom archive in a fresh cluster, ${expectedLedgers.length} ledger rows, 2 synthetic tenants, runtime grants and FORCE RLS.`,
  );
} finally {
  cleanup();
}
