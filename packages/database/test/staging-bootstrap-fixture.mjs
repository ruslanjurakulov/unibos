import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { bootstrapEmptyStaging } from "../staging-bootstrap.mjs";

// Called only inside the rehearsal's newly initialized private cluster.
export async function verifyStagingBootstrap(admin, connection, passwords) {
  const password = randomBytes(32).toString("hex");
  await admin.query(
    `CREATE ROLE rehearsal_owner LOGIN CREATEROLE BYPASSRLS PASSWORD '${password}'`,
  );
  await admin.query("CREATE DATABASE unibos_staging OWNER rehearsal_owner");
  const owner = new pg.Pool({
    ...connection,
    database: "unibos_staging",
    user: "rehearsal_owner",
    password,
    max: 1,
  });
  const app = new pg.Client({
    ...connection,
    database: "unibos_staging",
    user: "unibos_app",
    password: passwords.appPassword,
  });
  try {
    await assert.rejects(
      bootstrapEmptyStaging(admin, passwords),
      /Dedicated database owner/,
    );
    // Fail after role provisioning: database ownership alone does not grant CREATE in a schema after an explicit revoke.
    await owner.query("REVOKE CREATE ON SCHEMA public FROM pg_database_owner");
    await assert.rejects(bootstrapEmptyStaging(owner, passwords), {
      code: "42501",
    });
    assert.equal(
      (
        await admin.query(
          "SELECT rolname FROM pg_roles WHERE rolname IN ('unibos_app','unibos_auth','unibos_rls_guard','unibos_onboarding')",
        )
      ).rowCount,
      0,
    );
    await owner.query("GRANT CREATE ON SCHEMA public TO pg_database_owner");
    await bootstrapEmptyStaging(owner, passwords);
    await assert.rejects(
      bootstrapEmptyStaging(owner, passwords),
      /unused runtime roles/,
    );
    const {
      rows: [ledger],
    } = await owner.query(
      `SELECT (SELECT count(*)::int FROM unibos_auth_migrations) AS auth, (SELECT count(*)::int FROM unibos_business_migrations) AS business`,
    );
    assert.equal(ledger.auth, 2);
    assert.ok(ledger.business >= 7);
    const { rows: unexpected } = await owner.query(
      `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.prosecdef AND pg_get_userbyid(p.proowner) NOT IN ('unibos_rls_guard','unibos_onboarding')`,
    );
    assert.equal(unexpected.length, 0);
    await app.connect();
    assert.equal((await app.query("SELECT id FROM organizations")).rowCount, 0);
    await assert.rejects(app.query("SELECT id FROM auth_users"), {
      code: "42501",
    });
    await assert.rejects(app.query("SET ROLE unibos_rls_guard"), {
      code: "42501",
    });
    console.log(
      "PASS: restricted staging owner migrated with temporary grants; rollback, function ownership, role restrictions and repeat refusal verified",
    );
  } finally {
    await app.end();
    await owner.end();
  }
}
