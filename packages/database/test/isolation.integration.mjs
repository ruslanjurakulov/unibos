import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import {
  createRuntimeRoles,
  migrateBusiness,
  withUserTransaction,
  withTenantTransaction,
  createOrganization,
  TenantAccessError,
} from "../dist/index.js";

const adminUrl = process.env.MIGRATION_DATABASE_URL;
if (!adminUrl || process.env.NODE_ENV === "production")
  throw new Error("Local migration database configuration required");
const parsed = new URL(adminUrl);
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(parsed.hostname))
  throw new Error("Integration database must be local");
const db = `unibos_security_test_${randomUUID().replaceAll("-", "")}`;
const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
let cleaning = false;
const idleErrors = [];
const watch = (pool) =>
  pool.on("error", (error) => {
    if (!cleaning) idleErrors.push(error.code);
  });
watch(admin);
let fixture;
let app;
const urlFor = (user, password) => {
  const url = new URL(adminUrl);
  url.pathname = `/${db}`;
  url.username = user;
  url.password = password;
  return url.href;
};

await test("real restricted-role PostgreSQL isolation and audit", async (t) => {
  try {
    await createRuntimeRoles(admin, {
      appPassword: process.env.APP_DATABASE_PASSWORD,
      authPassword: process.env.AUTH_DATABASE_PASSWORD,
    });
    await admin.query(`CREATE DATABASE ${db}`);
    const isolatedAdminUrl = new URL(adminUrl);
    isolatedAdminUrl.pathname = `/${db}`;
    fixture = new pg.Pool({ connectionString: isolatedAdminUrl.href, max: 1 });
    watch(fixture);
    // Synthetic prerequisite identity table exists only inside this owned disposable test DB.
    await fixture.query("CREATE TABLE public.auth_users (id text PRIMARY KEY)");
    await fixture.query(
      "INSERT INTO public.auth_users(id) VALUES ('owner_a'),('owner_b'),('staff_a'),('administrator_a'),('director_a'),('outsider')",
    );
    await migrateBusiness(fixture);
    await migrateBusiness(fixture); // An unchanged migration must be idempotent.
    app = new pg.Pool({
      connectionString: urlFor("unibos_app", process.env.APP_DATABASE_PASSWORD),
      max: 1,
    });
    watch(app);
    const orgA = await withUserTransaction(app, "owner_a", (c) =>
      createOrganization(c, "Tenant A"),
    );
    const orgB = await withUserTransaction(app, "owner_b", (c) =>
      createOrganization(c, "Tenant B"),
    );
    const branch = (actor, org, name) =>
      withTenantTransaction(
        app,
        actor,
        org,
        async (c) =>
          (
            await c.query(
              "INSERT INTO branches(organization_id,name) VALUES($1,$2) RETURNING id",
              [org, name],
            )
          ).rows[0].id,
      );
    const branchA = await branch("owner_a", orgA.id, "A primary");
    const branchA2 = await branch("owner_a", orgA.id, "A other");
    const branchB = await branch("owner_b", orgB.id, "B primary");
    const grant = (actor, target, role, branchId) =>
      withTenantTransaction(
        app,
        actor,
        orgA.id,
        async (c) =>
          (
            await c.query(
              "INSERT INTO memberships(organization_id,user_id,role,branch_id) VALUES($1,$2,$3,$4) RETURNING id",
              [orgA.id, target, role, branchId],
            )
          ).rows[0].id,
      );
    const staffMembership = await grant(
      "owner_a",
      "staff_a",
      "waiter",
      branchA,
    );
    await grant("owner_a", "administrator_a", "administrator", branchA);
    await grant("owner_a", "director_a", "director", null);

    await t.test(
      "runtime roles are non-owner/non-bypass and all tenant tables FORCE RLS",
      async () => {
        const role = await app.query(
          "SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolinherit FROM pg_roles WHERE rolname=current_user",
        );
        assert.deepEqual(role.rows[0], {
          rolsuper: false,
          rolbypassrls: false,
          rolcreaterole: false,
          rolcreatedb: false,
          rolinherit: false,
        });
        const tables = await fixture.query(
          "SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname owner FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.relname=ANY($1::text[])",
          [["organizations", "branches", "memberships", "audit_events"]],
        );
        assert.equal(tables.rows.length, 4);
        for (const row of tables.rows) {
          assert(row.relrowsecurity && row.relforcerowsecurity);
          assert.notEqual(row.owner, "unibos_app");
        }
        const auditFunction = await fixture.query(
          "SELECT r.rolname,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='private' AND p.proname='record_business_audit'",
        );
        assert.equal(auditFunction.rows[0].rolname, "unibos_onboarding");
        assert.equal(auditFunction.rows[0].prosecdef, true);
        assert.ok(
          auditFunction.rows[0].proconfig.includes("search_path=pg_catalog"),
        );
        await assert.rejects(app.query("SET ROLE unibos_rls_guard"), {
          code: "42501",
        });
        await assert.rejects(app.query("SET ROLE unibos_onboarding"), {
          code: "42501",
        });
        await assert.rejects(app.query("SELECT * FROM auth_users"), {
          code: "42501",
        });
        await assert.rejects(
          app.query("CREATE TABLE public.unauthorized(id integer)"),
          { code: "42501" },
        );
      },
    );

    await t.test(
      "missing identity and forged tenant selection reveal no records",
      async () => {
        for (const table of [
          "organizations",
          "branches",
          "memberships",
          "audit_events",
        ])
          assert.equal(
            (await app.query(`SELECT * FROM ${table}`)).rows.length,
            0,
          );
        await assert.rejects(
          app.query("SELECT * FROM private.create_organization('No context')"),
          { code: "42501" },
        );
        await assert.rejects(
          withTenantTransaction(app, "owner_a", orgB.id, async () => undefined),
          TenantAccessError,
        );
        await withUserTransaction(app, "outsider", async (c) => {
          await c.query("SELECT set_config('app.organization_id',$1,true)", [
            orgA.id,
          ]);
          assert.equal(
            (await c.query("SELECT * FROM branches")).rows.length,
            0,
          );
          assert.equal(
            (await c.query("SELECT * FROM memberships")).rows.length,
            0,
          );
        });
        await assert.rejects(
          withUserTransaction(app, "outsider", async (c) => {
            await c.query("SELECT set_config('app.organization_id',$1,true)", [
              orgA.id,
            ]);
            await c.query(
              "INSERT INTO branches(organization_id,name) VALUES($1,'Forged')",
              [orgA.id],
            );
          }),
          { code: "42501" },
        );
      },
    );

    await t.test(
      "branch staff cannot read or mutate other branches or tenant audit",
      async () => {
        await withTenantTransaction(app, "staff_a", orgA.id, async (c) => {
          assert.deepEqual(
            (await c.query("SELECT id FROM branches ORDER BY id")).rows.map(
              (row) => row.id,
            ),
            [branchA],
          );
          assert.equal(
            (await c.query("SELECT * FROM audit_events")).rows.length,
            0,
          );
          assert.equal(
            (
              await c.query("UPDATE branches SET name='Nope' WHERE id=$1", [
                branchA2,
              ])
            ).rowCount,
            0,
          );
        });
        await withTenantTransaction(
          app,
          "administrator_a",
          orgA.id,
          async (c) => {
            assert.equal(
              (
                await c.query(
                  "UPDATE branches SET name='Allowed' WHERE id=$1",
                  [branchA],
                )
              ).rowCount,
              1,
            );
            assert.equal(
              (
                await c.query("UPDATE branches SET name='Nope' WHERE id=$1", [
                  branchA2,
                ])
              ).rowCount,
              0,
            );
          },
        );
      },
    );

    await t.test(
      "composite branch foreign keys reject cross-tenant references",
      async () => {
        await assert.rejects(grant("owner_a", "outsider", "waiter", branchB), {
          code: "23503",
        });
      },
    );

    await t.test(
      "role promotion/owner mutation and unscoped staff grants are denied",
      async () => {
        await assert.rejects(
          grant("staff_a", "outsider", "administrator", branchA),
          { code: "42501" },
        );
        await assert.rejects(
          grant("director_a", "outsider", "director", null),
          { code: "42501" },
        );
        await assert.rejects(grant("owner_a", "outsider", "owner", null), {
          code: "42501",
        });
        await assert.rejects(grant("owner_a", "outsider", "cashier", null), {
          code: "23514",
        });
        await withTenantTransaction(app, "owner_a", orgA.id, async (c) => {
          assert.equal(
            (await c.query("DELETE FROM memberships WHERE role='owner'"))
              .rowCount,
            0,
          );
          assert.equal(
            (
              await c.query(
                "UPDATE memberships SET role='director' WHERE role='owner'",
              )
            ).rowCount,
            0,
          );
        });
        await assert.rejects(
          withTenantTransaction(app, "owner_a", orgA.id, (c) =>
            c.query("UPDATE memberships SET organization_id=$1 WHERE id=$2", [
              orgB.id,
              staffMembership,
            ]),
          ),
          { code: "42501" },
        );
      },
    );

    await t.test(
      "automatic audit is tenant-scoped and cannot be forged or modified",
      async () => {
        await withTenantTransaction(app, "owner_a", orgA.id, async (c) => {
          const events = await c.query(
            "SELECT * FROM audit_events ORDER BY created_at,id",
          );
          assert(events.rows.length >= 7);
          assert(events.rows.every((row) => row.organization_id === orgA.id));
          assert(
            events.rows.some(
              (row) =>
                row.action === "branches.update" &&
                row.actor_user_id === "administrator_a",
            ),
          );
        });
        for (const sql of [
          "UPDATE audit_events SET action='organizations.insert'",
          "DELETE FROM audit_events",
          "TRUNCATE audit_events",
          "INSERT INTO audit_events(organization_id,actor_user_id,action,entity_id) VALUES($1,'owner_a','organizations.insert',$1)",
        ]) {
          await assert.rejects(
            withTenantTransaction(app, "owner_a", orgA.id, (c) =>
              c.query(sql, sql.includes("$1") ? [orgA.id] : []),
            ),
            { code: "42501" },
          );
        }
      },
    );

    await t.test(
      "rollback and reuse cannot leak another user's context",
      async () => {
        await assert.rejects(
          withTenantTransaction(app, "owner_a", orgA.id, async (c) => {
            await c.query(
              "INSERT INTO branches(organization_id,name) VALUES($1,'Must roll back')",
              [orgA.id],
            );
            throw new Error("rollback test");
          }),
          /rollback test/,
        );
        assert.equal(
          (await app.query("SELECT * FROM organizations")).rows.length,
          0,
        );
        await withTenantTransaction(app, "owner_b", orgB.id, async (c) => {
          assert.deepEqual(
            (await c.query("SELECT id FROM organizations")).rows.map(
              (row) => row.id,
            ),
            [orgB.id],
          );
          assert.deepEqual(
            (await c.query("SELECT id FROM branches")).rows.map(
              (row) => row.id,
            ),
            [branchB],
          );
        });
        await withTenantTransaction(app, "owner_a", orgA.id, async (c) => {
          assert.equal(
            (
              await c.query(
                "SELECT * FROM branches WHERE name='Must roll back'",
              )
            ).rows.length,
            0,
          );
          assert.equal(
            (
              await c.query(
                "SELECT * FROM audit_events WHERE action='branches.insert'",
              )
            ).rows.length,
            2,
          );
        });
      },
    );

    await t.test(
      "membership revocation immediately removes tenant access",
      async () => {
        await withTenantTransaction(app, "owner_a", orgA.id, (c) =>
          c.query("DELETE FROM memberships WHERE id=$1", [staffMembership]),
        );
        await assert.rejects(
          withTenantTransaction(app, "staff_a", orgA.id, async () => undefined),
          TenantAccessError,
        );
        await withUserTransaction(app, "staff_a", async (c) =>
          assert.equal(
            (await c.query("SELECT * FROM organizations")).rows.length,
            0,
          ),
        );
      },
    );

    await t.test("applied migration checksum changes fail closed", async () => {
      await fixture.query(
        "UPDATE public.unibos_business_migrations SET checksum='tampered'",
      );
      await assert.rejects(migrateBusiness(fixture), /checksum mismatch/);
    });
    assert.deepEqual(
      idleErrors,
      [],
      "Unexpected idle connection error before cleanup",
    );
  } finally {
    cleaning = true;
    if (app) await app.end();
    if (fixture) await fixture.end();
    await admin.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
    await admin.end();
  }
});
