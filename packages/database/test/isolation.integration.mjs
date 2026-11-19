import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import pg from "pg";
import { checkOwnerAnalytics } from "./check-owner-analytics.mjs";
import {
  createRuntimeRoles,
  migrateBusiness,
  withUserTransaction,
  withTenantTransaction,
  createOrganization,
  TenantAccessError,
} from "../dist/index.js";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  handleSecurityRoute,
  sendSafeApiError,
} = require("../../../apps/api/dist/security-routes.js");

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
      "INSERT INTO public.auth_users(id) VALUES ('owner_a'),('owner_b'),('staff_a'),('administrator_a'),('director_a'),('cashier_a'),('cashier_b'),('accountant_a'),('kitchen_a'),('multi_scope_a'),('outsider')",
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
    await grant("owner_a", "cashier_a", "cashier", branchA);
    await grant("owner_a", "cashier_b", "cashier", branchA);
    await grant("owner_a", "accountant_a", "accountant", branchA);
    await grant("owner_a", "kitchen_a", "kitchen", branchA);

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
          [
            [
              "organizations",
              "branches",
              "memberships",
              "audit_events",
              "kitchen_tickets",
              "kitchen_ticket_items",
              "kitchen_ticket_events",
              "cash_shifts",
              "cash_shift_events",
              "cash_drawer_movements",
              "cash_shift_idempotency_keys",
              "cash_payments",
              "cash_payment_events",
              "cash_payment_ledger_entries",
              "cash_payment_idempotency_keys",
            ],
          ],
        );
        assert.equal(tables.rows.length, 15);
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
          "cash_payments",
          "cash_payment_events",
          "cash_payment_ledger_entries",
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
      "catalog roles, immutable price history and branch availability are isolated",
      async () => {
        const category = await withTenantTransaction(
          app,
          "owner_a",
          orgA.id,
          async (c) =>
            (
              await c.query(
                "INSERT INTO product_categories(organization_id,name) VALUES($1,'Food') RETURNING id",
                [orgA.id],
              )
            ).rows[0].id,
        );
        const product = await withTenantTransaction(
          app,
          "owner_a",
          orgA.id,
          async (c) =>
            (
              await c.query(
                "INSERT INTO products(organization_id,category_id,name) VALUES($1,$2,'Soup') RETURNING id",
                [orgA.id, category],
              )
            ).rows[0].id,
        );
        const setPrice = (actor, branchId, amount = 125000, currency = "UZS") =>
          withTenantTransaction(app, actor, orgA.id, (c) =>
            c.query(
              "INSERT INTO product_price_versions(organization_id,branch_id,product_id,price_minor,currency_code) VALUES($1,$2,$3,$4,$5)",
              [orgA.id, branchId, product, amount, currency],
            ),
          );
        await setPrice("owner_a", branchA);
        await setPrice("owner_a", branchA, 130000);
        await setPrice("director_a", branchA, 140000);
        await assert.rejects(setPrice("owner_a", branchA, -1), {
          code: "23514",
        });
        await assert.rejects(setPrice("owner_a", branchA, 1, "US"), {
          code: "23514",
        });
        await assert.rejects(setPrice("administrator_a", branchA), {
          code: "42501",
        });
        await withTenantTransaction(app, "owner_b", orgB.id, async (c) => {
          assert.equal(
            (await c.query("SELECT * FROM product_categories")).rows.length,
            0,
          );
          assert.equal(
            (await c.query("SELECT * FROM products")).rows.length,
            0,
          );
        });
        await withTenantTransaction(app, "owner_a", orgA.id, async (c) => {
          const rows = await c.query(
            "SELECT price_minor,currency_code FROM product_price_versions WHERE product_id=$1 ORDER BY effective_at,id",
            [product],
          );
          assert.deepEqual(
            rows.rows.map((r) => Number(r.price_minor)),
            [125000, 130000, 140000],
          );
          await c.query(
            "INSERT INTO branch_product_availability(organization_id,branch_id,product_id,available) VALUES($1,$2,$3,false)",
            [orgA.id, branchA, product],
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
                  "UPDATE branch_product_availability SET available=true WHERE product_id=$1",
                  [product],
                )
              ).rowCount,
              1,
            );
            assert.equal(
              (
                await c.query(
                  "UPDATE products SET name='Forbidden' WHERE id=$1",
                  [product],
                )
              ).rowCount,
              0,
            );
            assert.equal(
              (
                await c.query(
                  "SELECT * FROM product_price_versions WHERE branch_id=$1",
                  [branchA2],
                )
              ).rows.length,
              0,
            );
          },
        );
        for (const actor of ["staff_a", "cashier_a", "kitchen_a"]) {
          await assert.rejects(
            withTenantTransaction(app, actor, orgA.id, (c) =>
              c.query(
                "INSERT INTO branch_product_availability(organization_id,branch_id,product_id,available) VALUES($1,$2,$3,false)",
                [orgA.id, branchA, product],
              ),
            ),
            { code: "42501" },
          );
        }
      },
    );

    await t.test(
      "tables and QR tokens bind to one branch, keep only hashes and revoke once",
      async () => {
        const tableId = await withTenantTransaction(
          app,
          "administrator_a",
          orgA.id,
          async (c) =>
            (
              await c.query(
                "INSERT INTO restaurant_tables(organization_id,branch_id,table_code,display_name,seats) VALUES($1,$2,'T1','Table 1',4) RETURNING id",
                [orgA.id, branchA],
              )
            ).rows[0].id,
        );
        const tokenHash = Buffer.alloc(32, 3);
        const token = await withTenantTransaction(
          app,
          "administrator_a",
          orgA.id,
          async (c) =>
            (
              await c.query(
                "INSERT INTO table_qr_tokens(organization_id,branch_id,table_id,token_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '1 day') RETURNING id,table_id,expires_at",
                [orgA.id, branchA, tableId, tokenHash],
              )
            ).rows[0],
        );
        assert.equal(token.table_id, tableId);
        await assert.rejects(
          withTenantTransaction(app, "administrator_a", orgA.id, (c) =>
            c.query("SELECT token_hash FROM table_qr_tokens WHERE id=$1", [
              token.id,
            ]),
          ),
          { code: "42501" },
        );
        await withTenantTransaction(app, "owner_b", orgB.id, async (c) => {
          assert.equal(
            (await c.query("SELECT id FROM table_qr_tokens")).rows.length,
            0,
          );
          assert.equal(
            (await c.query("SELECT * FROM restaurant_tables")).rows.length,
            0,
          );
        });
        await assert.rejects(
          withTenantTransaction(app, "administrator_a", orgA.id, (c) =>
            c.query(
              "INSERT INTO table_qr_tokens(organization_id,branch_id,table_id,token_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '1 day')",
              [orgA.id, branchA2, tableId, Buffer.alloc(32, 4)],
            ),
          ),
          { code: "42501" },
        );
        let renewedId;
        await withTenantTransaction(
          app,
          "administrator_a",
          orgA.id,
          async (c) => {
            await c.query(
              "SELECT id FROM restaurant_tables WHERE organization_id=$1 AND branch_id=$2 AND id=$3 AND active FOR UPDATE",
              [orgA.id, branchA, tableId],
            );
            await c.query(
              "UPDATE table_qr_tokens SET revoked_at=now() WHERE organization_id=$1 AND branch_id=$2 AND table_id=$3 AND revoked_at IS NULL AND expires_at>now()",
              [orgA.id, branchA, tableId],
            );
            const renewed = await c.query(
              "INSERT INTO table_qr_tokens(organization_id,branch_id,table_id,token_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '1 day') RETURNING id",
              [orgA.id, branchA, tableId, Buffer.alloc(32, 5)],
            );
            renewedId = renewed.rows[0].id;
            const versions = await c.query(
              "SELECT id,revoked_at FROM table_qr_tokens WHERE table_id=$1 ORDER BY created_at,id",
              [tableId],
            );
            assert.equal(versions.rows.length, 2);
            assert.ok(versions.rows[0].revoked_at);
            assert.equal(versions.rows[1].revoked_at, null);
          },
        );
        await withTenantTransaction(
          app,
          "administrator_a",
          orgA.id,
          async (c) => {
            assert.equal(
              (
                await c.query(
                  "UPDATE table_qr_tokens SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL",
                  [renewedId],
                )
              ).rowCount,
              1,
            );
            assert.equal(
              (
                await c.query(
                  "UPDATE table_qr_tokens SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL",
                  [renewedId],
                )
              ).rowCount,
              0,
            );
            assert.notEqual(renewedId, token.id);
          },
        );
        await assert.rejects(
          withTenantTransaction(app, "cashier_a", orgA.id, (c) =>
            c.query(
              "INSERT INTO restaurant_tables(organization_id,branch_id,table_code,display_name,seats) VALUES($1,$2,'T2','Table 2',2)",
              [orgA.id, branchA],
            ),
          ),
          { code: "42501" },
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
      "P4.2/P4.3 orders, tickets and waiter additions are transactional and isolated",
      async (scenario) => {
        const seed = await withTenantTransaction(
          app,
          "owner_a",
          orgA.id,
          async (c) => {
            const category = (
              await c.query(
                "INSERT INTO product_categories(organization_id,name) VALUES($1,'Order test') RETURNING id",
                [orgA.id],
              )
            ).rows[0].id;
            const product = (
              await c.query(
                "INSERT INTO products(organization_id,category_id,name) VALUES($1,$2,'Order soup') RETURNING id",
                [orgA.id, category],
              )
            ).rows[0].id;
            const price = (
              await c.query(
                "INSERT INTO product_price_versions(organization_id,branch_id,product_id,price_minor,currency_code,created_by) VALUES($1,$2,$3,12500,'UZS','owner_a') RETURNING id",
                [orgA.id, branchA, product],
              )
            ).rows[0].id;
            const table = (
              await c.query(
                "INSERT INTO restaurant_tables(organization_id,branch_id,table_code,display_name,seats) VALUES($1,$2,'POS1','POS test',2) RETURNING id",
                [orgA.id, branchA],
              )
            ).rows[0].id;
            const tableRow = await c.query(
              "SELECT id,active,status,branch_id FROM restaurant_tables WHERE id=$1",
              [table],
            );
            const foreignTable = (
              await c.query(
                "INSERT INTO restaurant_tables(organization_id,branch_id,table_code,display_name,seats) VALUES($1,$2,'POS2','Other branch table',2) RETURNING id",
                [orgA.id, branchA2],
              )
            ).rows[0].id;
            return {
              product,
              price,
              table,
              foreignTable,
              tableRow: tableRow.rows[0],
            };
          },
        );
        assert.deepEqual(seed.tableRow, {
          id: seed.table,
          active: true,
          status: "available",
          branch_id: branchA,
        });
        const cashierTable = await withTenantTransaction(
          app,
          "cashier_a",
          orgA.id,
          async (c) => ({
            access: (
              await c.query("SELECT private.branch_access($1,$2) allowed", [
                orgA.id,
                branchA,
              ])
            ).rows[0].allowed,
            rows: (
              await c.query(
                "SELECT id,active,status FROM restaurant_tables WHERE organization_id=$1 AND branch_id=$2 AND id=$3",
                [orgA.id, branchA, seed.table],
              )
            ).rows,
          }),
        );
        assert.equal(cashierTable.access, true);
        assert.equal(cashierTable.rows.length, 1);
        const tableLock = await withTenantTransaction(
          app,
          "cashier_a",
          orgA.id,
          async (c) =>
            (
              await c.query(
                "SELECT private.lock_cashier_table($1,$2,$3) available",
                [orgA.id, branchA, seed.table],
              )
            ).rows[0].available,
        );
        assert.equal(tableLock, true);
        let actor = "cashier_a";
        const orderPool = new pg.Pool({
          connectionString: urlFor(
            "unibos_app",
            process.env.APP_DATABASE_PASSWORD,
          ),
          max: 5,
        });
        watch(orderPool);
        const server = createServer((req, res) => {
          void handleSecurityRoute(req, res, {
            security: {
              getIdentity: async () => ({
                userId: req.headers["x-test-user"]?.toString() ?? actor,
                sessionId: "test",
                mfaVerified: true,
              }),
              nodeHandler: async (_req, response) => response.end(),
              close: async () => {},
            },
            pool: orderPool,
            trustedOrigins: [testOrigin],
          }).catch((error) => sendSafeApiError(res, error));
        });
        server.listen(0, "127.0.0.1");
        await once(server, "listening");
        const testOrigin = `http://127.0.0.1:${server.address().port}`;
        const path = `/api/v1/organizations/${orgA.id}/branches/${branchA}/orders`;
        const call = (route, method = "GET", body) =>
          fetch(`${testOrigin}${route}`, {
            method,
            headers: {
              Origin: testOrigin,
              ...(body ? { "Content-Type": "application/json" } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
          });
        const callAs = (userId, route, method = "GET", body) =>
          fetch(`${testOrigin}${route}`, {
            method,
            headers: {
              Origin: testOrigin,
              "x-test-user": userId,
              ...(body ? { "Content-Type": "application/json" } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
          });
        const cashierCapabilities = await call(
          "/api/v1/me/workspace-capabilities?role=owner",
        );
        assert.equal(cashierCapabilities.status, 200);
        assert.equal(
          cashierCapabilities.headers.get("cache-control"),
          "no-store, private",
        );
        const cashierScope = await cashierCapabilities.json();
        assert.equal(cashierScope.organizations.length, 1);
        assert.deepEqual(
          cashierScope.organizations[0].branches.map((item) => item.id),
          [branchA],
        );
        assert.ok(
          cashierScope.organizations[0].branches[0].capabilities.includes(
            "orders.create",
          ),
        );
        assert.ok(
          !cashierScope.organizations[0].branches[0].capabilities.includes(
            "kitchen.operate",
          ),
        );
        actor = "kitchen_a";
        const kitchenCapabilities = await call(
          "/api/v1/me/workspace-capabilities",
        );
        assert.equal(kitchenCapabilities.status, 200);
        const kitchenScope = await kitchenCapabilities.json();
        assert.deepEqual(
          kitchenScope.organizations[0].branches[0].navigation.map(
            (item) => item.id,
          ),
          ["workspace", "kitchen"],
        );
        assert.ok(
          !kitchenScope.organizations[0].branches[0].capabilities.includes(
            "orders.create",
          ),
        );
        actor = "administrator_a";
        const administratorCapabilities = await call(
          "/api/v1/me/workspace-capabilities",
        );
        const administratorScope = await administratorCapabilities.json();
        assert.ok(
          administratorScope.organizations[0].branches[0].capabilities.includes(
            "catalog.branch.manage",
          ),
        );
        assert.ok(
          !administratorScope.organizations[0].branches[0].capabilities.includes(
            "catalog.manage",
          ),
        );
        actor = "staff_a";
        const waiterCapabilities = await call(
          "/api/v1/me/workspace-capabilities",
        );
        const waiterScope = await waiterCapabilities.json();
        assert.deepEqual(
          waiterScope.organizations[0].branches[0].navigation.map(
            (item) => item.id,
          ),
          ["workspace", "waiter"],
        );
        actor = "accountant_a";
        const accountantCapabilities = await call(
          "/api/v1/me/workspace-capabilities",
        );
        const accountantScope = await accountantCapabilities.json();
        assert.deepEqual(
          accountantScope.organizations[0].branches[0].navigation.map(
            (item) => item.id,
          ),
          ["workspace", "shifts", "payments"],
        );
        assert.deepEqual(
          accountantScope.organizations[0].branches[0].capabilities,
          ["orders.read", "shifts.read", "transactions.read", "workspace.view"],
        );
        await grant("owner_a", "multi_scope_a", "director", null);
        await withTenantTransaction(app, "owner_b", orgB.id, (client) =>
          client.query(
            "INSERT INTO memberships(organization_id,user_id,role,branch_id) VALUES($1,'multi_scope_a','cashier',$2)",
            [orgB.id, branchB],
          ),
        );
        actor = "multi_scope_a";
        const ownerCapabilities = await call(
          "/api/v1/me/workspace-capabilities",
        );
        const ownerScope = await ownerCapabilities.json();
        assert.equal(ownerScope.organizations.length, 2);
        const ownerOrganization = ownerScope.organizations.find(
          (organization) => organization.id === orgA.id,
        );
        const cashierOrganization = ownerScope.organizations.find(
          (organization) => organization.id === orgB.id,
        );
        assert.equal(ownerOrganization.branches.length, 2);
        assert.deepEqual(ownerOrganization.roles, ["director"]);
        assert.ok(
          ownerOrganization.branches[0].effectiveRoles.includes("director"),
        );
        assert.deepEqual(cashierOrganization.roles, []);
        assert.deepEqual(
          cashierOrganization.branches.map((item) => item.roles),
          [["cashier"]],
        );
        assert.ok(
          cashierOrganization.branches[0].capabilities.includes(
            "orders.create",
          ),
        );
        assert.ok(
          !cashierOrganization.branches[0].capabilities.includes(
            "kitchen.operate",
          ),
        );
        actor = "cashier_a";
        const shiftPath = `/api/v1/organizations/${orgA.id}/branches/${branchA}/cash-shifts`;
        const openShiftKey = randomUUID();
        const openShiftPayload = {
          idempotencyKey: openShiftKey,
          currencyCode: "UZS",
          openingAmountMinor: "10000",
        };
        assert.equal(
          (
            await call(shiftPath, "POST", {
              ...openShiftPayload,
              idempotencyKey: randomUUID(),
              currencyCode: "XYZ",
            })
          ).status,
          400,
        );
        const openedResponse = await call(shiftPath, "POST", openShiftPayload);
        assert.equal(openedResponse.status, 201);
        const opened = await openedResponse.json();
        assert.equal(opened.shift.status, "OPEN");
        const shiftId = opened.shift.id;
        await assert.rejects(
          withTenantTransaction(app, "cashier_a", orgA.id, (client) =>
            client.query(
              "INSERT INTO public.cash_drawer_movements(organization_id,branch_id,shift_id,movement_type,amount_minor,reason) VALUES($1,$2,$3,'CASH_OUT',10001,'Direct SQL overdraw attempt')",
              [orgA.id, branchA, shiftId],
            ),
          ),
          { code: "23514" },
        );
        assert.equal(
          (
            await call(shiftPath + `/${shiftId}/movements`, "POST", {
              idempotencyKey: randomUUID(),
              expectedVersion: 1,
              movementType: "CASH_OUT",
              amountMinor: "10001",
              reason: "Must not overdraw drawer",
            })
          ).status,
          409,
        );
        const duplicateOpen = await call(shiftPath, "POST", openShiftPayload);
        assert.equal(duplicateOpen.status, 200);
        assert.equal((await duplicateOpen.json()).shift.id, shiftId);
        assert.equal(
          (
            await call(shiftPath, "POST", {
              ...openShiftPayload,
              openingAmountMinor: "9000",
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await call(shiftPath, "POST", {
              idempotencyKey: randomUUID(),
              currencyCode: "UZS",
              openingAmountMinor: "0",
            })
          ).status,
          409,
        );
        const drawerInKey = randomUUID();
        const drawerIn = {
          idempotencyKey: drawerInKey,
          expectedVersion: 1,
          movementType: "CASH_IN",
          amountMinor: "5000",
          reason: "Float top-up",
        };
        const duplicateMovement = await Promise.all([
          call(shiftPath + `/${shiftId}/movements`, "POST", drawerIn),
          call(shiftPath + `/${shiftId}/movements`, "POST", drawerIn),
        ]);
        assert.deepEqual(
          duplicateMovement.map((response) => response.status).sort(),
          [200, 201],
          await Promise.all(
            duplicateMovement.map(async (response) => [
              response.status,
              await response.clone().text(),
            ]),
          ),
        );
        const movementResult = await duplicateMovement[0].json();
        const movementRetry = await duplicateMovement[1].json();
        assert.equal(movementResult.movement.id, movementRetry.movement.id);
        assert.equal(
          (
            await call(shiftPath + `/${shiftId}/movements`, "POST", {
              ...drawerIn,
              amountMinor: "6000",
            })
          ).status,
          409,
        );
        const drawerOutResponse = await call(
          shiftPath + `/${shiftId}/movements`,
          "POST",
          {
            idempotencyKey: randomUUID(),
            expectedVersion: 2,
            movementType: "CASH_OUT",
            amountMinor: "1000",
            reason: "Petty cash",
          },
        );
        assert.equal(drawerOutResponse.status, 201);
        const beginCloseResponse = await call(
          shiftPath + `/${shiftId}/begin-close`,
          "POST",
          {
            idempotencyKey: randomUUID(),
            expectedVersion: 3,
            countedCashMinor: "14000",
          },
        );
        assert.equal(beginCloseResponse.status, 201);
        const closingShift = await beginCloseResponse.json();
        assert.equal(closingShift.shift.status, "CLOSING");
        assert.equal(closingShift.shift.closing_expected_minor, "14000");
        assert.equal(
          (
            await call(shiftPath + `/${shiftId}/movements`, "POST", {
              idempotencyKey: randomUUID(),
              expectedVersion: 4,
              movementType: "CASH_IN",
              amountMinor: "500",
              reason: "Must fail after close begins",
            })
          ).status,
          409,
        );
        const closeKey = randomUUID();
        const closePayload = { idempotencyKey: closeKey, expectedVersion: 4 };
        const closedResponse = await call(
          shiftPath + `/${shiftId}/confirm-close`,
          "POST",
          closePayload,
        );
        assert.equal(closedResponse.status, 201);
        const closedShift = await closedResponse.json();
        assert.equal(closedShift.shift.status, "CLOSED");
        assert.equal(closedShift.shift.variance_minor, "0");
        const closeRetry = await call(
          shiftPath + `/${shiftId}/confirm-close`,
          "POST",
          closePayload,
        );
        assert.equal(closeRetry.status, 200);
        assert.equal((await closeRetry.json()).shift.id, shiftId);
        const shiftSnapshot = await call(shiftPath);
        const shiftData = await shiftSnapshot.json();
        assert.equal(shiftData.activeShift, null);
        assert.equal(shiftData.history[0].id, shiftId);
        assert.equal(shiftData.history[0].expected_current_minor, "14000");
        await assert.rejects(
          withTenantTransaction(app, "owner_a", orgA.id, (client) =>
            client.query(
              "UPDATE public.cash_shifts SET status='OPEN',version=version+1 WHERE organization_id=$1 AND branch_id=$2 AND id=$3",
              [orgA.id, branchA, shiftId],
            ),
          ),
          { code: "23514" },
        );
        actor = "cashier_b";
        const otherCashierSnapshot = await call(shiftPath);
        assert.equal(otherCashierSnapshot.status, 200);
        assert.deepEqual((await otherCashierSnapshot.json()).history, []);
        assert.equal(
          (
            await call(shiftPath + `/${shiftId}/begin-close`, "POST", {
              idempotencyKey: randomUUID(),
              expectedVersion: 4,
              countedCashMinor: "0",
            })
          ).status,
          409,
        );
        actor = "accountant_a";
        assert.equal((await call(shiftPath)).status, 200);
        assert.equal(
          (
            await call(shiftPath, "POST", {
              idempotencyKey: randomUUID(),
              currencyCode: "UZS",
              openingAmountMinor: "0",
            })
          ).status,
          403,
        );
        actor = "kitchen_a";
        assert.equal((await call(shiftPath)).status, 403);
        actor = "cashier_a";
        assert.equal(
          (
            await call(
              `/api/v1/organizations/${orgA.id}/branches/${branchA2}/cash-shifts`,
            )
          ).status,
          403,
        );
        const payload = {
          idempotencyKey: randomUUID(),
          fulfillmentType: "DINE_IN",
          tableId: seed.table,
          items: [
            {
              productId: seed.product,
              quantity: "1.500",
              priceVersion: seed.price,
              notes: "No herbs",
            },
          ],
          note: "Spoken order",
        };
        try {
          const [a, b] = await Promise.all([
            call(path, "POST", payload),
            call(path, "POST", payload),
          ]);
          assert.deepEqual(
            [a.status, b.status].sort(),
            [200, 201],
            JSON.stringify(
              await Promise.all([a.clone().json(), b.clone().json()]),
            ),
          );
          const result = await a.json();
          const duplicate = await b.json();
          assert.equal(result.order.id, duplicate.order.id);
          assert.match(result.ticketId, /^[0-9a-f-]{36}$/i);
          assert.equal(result.order.total_minor, "18750");
          assert.equal(result.items[0].quantity, "1.500");
          assert.equal(result.items[0].product_name_snapshot, "Order soup");
          assert.equal(result.order.table_id, seed.table);
          assert.equal(
            (await call(path, "POST", { ...payload, note: "different body" }))
              .status,
            409,
          );
          await withTenantTransaction(app, "owner_a", orgA.id, async (c) => {
            await c.query(
              "UPDATE products SET name='Renamed soup' WHERE organization_id=$1 AND id=$2",
              [orgA.id, seed.product],
            );
            await c.query(
              "INSERT INTO product_price_versions(organization_id,branch_id,product_id,price_minor,currency_code,created_by) VALUES($1,$2,$3,14000,'UZS','owner_a')",
              [orgA.id, branchA, seed.product],
            );
          });
          const stale = await call(path, "POST", {
            ...payload,
            idempotencyKey: randomUUID(),
          });
          assert.equal(stale.status, 409);
          assert.equal((await stale.json()).reason, "STALE_PRICE");
          const crossBranchTable = await call(path, "POST", {
            ...payload,
            idempotencyKey: randomUUID(),
            tableId: seed.foreignTable,
          });
          assert.equal(crossBranchTable.status, 409);
          assert.equal(
            (await crossBranchTable.json()).reason,
            "TABLE_UNAVAILABLE",
          );
          const lookedUp = await (
            await call(`${path}/${result.order.id}`)
          ).json();
          assert.equal(lookedUp.items[0].product_name_snapshot, "Order soup");
          assert.equal(lookedUp.items[0].unit_price_minor, "12500");
          const kitchenRows = await withTenantTransaction(
            app,
            "kitchen_a",
            orgA.id,
            async (c) => ({
              orders: (await c.query("SELECT id FROM orders")).rows,
              prices: (
                await c.query("SELECT id,unit_price_minor FROM order_items")
              ).rows,
            }),
          );
          assert.deepEqual(kitchenRows, { orders: [], prices: [] });
          const currentPrice = await withTenantTransaction(
            app,
            "cashier_a",
            orgA.id,
            async (c) =>
              (
                await c.query(
                  "SELECT id FROM product_price_versions WHERE organization_id=$1 AND branch_id=$2 AND product_id=$3 ORDER BY effective_at DESC,id DESC LIMIT 1",
                  [orgA.id, branchA, seed.product],
                )
              ).rows[0].id,
          );
          const kitchenPath = `/api/v1/organizations/${orgA.id}/branches/${branchA}/kitchen/tickets`;
          actor = "kitchen_a";
          const kitchenQueue = await (await call(kitchenPath)).json();
          assert.equal(kitchenQueue.tickets.length, 1);
          assert.equal(kitchenQueue.tickets[0].id, result.ticketId);
          assert.deepEqual(kitchenQueue.tickets[0].items[0], {
            product_name_snapshot: "Order soup",
            quantity: "1.500",
            notes: "No herbs",
          });
          assert.equal("total_minor" in kitchenQueue.tickets[0], false);
          const transition = (
            id,
            expectedVersion,
            action,
            actorId,
            url = kitchenPath,
          ) => {
            actor = actorId;
            return call(`${url}/${id}`, "PATCH", {
              idempotencyKey: randomUUID(),
              expectedVersion,
              transition: action,
              ...(action === "CANCEL" ? { reason: "Test cancellation" } : {}),
            });
          };
          const waiterPath = `/api/v1/organizations/${orgA.id}/branches/${branchA}/waiter`;
          const kitchenTicketPath = `${kitchenPath}/${result.ticketId}`;
          actor = "kitchen_a";
          const accept = {
            idempotencyKey: randomUUID(),
            expectedVersion: 1,
            transition: "ACCEPT",
          };
          assert.equal(
            (await call(kitchenTicketPath, "PATCH", accept)).status,
            200,
          );
          assert.equal(
            (await call(kitchenTicketPath, "PATCH", accept)).status,
            200,
          );
          const cancelWithoutReason = await call(kitchenTicketPath, "PATCH", {
            idempotencyKey: randomUUID(),
            expectedVersion: 2,
            transition: "CANCEL",
          });
          assert.equal(cancelWithoutReason.status, 400);
          actor = "staff_a";
          assert.equal(
            (
              await call(`${waiterPath}/${result.ticketId}`, "PATCH", {
                idempotencyKey: randomUUID(),
                expectedVersion: 2,
                transition: "SERVE",
              })
            ).status,
            409,
          );
          actor = "staff_a";
          const addPayload = {
            idempotencyKey: randomUUID(),
            items: [
              {
                productId: seed.product,
                quantity: "1",
                priceVersion: currentPrice,
                notes: "Extra herbs",
              },
            ],
          };
          const addedResponse = await call(
            `${waiterPath}/${result.order.id}`,
            "POST",
            addPayload,
          );
          assert.equal(addedResponse.status, 201);
          const added = await addedResponse.json();
          assert.match(added.ticketId, /^[0-9a-f-]{36}$/i);
          const staleWaiterPrice = await call(
            `${waiterPath}/${result.order.id}`,
            "POST",
            {
              idempotencyKey: randomUUID(),
              items: [
                {
                  productId: seed.product,
                  quantity: "1",
                  priceVersion: seed.price,
                },
              ],
            },
          );
          assert.equal(staleWaiterPrice.status, 409);
          const repeated = await call(
            `${waiterPath}/${result.order.id}`,
            "POST",
            addPayload,
          );
          assert.equal(repeated.status, 200);
          assert.equal((await repeated.json()).ticketId, added.ticketId);
          const conflicting = await call(
            `${waiterPath}/${result.order.id}`,
            "POST",
            {
              ...addPayload,
              items: [{ ...addPayload.items[0], quantity: "2" }],
            },
          );
          assert.equal(conflicting.status, 409);
          const concurrentPayloads = [0, 1].map(() => ({
            idempotencyKey: randomUUID(),
            items: [
              {
                productId: seed.product,
                quantity: "1",
                priceVersion: currentPrice,
              },
            ],
          }));
          const concurrentAdds = await Promise.all(
            concurrentPayloads.map((body) =>
              call(`${waiterPath}/${result.order.id}`, "POST", body),
            ),
          );
          assert.deepEqual(
            concurrentAdds.map((response) => response.status),
            [201, 201],
          );
          actor = "kitchen_a";
          const queueAfterAdd = await (await call(kitchenPath)).json();
          assert.equal(queueAfterAdd.tickets.length, 4);
          assert.equal(
            queueAfterAdd.tickets.find(
              (ticket) => ticket.id === result.ticketId,
            ).items.length,
            1,
          );
          assert.equal(
            queueAfterAdd.tickets.find((ticket) => ticket.id === added.ticketId)
              .items.length,
            1,
          );
          assert.equal(
            (await call(`${waiterPath}/${result.order.id}`, "POST", addPayload))
              .status,
            403,
          );
          await assert.rejects(
            withTenantTransaction(app, "staff_a", orgA.id, (c) =>
              c.query(
                "UPDATE kitchen_tickets SET status='PREPARING',version=version+1 WHERE id=$1",
                [result.ticketId],
              ),
            ),
            { code: "42501" },
          );
          const cancelAdd = {
            idempotencyKey: randomUUID(),
            expectedVersion: 1,
            transition: "CANCEL",
            reason: "Guest removed this item",
          };
          const cancelPath = `${kitchenPath}/${added.ticketId}`;
          assert.equal(
            (await call(cancelPath, "PATCH", cancelAdd)).status,
            200,
          );
          assert.equal(
            (await call(cancelPath, "PATCH", cancelAdd)).status,
            200,
          );
          const cancellation = await withTenantTransaction(
            app,
            "owner_a",
            orgA.id,
            (c) =>
              c.query(
                "SELECT reason,to_status FROM kitchen_ticket_events WHERE ticket_id=$1 AND version=2",
                [added.ticketId],
              ),
          );
          assert.deepEqual(cancellation.rows[0], {
            reason: "Guest removed this item",
            to_status: "CANCELLED",
          });
          assert.equal(
            (await transition(result.ticketId, 1, "START", "kitchen_a")).status,
            409,
          );
          assert.equal(
            (await transition(result.ticketId, 2, "START", "kitchen_a")).status,
            200,
          );
          assert.equal(
            (await transition(result.ticketId, 3, "READY", "kitchen_a")).status,
            200,
          );
          await assert.rejects(
            withTenantTransaction(app, "kitchen_a", orgA.id, (c) =>
              c.query(
                "UPDATE kitchen_tickets SET status='SERVED',version=version+1 WHERE id=$1",
                [result.ticketId],
              ),
            ),
            { code: "42501" },
          );
          actor = "staff_a";
          const served = await call(
            `${waiterPath}/${result.ticketId}`,
            "PATCH",
            {
              idempotencyKey: randomUUID(),
              expectedVersion: 4,
              transition: "SERVE",
            },
          );
          assert.equal(served.status, 200);
          const servedUnpaidOrder = await withTenantTransaction(
            app,
            "owner_a",
            orgA.id,
            (c) =>
              c.query("SELECT status,payment_status FROM orders WHERE id=$1", [
                result.order.id,
              ]),
          );
          assert.equal(servedUnpaidOrder.rows[0].status, "SUBMITTED");
          assert.equal(servedUnpaidOrder.rows[0].payment_status, "UNPAID");
          const servedTicket = await withTenantTransaction(
            app,
            "owner_a",
            orgA.id,
            (c) =>
              c.query("SELECT status FROM kitchen_tickets WHERE id=$1", [
                result.ticketId,
              ]),
          );
          assert.equal(servedTicket.rows[0].status, "SERVED");
          const history = await withTenantTransaction(
            app,
            "owner_a",
            orgA.id,
            (c) =>
              c.query(
                "SELECT event_type,to_status,version FROM kitchen_ticket_events WHERE organization_id=$1 AND branch_id=$2 AND ticket_id=$3 ORDER BY version",
                [orgA.id, branchA, result.ticketId],
              ),
          );
          assert.deepEqual(history.rows, [
            { event_type: "TICKET_CREATED", to_status: "QUEUED", version: 1 },
            { event_type: "STATUS_CHANGED", to_status: "ACCEPTED", version: 2 },
            {
              event_type: "STATUS_CHANGED",
              to_status: "PREPARING",
              version: 3,
            },
            { event_type: "STATUS_CHANGED", to_status: "READY", version: 4 },
            { event_type: "STATUS_CHANGED", to_status: "SERVED", version: 5 },
          ]);
          await assert.rejects(
            withTenantTransaction(app, "owner_a", orgA.id, (c) =>
              c.query(
                "UPDATE kitchen_ticket_events SET reason='forged' WHERE ticket_id=$1",
                [result.ticketId],
              ),
            ),
            { code: "42501" },
          );
          actor = "kitchen_a";
          assert.equal(
            (
              await call(
                `/api/v1/organizations/${orgA.id}/branches/${branchA2}/kitchen/tickets`,
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await call(
                `/api/v1/organizations/${orgB.id}/branches/${branchB}/kitchen/tickets`,
              )
            ).status,
            403,
          );
          actor = "staff_a";
          const waiterActive = await (await call(waiterPath)).json();
          assert.equal(waiterActive.mode, "INTEGRATED");
          assert.equal(waiterActive.orders.length >= 1, true);
          assert.equal("total_minor" in waiterActive.orders[0], false);
          const billKey = randomUUID();
          const billPath = `${waiterPath}/${result.order.id}/bill`;
          assert.equal(
            (await call(billPath, "POST", { idempotencyKey: billKey })).status,
            202,
          );
          assert.equal(
            (await call(billPath, "POST", { idempotencyKey: billKey })).status,
            200,
          );
          actor = "cashier_a";
          const pickup = await call(path, "POST", {
            idempotencyKey: randomUUID(),
            fulfillmentType: "PICKUP",
            items: [
              {
                productId: seed.product,
                quantity: "2",
                priceVersion: currentPrice,
              },
            ],
          });
          assert.equal(pickup.status, 201);
          const pickupResult = await pickup.json();
          assert.equal(pickupResult.order.fulfillment_type, "PICKUP");
          assert.equal(pickupResult.order.table_id, null);
          const paymentShift = await call(shiftPath, "POST", {
            idempotencyKey: randomUUID(),
            currencyCode: "UZS",
            openingAmountMinor: "5000",
          });
          assert.equal(paymentShift.status, 201);
          const cashierBShift = await callAs("cashier_b", shiftPath, "POST", {
            idempotencyKey: randomUUID(),
            currencyCode: "UZS",
            openingAmountMinor: "5000",
          });
          assert.equal(cashierBShift.status, 201);
          const cashPaymentPath = `/api/v1/organizations/${orgA.id}/branches/${branchA}/cash-payments/orders/${pickupResult.order.id}`;
          const concurrentBodies = [
            {
              idempotencyKey: randomUUID(),
              cashReceivedMinor: String(
                BigInt(pickupResult.order.total_minor) + 500n,
              ),
            },
            {
              idempotencyKey: randomUUID(),
              cashReceivedMinor: String(
                BigInt(pickupResult.order.total_minor) + 500n,
              ),
            },
          ];
          const concurrentPayments = await Promise.all([
            callAs("cashier_a", cashPaymentPath, "POST", concurrentBodies[0]),
            callAs("cashier_b", cashPaymentPath, "POST", concurrentBodies[1]),
          ]);
          assert.deepEqual(
            concurrentPayments.map((item) => item.status).sort(),
            [201, 409],
          );
          const winnerIndex = concurrentPayments.findIndex(
            (item) => item.status === 201,
          );
          const winnerUser = winnerIndex === 0 ? "cashier_a" : "cashier_b";
          const winningBody = concurrentBodies[winnerIndex];
          const recordedPayment = concurrentPayments[winnerIndex];
          const recordedPaymentResult = await recordedPayment.json();
          assert.equal(
            recordedPaymentResult.payment.amount_minor,
            pickupResult.order.total_minor,
          );
          assert.equal(recordedPaymentResult.payment.change_minor, "500");
          assert.equal(
            (await callAs(winnerUser, cashPaymentPath, "POST", winningBody))
              .status,
            200,
          );
          assert.equal(
            (
              await callAs(winnerUser, cashPaymentPath, "POST", {
                ...winningBody,
                cashReceivedMinor: "999999",
              })
            ).status,
            409,
          );
          const paymentLedger = await withTenantTransaction(
            app,
            "owner_a",
            orgA.id,
            (c) =>
              c.query(
                "SELECT account_code,direction,amount_minor::text FROM cash_payment_ledger_entries WHERE payment_id=$1 ORDER BY account_code",
                [recordedPaymentResult.payment.id],
              ),
          );
          assert.equal(paymentLedger.rows.length, 2);
          assert.equal(
            paymentLedger.rows[0].amount_minor,
            paymentLedger.rows[1].amount_minor,
          );
          const paymentsPath = `/api/v1/organizations/${orgA.id}/branches/${branchA}/cash-payments`;
          const paidAtDate = new Date(recordedPaymentResult.payment.created_at)
            .toISOString()
            .slice(0, 10);
          // Rename the catalog after payment; analytics must retain the submitted snapshot.
          await withTenantTransaction(app, "owner_a", orgA.id, (client) =>
            client.query(
              "UPDATE products SET name='Current soup name' WHERE organization_id=$1 AND id=$2",
              [orgA.id, seed.product],
            ),
          );
          await scenario.test(
            "owner analytics reports canonical settlement, shift, KDS and date-scoped amounts",
            () =>
              checkOwnerAnalytics({
                callAs,
                fixture,
                orgA: orgA.id,
                orgB: orgB.id,
                branchA,
                branchA2,
                branchB,
                winnerUser,
                productId: seed.product,
                from: new Date(opened.shift.opened_at)
                  .toISOString()
                  .slice(0, 10),
                to: paidAtDate,
              }),
          );
          const filteredHistoryResponse = await callAs(
            "accountant_a",
            `${paymentsPath}?from=${paidAtDate}&to=${paidAtDate}&cashierId=${winnerUser}&shiftId=${recordedPaymentResult.payment.shift_id}&orderId=${pickupResult.order.id}&paymentStatus=RECORDED&page=1&pageSize=1`,
          );
          assert.equal(filteredHistoryResponse.status, 200);
          const filteredHistory = await filteredHistoryResponse.json();
          assert.equal(filteredHistory.pagination.total, 1);
          assert.equal(filteredHistory.payments.length, 1);
          assert.equal(filteredHistory.payments[0].payment_method, "CASH");
          assert.equal(filteredHistory.payments[0].payment_status, "RECORDED");
          assert.equal(filteredHistory.payments[0].items.length, 1);
          assert.equal(filteredHistory.payments[0].audit_history.length, 1);
          assert.equal(filteredHistory.payments[0].ledger_entries.length, 2);
          assert.equal(
            filteredHistory.reconciliation.duplicate_payment_orders,
            0,
          );
          assert.equal(filteredHistory.reconciliation.incomplete_payments, 0);
          const uzsReconciliation =
            filteredHistory.reconciliation.by_currency.find(
              (item) => item.currencyCode === "UZS",
            );
          assert.equal(
            uzsReconciliation.paymentTotalMinor,
            pickupResult.order.total_minor,
          );
          assert.equal(
            uzsReconciliation.ledgerCashDebitMinor,
            pickupResult.order.total_minor,
          );
          assert.equal(
            uzsReconciliation.ledgerReceivableCreditMinor,
            pickupResult.order.total_minor,
          );
          assert.equal(
            filteredHistory.reconciliation.shifts.some(
              (item) => item.ledger_matches,
            ),
            true,
          );
          assert.equal((await callAs("kitchen_a", paymentsPath)).status, 403);
          assert.equal(
            (
              await callAs(
                "cashier_a",
                `/api/v1/organizations/${orgA.id}/branches/${branchA2}/cash-payments`,
              )
            ).status,
            403,
          );
          assert.equal((await callAs("owner_b", paymentsPath)).status, 403);
          assert.equal(
            (await callAs("accountant_a", `${paymentsPath}?pageSize=101`))
              .status,
            400,
          );
          assert.equal(
            (await callAs("accountant_a", `${paymentsPath}?from=2026-99-99`))
              .status,
            400,
          );
          assert.equal(
            (
              await callAs("accountant_a", cashPaymentPath, "POST", {
                idempotencyKey: randomUUID(),
                cashReceivedMinor: "1",
              })
            ).status,
            403,
          );
          const paidOrder = await withTenantTransaction(
            app,
            "owner_a",
            orgA.id,
            (c) =>
              c.query("SELECT payment_status,paid_at FROM orders WHERE id=$1", [
                pickupResult.order.id,
              ]),
          );
          assert.equal(paidOrder.rows[0].payment_status, "PAID");
          assert.ok(paidOrder.rows[0].paid_at);
          const otherCashier =
            winnerUser === "cashier_a" ? "cashier_b" : "cashier_a";
          const otherShiftResponse =
            otherCashier === "cashier_a" ? paymentShift : cashierBShift;
          const otherShift = (await otherShiftResponse.clone().json()).shift;
          assert.equal(otherShift.status, "OPEN");
          const closing = await callAs(
            otherCashier,
            `${shiftPath}/${otherShift.id}/begin-close`,
            "POST",
            {
              idempotencyKey: randomUUID(),
              expectedVersion: otherShift.version,
              countedCashMinor: "5000",
            },
          );
          assert.equal(closing.status, 201);
          const closingShift = (await closing.json()).shift;
          assert.equal(closingShift.status, "CLOSING");
          assert.equal(
            (
              await callAs(
                otherCashier,
                `${shiftPath}/${otherShift.id}/confirm-close`,
                "POST",
                {
                  idempotencyKey: randomUUID(),
                  expectedVersion: closingShift.version,
                },
              )
            ).status,
            201,
          );
          const postCloseOrderResponse = await callAs(
            otherCashier,
            path,
            "POST",
            {
              idempotencyKey: randomUUID(),
              fulfillmentType: "PICKUP",
              items: [
                {
                  productId: seed.product,
                  quantity: "1",
                  priceVersion: currentPrice,
                },
              ],
            },
          );
          assert.equal(postCloseOrderResponse.status, 201);
          const postCloseOrder = (await postCloseOrderResponse.json()).order;
          assert.equal(
            (
              await callAs(
                otherCashier,
                `${paymentsPath}/orders/${postCloseOrder.id}`,
                "POST",
                {
                  idempotencyKey: randomUUID(),
                  cashReceivedMinor: String(postCloseOrder.total_minor),
                },
              )
            ).status,
            409,
          );
          actor = "staff_a";
          assert.equal(
            (
              await call(`${waiterPath}/${pickupResult.order.id}`, "POST", {
                idempotencyKey: randomUUID(),
                items: [
                  {
                    productId: seed.product,
                    quantity: "1",
                    priceVersion: currentPrice,
                  },
                ],
              })
            ).status,
            409,
          );
          actor = "cashier_a";
          await withTenantTransaction(app, "owner_a", orgA.id, (c) =>
            c.query(
              "INSERT INTO branch_product_availability(organization_id,branch_id,product_id,available) VALUES($1,$2,$3,false) ON CONFLICT(organization_id,branch_id,product_id) DO UPDATE SET available=false",
              [orgA.id, branchA, seed.product],
            ),
          );
          const unavailable = await call(path, "POST", {
            idempotencyKey: randomUUID(),
            fulfillmentType: "PICKUP",
            items: [
              {
                productId: seed.product,
                quantity: "1",
                priceVersion: currentPrice,
              },
            ],
          });
          assert.equal(unavailable.status, 409);
          assert.equal(
            (await unavailable.json()).reason,
            "PRODUCT_UNAVAILABLE",
          );
          assert.equal(
            (
              await call(
                `/api/v1/organizations/${orgA.id}/branches/${branchA2}/orders/${result.order.id}`,
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await call(
                `/api/v1/organizations/${orgB.id}/branches/${branchB}/orders/${result.order.id}`,
              )
            ).status,
            403,
          );
          actor = "staff_a";
          assert.equal(
            (
              await call(path, "POST", {
                ...payload,
                idempotencyKey: randomUUID(),
              })
            ).status,
            403,
          );
          actor = "cashier_a";
          const policy = await fixture.query(
            "SELECT c.relrowsecurity,c.relforcerowsecurity FROM pg_class c WHERE c.oid='public.orders'::regclass",
          );
          assert.deepEqual(policy.rows[0], {
            relrowsecurity: true,
            relforcerowsecurity: true,
          });
          assert.equal(
            (
              await withTenantTransaction(app, "owner_a", orgA.id, (c) =>
                c.query("SELECT id FROM order_events WHERE order_id=$1", [
                  result.order.id,
                ]),
              )
            ).rows.length,
            10,
          );
          assert.equal(
            (
              await withTenantTransaction(app, "owner_a", orgA.id, (c) =>
                c.query(
                  "SELECT id FROM audit_events WHERE entity_id=$1 AND action='orders.insert'",
                  [result.order.id],
                ),
              )
            ).rows.length,
            1,
          );
        } finally {
          await new Promise((resolve) => server.close(resolve));
          await orderPool.end();
        }
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
