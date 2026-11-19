import assert from "node:assert/strict";
import test from "node:test";
import { restaurantJourney } from "./restaurant-journey.mjs";
import { randomUUID, randomBytes, createHmac } from "node:crypto";
import { createServer } from "node:net";
import { once } from "node:events";
import { createRequire } from "node:module";
import pg from "pg";
import { createSecurity } from "@unibos/security";
import { createApplication } from "../../apps/api/dist/application.js";
import {
  applyMigrations,
  requireLocalMigrationEnvironment,
} from "../../infrastructure/migrate.mjs";
const require = createRequire(import.meta.url);

// RFC6238 test driver only. Production verification remains in Better Auth.
function totp(uri) {
  const secret = new URL(uri).searchParams.get("secret");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of secret.replace(/=+$/, "").toUpperCase())
    bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  const key = Buffer.from(
    (bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac("sha1", key).update(counter).digest();
  const offset = hash.at(-1) & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1e6).padStart(
    6,
    "0",
  );
}
class Client {
  constructor(base, cookies = new Map()) {
    this.base = base;
    this.cookies = new Map(cookies);
  }
  clone() {
    return new Client(this.base, this.cookies);
  }
  async request(
    path,
    { method = "GET", body, origin = this.base, headers = {} } = {},
  ) {
    const response = await fetch(this.base + path, {
      method,
      headers: {
        ...(origin ? { Origin: origin } : {}),
        ...(this.cookies.size
          ? {
              Cookie: [...this.cookies]
                .map(([key, value]) => `${key}=${value}`)
                .join("; "),
            }
          : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const setCookies = response.headers.getSetCookie();
    for (const cookie of setCookies) {
      const first = cookie.split(";")[0];
      const split = first.indexOf("=");
      const name = first.slice(0, split),
        value = first.slice(split + 1);
      if (!value || /max-age=0/i.test(cookie)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    return { status: response.status, data, setCookies };
  }
}
async function reservePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test("real HTTP identity, MFA, tenant authorization and immediate revocation", async (t) => {
  requireLocalMigrationEnvironment(process.env);
  const name = `unibos_http_test_${randomUUID().replaceAll("-", "")}`;
  const bootstrap = new pg.Pool({
    connectionString: process.env.MIGRATION_DATABASE_URL,
    max: 1,
  });
  const idleErrors = [];
  let cleaning = false;
  const watch = (pool) =>
    pool.on("error", (error) => {
      if (!cleaning) idleErrors.push(error.code);
    });
  watch(bootstrap);
  let created = false,
    admin,
    app,
    security;
  let stage = "bootstrap";
  const connection = (user, password) => {
    const url = new URL(process.env.MIGRATION_DATABASE_URL);
    url.pathname = `/${name}`;
    if (user) {
      url.username = user;
      url.password = password;
    }
    return url.href;
  };
  try {
    await bootstrap.query(`CREATE DATABASE ${name}`);
    created = true;
    admin = new pg.Pool({ connectionString: connection(), max: 1 });
    watch(admin);
    await applyMigrations(admin, {
      appPassword: process.env.APP_DATABASE_PASSWORD,
      authPassword: process.env.AUTH_DATABASE_PASSWORD,
    });
    const apiPort = process.env.P4_4_5_API_PORT
      ? Number(process.env.P4_4_5_API_PORT)
      : await reservePort();
    assert.ok(Number.isInteger(apiPort) && apiPort > 0 && apiPort < 65536);
    const base = `http://127.0.0.1:${apiPort}`;
    const securityConfig = {
      secret: randomBytes(48).toString("hex"),
      baseURL: base,
      trustedOrigins: [base],
      authDatabaseUrl: connection(
        "unibos_auth",
        process.env.AUTH_DATABASE_PASSWORD,
      ),
      mode: "test",
      enableSignup: true,
    };
    stage = "security role and handler";
    security = await createSecurity(securityConfig);
    const pool = new pg.Pool({
      connectionString: connection(
        "unibos_app",
        process.env.APP_DATABASE_PASSWORD,
      ),
      max: 2,
    });
    watch(pool);
    const config = {
      mode: "test",
      host: "127.0.0.1",
      apiPort: Number(new URL(base).port),
      databaseUrl: connection("unibos_app", process.env.APP_DATABASE_PASSWORD),
      redisUrl: process.env.REDIS_URL,
    };
    stage = "restricted application role";
    app = await createApplication(config, undefined, undefined, {
      security,
      pool,
      trustedOrigins: [base],
    });
    await app.listen(config.apiPort, config.host);
    const a = new Client(base),
      b = new Client(base),
      staff = new Client(base),
      anonymous = new Client(base);
    const password = randomBytes(24).toString("hex");
    let oldA,
      oldB,
      orgA,
      orgB,
      branchA,
      branchA2,
      branchB,
      userA,
      userB,
      userStaff,
      membership,
      codesA;
    const enroll = async (client) => {
      const enabled = await client.request("/api/auth/two-factor/enable", {
        method: "POST",
        body: { password },
      });
      assert.equal(enabled.status, 200, "TOTP enrollment must succeed");
      assert.equal(typeof enabled.data.totpURI, "string");
      const verified = await client.request(
        "/api/auth/two-factor/verify-totp",
        { method: "POST", body: { code: totp(enabled.data.totpURI) } },
      );
      assert.equal(
        verified.status,
        200,
        "Library TOTP verification must succeed",
      );
      return enabled.data.backupCodes;
    };
    stage = "HTTP flows";
    await t.test(
      "actual privileged migration connections are rejected by runtime guards",
      async () => {
        await assert.rejects(
          createSecurity({ ...securityConfig, authDatabaseUrl: connection() }),
          /unsafe/,
        );
        await assert.rejects(
          createApplication(config, undefined, undefined, {
            security,
            pool: admin,
            trustedOrigins: [base],
          }),
          /Restricted application/,
        );
      },
    );
    await t.test(
      "identity role has no tenant privileges and application role has no identity privileges",
      async () => {
        const identityPool = new pg.Pool({
          connectionString: securityConfig.authDatabaseUrl,
          max: 1,
        });
        watch(identityPool);
        try {
          assert.equal(
            (await identityPool.query("SELECT id FROM auth_users")).rowCount,
            0,
          );
          for (const table of [
            "organizations",
            "branches",
            "memberships",
            "audit_events",
          ]) {
            await assert.rejects(identityPool.query(`SELECT * FROM ${table}`), {
              code: "42501",
            });
          }
          await assert.rejects(
            identityPool.query("SET ROLE unibos_rls_guard"),
            { code: "42501" },
          );
          await assert.rejects(pool.query("SELECT token FROM auth_sessions"), {
            code: "42501",
          });
        } finally {
          await identityPool.end();
        }
      },
    );
    await t.test(
      "startup rejects later accidental privilege grants across identity and tenant roles",
      async () => {
        await admin.query("GRANT SELECT ON organizations TO unibos_auth");
        try {
          await assert.rejects(createSecurity(securityConfig), /unsafe/);
        } finally {
          await admin.query("REVOKE SELECT ON organizations FROM unibos_auth");
        }
        await admin.query("GRANT SELECT ON auth_users TO unibos_app");
        try {
          await assert.rejects(
            createApplication(config, undefined, undefined, {
              security,
              pool,
              trustedOrigins: [base],
            }),
            /Restricted application/,
          );
        } finally {
          await admin.query("REVOKE SELECT ON auth_users FROM unibos_app");
        }
        await admin.query("GRANT SELECT(email) ON auth_users TO unibos_app");
        try {
          await assert.rejects(
            createApplication(config, undefined, undefined, {
              security,
              pool,
              trustedOrigins: [base],
            }),
            /Restricted application/,
          );
        } finally {
          await admin.query(
            "REVOKE SELECT(email) ON auth_users FROM unibos_app",
          );
        }
        await admin.query("GRANT SELECT(name) ON organizations TO unibos_auth");
        try {
          await assert.rejects(createSecurity(securityConfig), /unsafe/);
        } finally {
          await admin.query(
            "REVOKE SELECT(name) ON organizations FROM unibos_auth",
          );
        }
      },
    );
    await t.test(
      "signup creates HttpOnly sessions, hashes passwords and rejects anonymous access",
      async () => {
        assert.equal((await anonymous.request("/api/me")).status, 401);
        for (const [client, email] of [
          [a, "owner-a@example.invalid"],
          [b, "owner-b@example.invalid"],
          [staff, "staff@example.invalid"],
        ]) {
          const registered = await client.request("/api/auth/sign-up/email", {
            method: "POST",
            body: { email, password, name: "Synthetic Test User" },
          });
          assert.equal(registered.status, 200);
          assert.ok(
            registered.setCookies.some(
              (cookie) =>
                /httponly/i.test(cookie) && /samesite=lax/i.test(cookie),
            ),
          );
          assert.equal(
            (await client.request("/api/me")).data.mfaVerified,
            false,
          );
        }
        userA = (await a.request("/api/me")).data.userId;
        userB = (await b.request("/api/me")).data.userId;
        userStaff = (await staff.request("/api/me")).data.userId;
        const rows = await admin.query("SELECT password FROM auth_accounts");
        assert.equal(rows.rowCount, 3);
        assert.ok(
          rows.rows.every(
            (row) =>
              typeof row.password === "string" && row.password !== password,
          ),
        );
        oldA = a.clone();
        oldB = b.clone();
        assert.equal(
          (
            await a.request("/api/organizations", {
              method: "POST",
              body: { name: "No MFA" },
            })
          ).status,
          403,
        );
      },
    );
    await t.test(
      "verified MFA rotates session and old password-only bearer remains unusable",
      async () => {
        codesA = await enroll(a);
        await enroll(b);
        assert.equal((await a.request("/api/me")).data.mfaVerified, true);
        assert.equal((await b.request("/api/me")).data.mfaVerified, true);
        assert.equal((await oldA.request("/api/me")).status, 401);
        assert.equal((await oldB.request("/api/me")).status, 401);
        assert.equal(
          (
            await oldA.request("/api/organizations", {
              method: "POST",
              body: { name: "Stale" },
            })
          ).status,
          401,
        );
      },
    );
    await t.test(
      "password login requires MFA, consumes its challenge and issues a fresh session",
      async () => {
        const login = new Client(base);
        const passwordStep = await login.request("/api/auth/sign-in/email", {
          method: "POST",
          body: { email: "owner-a@example.invalid", password },
        });
        assert.equal(passwordStep.status, 200);
        assert.equal(passwordStep.data.twoFactorRedirect, true);
        assert.equal((await login.request("/api/me")).status, 401);
        const staleChallenge = login.clone();
        const factor = await login.request(
          "/api/auth/two-factor/verify-backup-code",
          { method: "POST", body: { code: codesA[1] } },
        );
        assert.equal(factor.status, 200);
        assert.equal((await login.request("/api/me")).data.mfaVerified, true);
        const replay = await staleChallenge.request(
          "/api/auth/two-factor/verify-backup-code",
          { method: "POST", body: { code: codesA[2] } },
        );
        assert.equal(replay.status, 401);
        assert.equal(
          (
            await login.request("/api/auth/sign-out", {
              method: "POST",
              body: {},
            })
          ).status,
          200,
        );
        assert.equal((await a.request("/api/me")).data.mfaVerified, true);
      },
    );
    await t.test(
      "unexpected authentication backend errors are sanitized without raw logging",
      async () => {
        const sentinel = "SENSITIVE_AUTH_BACKEND_SENTINEL";
        await admin.query(
          "CREATE FUNCTION public.test_fail_auth_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SENSITIVE_AUTH_BACKEND_SENTINEL'; END $$",
        );
        await admin.query(
          "CREATE TRIGGER test_fail_auth_update BEFORE UPDATE ON public.auth_users FOR EACH ROW EXECUTE FUNCTION public.test_fail_auth_update()",
        );
        const captured = [];
        const previous = console.error;
        let failed;
        try {
          console.error = (...args) =>
            captured.push(
              args
                .map((value) =>
                  value instanceof Error ? value.message : String(value),
                )
                .join(" "),
            );
          failed = await a.request("/api/auth/update-user", {
            method: "POST",
            body: { name: "Synthetic renamed user" },
          });
        } finally {
          console.error = previous;
          await admin.query(
            "DROP TRIGGER test_fail_auth_update ON public.auth_users",
          );
          await admin.query("DROP FUNCTION public.test_fail_auth_update()");
        }
        assert.equal(failed.status, 503);
        assert.ok(
          !JSON.stringify(failed.data).includes(sentinel),
          "Backend detail reached the client",
        );
        assert.ok(
          !captured.some((line) => line.includes(sentinel)),
          "Backend detail reached raw console output",
        );
      },
    );
    await t.test(
      "MFA-verified owners onboard separate organizations and branches with atomic audit",
      async () => {
        const first = await a.request("/api/organizations", {
          method: "POST",
          body: { name: "Tenant A" },
        });
        assert.equal(first.status, 201);
        orgA = first.data.organization.id;
        const second = await b.request("/api/organizations", {
          method: "POST",
          body: { name: "Tenant B" },
        });
        assert.equal(second.status, 201);
        orgB = second.data.organization.id;
        const branch = async (client, org, name) => {
          const result = await client.request(
            `/api/organizations/${org}/branches`,
            { method: "POST", body: { name } },
          );
          assert.equal(result.status, 201);
          return result.data.branch.id;
        };
        branchA = await branch(a, orgA, "A one");
        branchA2 = await branch(a, orgA, "A two");
        branchB = await branch(b, orgB, "B one");
        assert.deepEqual(
          (await a.request("/api/organizations")).data.organizations.map(
            (row) => row.id,
          ),
          [orgA],
        );
        const events = await a.request(`/api/organizations/${orgA}/audit`);
        assert.equal(events.status, 200);
        assert.ok(
          events.data.events.every(
            (event) =>
              event.organization_id === orgA && event.actor_user_id === userA,
          ),
        );
      },
    );
    await t.test(
      "authenticated owner manages branch catalog through the real API and PostgreSQL",
      async () => {
        const categoryResponse = await a.request(
          `/api/organizations/${orgA}/catalog/categories`,
          { method: "POST", body: { name: "P4.4.5 Test Drinks" } },
        );
        assert.equal(categoryResponse.status, 201);
        const categoryId = categoryResponse.data.category.id;

        const productResponse = await a.request(
          `/api/organizations/${orgA}/catalog/products`,
          {
            method: "POST",
            body: {
              categoryId,
              name: "Synthetic Tea",
              description: "Disposable integration fixture",
              imageKey: null,
              sortOrder: 0,
            },
          },
        );
        assert.equal(productResponse.status, 201);
        const productId = productResponse.data.product.id;

        const pricePath = `/api/organizations/${orgA}/branches/${branchA}/catalog/${productId}/price`;
        const ownerMemberships = await admin.query(
          "SELECT role,branch_id FROM public.memberships WHERE organization_id=$1 AND user_id=$2 ORDER BY role",
          [orgA, userA],
        );
        assert.ok(
          ownerMemberships.rows.some(
            (membership) =>
              membership.role === "owner" && membership.branch_id === null,
          ),
          JSON.stringify(ownerMemberships.rows),
        );
        const branchCatalog = await a.request(
          `/api/organizations/${orgA}/branches/${branchA}/catalog`,
        );
        assert.equal(
          branchCatalog.status,
          200,
          JSON.stringify(branchCatalog.data),
        );
        const firstPrice = await a.request(pricePath, {
          method: "POST",
          body: {
            priceMinor: 12500,
            currencyCode: "UZS",
            expectedPriceVersionId: null,
          },
        });
        assert.equal(firstPrice.status, 201, JSON.stringify(firstPrice.data));
        const versionId = firstPrice.data.price.id;

        const stalePrice = await a.request(pricePath, {
          method: "POST",
          body: {
            priceMinor: 15000,
            currencyCode: "UZS",
            expectedPriceVersionId: null,
          },
        });
        assert.equal(stalePrice.status, 409);

        const updatedPrice = await a.request(pricePath, {
          method: "POST",
          body: {
            priceMinor: 13000,
            currencyCode: "UZS",
            expectedPriceVersionId: versionId,
          },
        });
        assert.equal(updatedPrice.status, 201);

        const availabilityPath = `/api/organizations/${orgA}/branches/${branchA}/catalog/${productId}/availability`;
        assert.equal(
          (
            await a.request(availabilityPath, {
              method: "PATCH",
              body: { available: false },
            })
          ).status,
          200,
        );
        const catalog = await a.request(
          `/api/organizations/${orgA}/branches/${branchA}/catalog`,
        );
        assert.equal(catalog.status, 200);
        assert.deepEqual(
          catalog.data.products.map((product) => ({
            id: product.id,
            available: product.available,
            priceMinor: product.price_minor,
            currency: product.currency_code,
          })),
          [
            {
              id: productId,
              available: false,
              priceMinor: "13000",
              currency: "UZS",
            },
          ],
        );
        const history = await a.request(pricePath);
        assert.equal(history.status, 200);
        assert.equal(history.data.priceHistory.length, 2);

        if (process.env.P4_4_5_UI_BASE_URL) {
          const { chromium } = require("playwright");
          const uiBase = new URL(process.env.P4_4_5_UI_BASE_URL);
          assert.ok(["127.0.0.1", "localhost"].includes(uiBase.hostname));
          const browser = await chromium.launch({
            headless: true,
            executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
            args: ["--no-sandbox"],
          });
          try {
            const context = await browser.newContext({
              viewport: { width: 1440, height: 1000 },
            });
            await context.addCookies(
              [...a.cookies].map(([name, value]) => ({
                name,
                value,
                domain: uiBase.hostname,
                path: "/",
                httpOnly: true,
                secure: false,
                sameSite: "Lax",
              })),
            );
            const page = await context.newPage();
            const response = await page.goto(
              new URL(
                `/dashboard/menu?organizationId=${orgA}&branchId=${branchA}`,
                uiBase,
              ).href,
              { waitUntil: "networkidle" },
            );
            assert.equal(response?.status(), 200);
            await page.getByText("Synthetic Tea", { exact: true }).waitFor();
            assert.ok(
              await page.getByText("130,00 UZS", { exact: false }).count(),
              "The authenticated UI should render the database-backed branch price",
            );
            await page.screenshot({
              path: "/workspace/work/p4.4.5-qa/catalog-integrated-authenticated.png",
              fullPage: true,
            });
            await context.close();
          } finally {
            await browser.close();
          }
        }
      },
    );
    await t.test(
      "owner analytics checks the verified session, organization, branch and bounded UTC interval",
      async () => {
        const path = `/api/v1/organizations/${orgA}/branches/${branchA}/analytics`;
        const query = "?from=2020-02-29&to=2020-02-29";
        assert.equal((await anonymous.request(path + query)).status, 401);
        assert.equal((await b.request(path + query)).status, 403);
        const authorized = await a.request(path + query);
        assert.equal(authorized.status, 200);
        assert.equal(authorized.data.organizationId, orgA);
        assert.equal(authorized.data.branchId, branchA);
        assert.deepEqual(authorized.data.currencies, []);
        assert.equal(
          (await a.request(path.replace(branchA, branchB) + query)).status,
          403,
        );
        assert.equal(
          (await a.request(path + query, { method: "POST", body: {} })).status,
          404,
        );
        for (const invalid of [
          "",
          "?from=2020-02-29",
          "?from=2020-02-30&to=2020-03-01",
          "?from=2020-03-01&to=2020-02-29",
          "?from=2020-01-01&to=2020-04-02",
          query + "&role=owner",
          query + "&from=2020-01-01",
        ]) {
          assert.equal((await a.request(path + invalid)).status, 400, invalid);
        }
        assert.equal(
          (await a.request(path + "?from=2020-01-01&to=2020-04-01")).status,
          200,
        );
      },
    );
    await t.test(
      "forged tenant, actor, role, origin and malformed identifiers fail closed",
      async () => {
        assert.equal(
          (await a.request(`/api/organizations/${orgB}/branches`)).status,
          403,
        );
        assert.equal(
          (await a.request(`/api/organizations/${orgB}/audit`)).status,
          403,
        );
        assert.equal(
          (await a.request("/api/organizations/not-a-uuid/branches")).status,
          400,
        );
        assert.equal(
          (
            await a.request("/api/organizations", {
              method: "POST",
              body: { name: "Forged", userId: userB },
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await a.request("/api/organizations", {
              method: "POST",
              body: { name: "CSRF" },
              origin: "https://hostile.invalid",
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await a.request("/api/auth/sign-out", {
              method: "POST",
              body: {},
              origin: null,
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await a.request("/api/auth/sign-out", {
              method: "POST",
              body: {},
              origin: "https://hostile.invalid",
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await a.request(`/api/organizations/${orgA}/memberships`, {
              method: "POST",
              body: { userId: userStaff, role: "owner" },
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await a.request("/api/organizations", {
              method: "POST",
              body: { name: "x".repeat(17000) },
            })
          ).status,
          413,
        );
      },
    );
    await t.test(
      "cross-tenant branch references fail and branch-scoped staff sees only its branch",
      async () => {
        const path = `/api/organizations/${orgA}/memberships`;
        assert.equal(
          (
            await a.request(path, {
              method: "POST",
              body: { userId: userStaff, role: "waiter", branchId: branchB },
            })
          ).status,
          400,
        );
        const granted = await a.request(path, {
          method: "POST",
          body: { userId: userStaff, role: "waiter", branchId: branchA },
        });
        assert.equal(granted.status, 201);
        membership = granted.data.membership.id;
        const branches = await staff.request(
          `/api/organizations/${orgA}/branches`,
        );
        assert.equal(branches.status, 200);
        assert.deepEqual(
          branches.data.branches.map((row) => row.id),
          [branchA],
        );
        assert.equal(
          (await staff.request(`/api/organizations/${orgA}/audit`)).status,
          403,
        );
        assert.equal(
          (await staff.request(`/api/organizations/${orgB}/branches`)).status,
          403,
        );
        assert.equal(
          (
            await staff.request(path, {
              method: "POST",
              body: { userId: userStaff, role: "director" },
            })
          ).status,
          403,
        );
      },
    );
    await t.test(
      "role changes and membership revocation take effect on the same existing session",
      async () => {
        const path = `/api/organizations/${orgA}/memberships/${membership}`;
        const update = await a.request(path, {
          method: "PATCH",
          body: { role: "cashier", branchId: branchA2 },
        });
        assert.equal(update.status, 200);
        assert.deepEqual(
          (
            await staff.request(`/api/organizations/${orgA}/branches`)
          ).data.branches.map((row) => row.id),
          [branchA2],
        );
        assert.equal((await a.request(path, { method: "DELETE" })).status, 200);
        assert.equal(
          (await staff.request(`/api/organizations/${orgA}/branches`)).status,
          403,
        );
        assert.equal((await staff.request("/api/me")).status, 200);
        const events = (await a.request(`/api/organizations/${orgA}/audit`))
          .data.events;
        const granted = events.find(
          (event) =>
            event.entity_id === membership &&
            event.action === "memberships.insert",
        );
        const changed = events.find(
          (event) =>
            event.entity_id === membership &&
            event.action === "memberships.update",
        );
        const revoked = events.find(
          (event) =>
            event.entity_id === membership &&
            event.action === "memberships.delete",
        );
        assert.equal(granted.target_user_id, userStaff);
        assert.equal(granted.old_role, null);
        assert.equal(granted.new_role, "waiter");
        assert.equal(granted.new_branch_id, branchA);
        assert.equal(changed.target_user_id, userStaff);
        assert.equal(changed.old_role, "waiter");
        assert.equal(changed.new_role, "cashier");
        assert.equal(changed.old_branch_id, branchA);
        assert.equal(changed.new_branch_id, branchA2);
        assert.equal(revoked.target_user_id, userStaff);
        assert.equal(revoked.old_role, "cashier");
        assert.equal(revoked.new_role, null);
        const owner = (
          await a.request(`/api/organizations/${orgA}/memberships`)
        ).data.memberships.find((row) => row.role === "owner");
        assert.equal(
          (
            await a.request(
              `/api/organizations/${orgA}/memberships/${owner.id}`,
              { method: "DELETE" },
            )
          ).status,
          404,
        );
      },
    );
    await t.test(
      "expired MFA cannot change factors or privileges; backup step-up rotates and is single-use",
      async () => {
        await admin.query(
          "UPDATE auth_mfa_sessions SET verified_at=now()-interval '16 minutes' WHERE user_id=$1",
          [userA],
        );
        assert.equal((await a.request("/api/me")).data.mfaVerified, false);
        assert.equal(
          (
            await a.request(
              `/api/v1/organizations/${orgA}/branches/${branchA}/analytics?from=2020-01-01&to=2020-01-01`,
            )
          ).status,
          403,
        );

        assert.equal(
          (
            await a.request(`/api/organizations/${orgA}/branches`, {
              method: "POST",
              body: { name: "Expired" },
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await a.request("/api/auth/two-factor/disable", {
              method: "POST",
              body: { password },
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await a.request("/api/auth/two-factor/get-totp-uri", {
              method: "POST",
              body: { password },
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await a.request("/api/auth/two-factor/generate-backup-codes", {
              method: "POST",
              body: { password },
            })
          ).status,
          403,
        );
        for (const suffix of [
          "get-totp-uri/",
          "%67et-totp-uri",
          "generate-backup-codes/",
        ]) {
          const alias = await a.request(`/api/auth/two-factor/${suffix}`, {
            method: "POST",
            body: { password },
          });
          assert.ok(
            [403, 404].includes(alias.status),
            "Factor-material route alias bypassed the MFA guard",
          );
        }
        const before = a.clone();
        const stepup = await a.request(
          "/api/auth/two-factor/verify-backup-code",
          { method: "POST", body: { code: codesA[0] } },
        );
        assert.equal(stepup.status, 200);
        assert.equal((await a.request("/api/me")).data.mfaVerified, true);
        assert.equal((await before.request("/api/me")).status, 401);
        const reused = await a.request(
          "/api/auth/two-factor/verify-backup-code",
          { method: "POST", body: { code: codesA[0] } },
        );
        assert.equal(reused.status, 401);
      },
    );
    await t.test(
      "factor secret retrieval and recovery-code regeneration require valid recent MFA",
      async () => {
        const uri = await a.request("/api/auth/two-factor/get-totp-uri", {
          method: "POST",
          body: { password },
        });
        assert.equal(uri.status, 200);
        assert.equal(typeof uri.data.totpURI, "string");
        const regenerated = await a.request(
          "/api/auth/two-factor/generate-backup-codes",
          { method: "POST", body: { password } },
        );
        assert.equal(regenerated.status, 200);
        assert.ok(regenerated.data.backupCodes.length > 0);
        assert.equal(
          (
            await a.request("/api/auth/two-factor/verify-backup-code", {
              method: "POST",
              body: { code: codesA[3] },
            })
          ).status,
          401,
        );
      },
    );
    await t.test(
      "server session revocation is immediate and MFA cookie cannot revive it",
      async () => {
        const saved = b.clone();
        assert.equal(
          (await b.request("/api/auth/sign-out", { method: "POST", body: {} }))
            .status,
          200,
        );
        assert.equal((await saved.request("/api/me")).status, 401);
        assert.equal(
          (await saved.request(`/api/organizations/${orgB}/branches`)).status,
          401,
        );
      },
    );
    await t.test(
      "expired server sessions are rejected without a cookie-cache grace period",
      async () => {
        await admin.query(
          'UPDATE auth_sessions SET "expiresAt"=now()-interval \'1 minute\' WHERE "userId"=$1',
          [userStaff],
        );
        assert.equal((await staff.request("/api/me")).status, 401);
      },
    );
    await t.test(
      "shared database rate limits ignore client-spoofed IP headers",
      async () => {
        let status;
        for (let index = 0; index < 6; index++) {
          const result = await anonymous.request("/api/auth/sign-in/email", {
            method: "POST",
            body: { email: "nobody@example.invalid", password },
            headers: {
              "x-unibos-client-ip": `192.0.2.${index + 1}`,
              "x-forwarded-for": `198.51.100.${index + 1}`,
            },
          });
          status = result.status;
        }
        assert.equal(status, 429);
        assert.ok(
          (
            await admin.query(
              "SELECT count(*)::integer AS count FROM auth_rate_limits",
            )
          ).rows[0].count > 0,
        );
      },
    );
    await t.test(
      "concurrent login attempts cannot exceed the shared fixed-window budget",
      async () => {
        // Only this owned disposable database is reset; no user database is touched.
        await admin.query("DELETE FROM auth_rate_limits");
        const results = await Promise.all(
          Array.from({ length: 10 }, (_, index) =>
            anonymous.request("/api/auth/sign-in/email", {
              method: "POST",
              body: { email: "nobody@example.invalid", password },
              headers: { "x-forwarded-for": `203.0.113.${index + 1}` },
            }),
          ),
        );
        assert.ok(
          results.filter((result) => result.status !== 429).length <= 5,
        );
        assert.ok(
          results.every((result) => [401, 429].includes(result.status)),
        );
      },
    );
    await t.test(
      "unknown paths have bounded counter categories and stale budgets are pruned",
      async () => {
        await admin.query("DELETE FROM auth_rate_limits");
        await anonymous.request("/api/auth/ok");
        const count = async () =>
          (
            await admin.query(
              "SELECT count(*)::integer AS count FROM auth_rate_limits WHERE key LIKE 'unibos-rate:%'",
            )
          ).rows[0].count;
        const before = await count();
        for (let i = 0; i < 10; i++)
          assert.equal(
            (await anonymous.request(`/api/auth/unknown-${i}`)).status,
            404,
          );
        assert.equal(await count(), before);
        await admin.query(
          "INSERT INTO auth_rate_limits(id,key,count,\"lastRequest\") VALUES('expired-fixture','expired-fixture',1,0)",
        );
        await anonymous.request("/api/auth/ok");
        assert.equal(
          (
            await admin.query(
              "SELECT id FROM auth_rate_limits WHERE id='expired-fixture'",
            )
          ).rowCount,
          0,
        );
      },
    );
    await t.test(
      "MFA restaurant journey from catalog through service and cash settlement to owner analytics",
      async () => {
        await restaurantJourney({
          owner: a,
          newClient: () => new Client(base),
          enroll,
          password,
          org: orgA,
          branch: branchA2,
        });
      },
    );
    assert.deepEqual(idleErrors, []);
  } catch (error) {
    t.diagnostic(`Failed stage: ${stage}`);
    throw error;
  } finally {
    cleaning = true;
    if (app) await app.close();
    else if (security) await security.close();
    if (admin) await admin.end();
    if (created) await bootstrap.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await bootstrap.end();
  }
});
