import { betterAuth, type BetterAuthOptions } from "better-auth";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { fromNodeHeaders } from "better-auth/node";
import { setSessionCookie } from "better-auth/cookies";
import { twoFactor } from "better-auth/plugins/two-factor";
import { Pool } from "pg";
import { getRequest, setResponse } from "better-call/node";
import type {
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from "node:http";
import { createHmac, randomUUID } from "node:crypto";

export interface SecurityConfig {
  readonly secret: string;
  readonly baseURL: string;
  readonly authDatabaseUrl: string;
  readonly trustedOrigins: readonly string[];
  readonly enableSignup: boolean;
  readonly mode: "development" | "test" | "production";
}
export interface Identity {
  readonly userId: string;
  readonly sessionId: string;
  readonly mfaVerified: boolean;
}
export interface SecurityInstance {
  nodeHandler(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void>;
  getIdentity(headers: IncomingHttpHeaders | Headers): Promise<Identity | null>;
  close(): Promise<void>;
}

const MFA_PATHS = new Set([
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
]);
const MFA_RESET_PATHS = new Set(["/two-factor/enable", "/two-factor/disable"]);
const SENSITIVE_ACCOUNT_PATHS = new Set([
  ...MFA_RESET_PATHS,
  "/change-password",
  "/change-email",
  "/delete-user",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/two-factor/get-totp-uri",
  "/two-factor/generate-backup-codes",
]);
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
function canonicalAuthPath(raw: string): string {
  try {
    return decodeURIComponent(raw)
      .replace(/\/{2,}/g, "/")
      .replace(/^\/api\/auth(?=\/|$)/, "")
      .replace(/\/+$/, "");
  } catch {
    throw new APIError("BAD_REQUEST", {
      message: "Invalid authentication path",
    });
  }
}

async function takeBudget(
  pool: Pool,
  secret: string,
  scope: string,
  limit: number,
): Promise<boolean> {
  const key =
    "unibos-rate:" + createHmac("sha256", secret).update(scope).digest("hex");
  // Atomic fixed-window counters. Concurrent instances share the same database;
  // no read/modify/write race, unbounded counter, or in-memory fail-open fallback.
  const result = await pool.query<{ count: number }>(
    `
    WITH pruned AS (
      DELETE FROM public.auth_rate_limits
        WHERE key<>$2 AND "lastRequest"<floor(extract(epoch from clock_timestamp())*1000)::bigint-600000
        AND id IN (SELECT id FROM public.auth_rate_limits
          WHERE key<>$2 AND "lastRequest"<floor(extract(epoch from clock_timestamp())*1000)::bigint-600000
          ORDER BY "lastRequest",id LIMIT 1000)
      RETURNING id
    )
    INSERT INTO public.auth_rate_limits(id,key,count,"lastRequest")
      VALUES($1,$2,1,floor(extract(epoch from clock_timestamp())*1000)::bigint)
    ON CONFLICT(key) DO UPDATE SET
      count=CASE WHEN auth_rate_limits."lastRequest"<=EXCLUDED."lastRequest"-60000
        THEN 1 ELSE least(auth_rate_limits.count+1,$3+1) END,
      "lastRequest"=CASE WHEN auth_rate_limits."lastRequest"<=EXCLUDED."lastRequest"-60000
        THEN EXCLUDED."lastRequest" ELSE auth_rate_limits."lastRequest" END
    RETURNING count`,
    [randomUUID(), key, limit],
  );
  return (result.rows[0]?.count ?? limit + 1) <= limit;
}

/** Errors identify keys only: credentials and supplied values are never echoed. */
export function validateSecurityConfig(config: SecurityConfig): void {
  if (typeof config.secret !== "string" || config.secret.length < 32) {
    throw new Error("Invalid BETTER_AUTH_SECRET");
  }
  if (!["development", "test", "production"].includes(config.mode)) {
    throw new Error("Invalid auth mode");
  }
  const base = validateOrigin(config.baseURL, config.mode);
  if (!config.trustedOrigins.length || !config.trustedOrigins.includes(base)) {
    throw new Error("Invalid AUTH_TRUSTED_ORIGINS");
  }
  for (const origin of config.trustedOrigins)
    validateOrigin(origin, config.mode);
  let database: URL;
  try {
    database = new URL(config.authDatabaseUrl);
  } catch {
    throw new Error("Invalid AUTH_DATABASE_URL");
  }
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !database.hostname ||
    !database.username ||
    !database.password ||
    database.pathname === "/" ||
    database.hash
  ) {
    throw new Error("Invalid AUTH_DATABASE_URL");
  }
  if (config.mode === "production") {
    if (database.searchParams.get("sslmode") !== "verify-full") {
      throw new Error("AUTH_DATABASE_URL requires verified TLS in production");
    }
    if (config.enableSignup)
      throw new Error(
        "Production signup requires a verified email delivery integration",
      );
  }
}

function validateOrigin(value: string, mode: SecurityConfig["mode"]): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid auth origin");
  }
  if (
    url.origin !== value ||
    url.hostname.includes("*") ||
    url.username ||
    url.password ||
    !["http:", "https:"].includes(url.protocol)
  ) {
    throw new Error("Invalid auth origin");
  }
  if (mode === "production" && url.protocol !== "https:")
    throw new Error("Auth origin requires HTTPS in production");
  if (
    mode !== "production" &&
    url.protocol === "http:" &&
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  ) {
    throw new Error("Non-TLS auth origin must be loopback");
  }
  return url.origin;
}

/** Shared by schema generation and runtime so plugins/table names cannot drift. */
export function createAuthOptions(
  config: SecurityConfig,
  pool: Pool,
): BetterAuthOptions {
  validateSecurityConfig(config);
  return {
    appName: "UniBOS",
    secret: config.secret,
    baseURL: config.baseURL,
    basePath: "/api/auth",
    trustedOrigins: [...config.trustedOrigins],
    database: pool,
    user: { modelName: "auth_users" },
    session: {
      modelName: "auth_sessions",
      expiresIn: 60 * 60 * 24,
      updateAge: 60 * 60,
      cookieCache: { enabled: false },
    },
    account: { modelName: "auth_accounts", accountLinking: { enabled: false } },
    verification: { modelName: "auth_verifications" },
    emailAndPassword: {
      enabled: true,
      disableSignUp: !config.enableSignup,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: config.mode === "production",
    },
    advanced: {
      useSecureCookies: config.mode === "production",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: config.mode === "production",
      },
      ipAddress: { ipAddressHeaders: ["x-unibos-client-ip"] },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "auth_rate_limits",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/two-factor/verify-totp": { window: 60, max: 5 },
        "/two-factor/verify-backup-code": { window: 60, max: 5 },
      },
    },
    logger: { disabled: true },
    // Unexpected library/driver errors must reach our sanitized Node boundary,
    // rather than Better Call's default raw console.error fallback.
    onAPIError: { throw: true },
    plugins: [
      twoFactor({
        issuer: "UniBOS",
        skipVerificationOnEnable: false,
        allowPasswordless: false,
        schema: { twoFactor: { modelName: "auth_two_factors" } },
        accountLockout: {
          enabled: true,
          maxFailedAttempts: 5,
          durationSeconds: 900,
        },
      }),
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const path = canonicalAuthPath(ctx.path);
        if (ctx.body?.trustDevice === true)
          throw new APIError("BAD_REQUEST", {
            message: "Remembered devices are unavailable",
          });
        if (MFA_PATHS.has(path)) {
          const existing = await getSessionFromCtx(ctx);
          if (
            existing &&
            !(await takeBudget(
              pool,
              config.secret,
              `factor-user:${existing.user.id}`,
              5,
            ))
          ) {
            throw new APIError("TOO_MANY_REQUESTS", {
              message: "Too many verification attempts",
            });
          }
        }
        if (SENSITIVE_ACCOUNT_PATHS.has(path)) {
          const session = await getSessionFromCtx(ctx);
          if (
            session &&
            "twoFactorEnabled" in session.user &&
            session.user.twoFactorEnabled === true
          ) {
            const assurance = await pool.query(
              "SELECT 1 FROM auth_mfa_sessions WHERE session_id=$1 AND user_id=$2 AND verified_at>now()-interval '15 minutes'",
              [session.session.id, session.user.id],
            );
            if (assurance.rowCount !== 1)
              throw new APIError("FORBIDDEN", {
                message: "Recent multi-factor verification required",
              });
          }
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        const path = canonicalAuthPath(ctx.path);
        if (ctx.context.returned instanceof APIError) return;
        if (MFA_RESET_PATHS.has(path)) {
          const changed =
            ctx.context.newSession ?? (await getSessionFromCtx(ctx));
          if (changed)
            await pool.query(
              "DELETE FROM auth_mfa_sessions WHERE user_id = $1",
              [changed.user.id],
            );
          return;
        }
        if (!MFA_PATHS.has(path)) return;
        const returned = ctx.context.returned;
        // Only a successful library-verified factor returns a user/token object.
        if (
          !returned ||
          typeof returned !== "object" ||
          !("token" in returned) ||
          !("user" in returned)
        )
          return;
        const session = ctx.context.newSession ?? ctx.context.session;
        if (!session) return;
        // Step-up must never upgrade an already-issued bearer in place. Use the
        // library's session/cookie APIs, then revoke the previous bearer.
        const fresh = await ctx.context.internalAdapter.createSession(
          session.user.id,
          false,
        );
        if (!fresh)
          throw new APIError("INTERNAL_SERVER_ERROR", {
            message: "Session verification unavailable",
          });
        await ctx.context.internalAdapter.deleteSession(session.session.token);
        await setSessionCookie(ctx, { session: fresh, user: session.user });
        await pool.query(
          'INSERT INTO auth_mfa_sessions(session_id, user_id, verified_at) SELECT id, "userId", now() FROM auth_sessions WHERE id=$1 AND "userId"=$2 AND "expiresAt">now() ON CONFLICT(session_id) DO UPDATE SET verified_at=EXCLUDED.verified_at',
          [fresh.id, session.user.id],
        );
        return ctx.json({ ...returned, token: fresh.token });
      }),
    },
  };
}

class IdentityRoleViolation extends Error {}

/** Canonical identity-role check for the request runtime and offline staging maintenance. */
export async function verifyRestrictedIdentityRole(
  database: Pick<Pool, "query">,
) {
  const {
    rows: [role],
  } =
    await database.query(`SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolinherit, rolreplication,
      EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE relowner=pg_roles.oid) AS owns_relations,
      EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE nspowner=pg_roles.oid) AS owns_schemas,
      EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=pg_roles.oid) AS has_memberships,
      has_database_privilege(current_user,current_database(),'CREATE') AS can_create_schema,
      has_schema_privilege(current_user,'public','CREATE') AS can_create_in_public,
      EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
        AND c.relname NOT IN ('auth_users','auth_sessions','auth_accounts','auth_verifications','auth_two_factors','auth_rate_limits','auth_mfa_sessions')
        AND (has_table_privilege(current_user,c.oid,'SELECT') OR has_table_privilege(current_user,c.oid,'INSERT')
          OR has_table_privilege(current_user,c.oid,'UPDATE') OR has_table_privilege(current_user,c.oid,'DELETE')
          OR has_any_column_privilege(current_user,c.oid,'SELECT') OR has_any_column_privilege(current_user,c.oid,'INSERT')
          OR has_any_column_privilege(current_user,c.oid,'UPDATE')))
      AS has_business_grants FROM pg_catalog.pg_roles WHERE rolname=current_user`);
  if (!role || role.rolname !== "unibos_auth")
    throw new IdentityRoleViolation("AUTH_ROLE_UNEXPECTED");
  const prohibited = [
    "rolsuper",
    "rolbypassrls",
    "rolcreatedb",
    "rolcreaterole",
    "rolinherit",
    "rolreplication",
    "owns_relations",
    "owns_schemas",
    "has_memberships",
    "can_create_schema",
    "can_create_in_public",
    "has_business_grants",
  ] as const;
  for (const attribute of prohibited) {
    if (role[attribute] !== false)
      throw new IdentityRoleViolation(`AUTH_ROLE_${attribute.toUpperCase()}`);
  }
}

export async function createSecurity(
  config: SecurityConfig,
  options: { connectionTimeoutMillis?: number } = {},
): Promise<SecurityInstance> {
  validateSecurityConfig(config);
  const connectionTimeoutMillis = options.connectionTimeoutMillis ?? 1500;
  if (
    !Number.isInteger(connectionTimeoutMillis) ||
    connectionTimeoutMillis < 1500 ||
    connectionTimeoutMillis > 10000
  )
    throw new Error("Invalid identity connection timeout");
  const pool = new Pool({
    connectionString: config.authDatabaseUrl,
    max: 5,
    connectionTimeoutMillis,
    idleTimeoutMillis: 1000,
    statement_timeout: 3000,
    query_timeout: 3500,
    application_name: "unibos-auth",
  });
  pool.on("error", () => undefined);
  try {
    await verifyRestrictedIdentityRole(pool);
  } catch (error) {
    await pool.end();
    throw Object.assign(
      new Error("Authentication database role unavailable or unsafe"),
      {
        code:
          error instanceof IdentityRoleViolation
            ? "UNIBOS_AUTH_ROLE_REJECTED"
            : "UNIBOS_AUTH_DB_UNAVAILABLE",
      },
    );
  }
  const auth = betterAuth(createAuthOptions(config, pool));
  return {
    async nodeHandler(request, response) {
      if (MUTATING_METHODS.has(request.method ?? "")) {
        const origin = request.headers.origin;
        if (
          typeof origin !== "string" ||
          !config.trustedOrigins.includes(origin)
        ) {
          response.statusCode = 403;
          response.setHeader("Content-Type", "application/json");
          response.end(
            JSON.stringify({ status: "error", message: "Untrusted origin" }),
          );
          return;
        }
      }
      // Never trust X-Forwarded-For/Real-IP supplied by a client. A trusted reverse
      // proxy integration requires its own reviewed configuration later.
      request.headers["x-unibos-client-ip"] =
        request.socket.remoteAddress ?? "unknown";
      const declaredLength = request.headers["content-length"];
      if (
        typeof declaredLength === "string" &&
        (!/^\d+$/.test(declaredLength) || Number(declaredLength) > 16384)
      ) {
        response.statusCode = 413;
        response.setHeader("Content-Type", "application/json");
        response.end(
          JSON.stringify({
            status: "error",
            message: "Request body too large",
          }),
        );
        return;
      }
      try {
        const ip = request.socket.remoteAddress ?? "unknown";
        let path: string;
        try {
          path = decodeURIComponent(
            new URL(request.url ?? "/", config.baseURL).pathname,
          ).replace(/\/+$/, "");
        } catch {
          path = "invalid";
        }
        const route =
          [
            "/sign-up/email",
            "/sign-in/email",
            "/two-factor/verify-totp",
            "/two-factor/verify-backup-code",
          ].find((suffix) => path.endsWith(suffix)) ?? "other";
        const limit =
          route === "/sign-up/email" ? 3 : route === "other" ? 60 : 5;
        if (
          !(await takeBudget(pool, config.secret, `global:${ip}`, 60)) ||
          !(await takeBudget(
            pool,
            config.secret,
            `route:${ip}:${route}`,
            limit,
          ))
        ) {
          response.statusCode = 429;
          response.setHeader("Retry-After", "60");
          response.setHeader("Content-Type", "application/json");
          response.end(
            JSON.stringify({ status: "error", message: "Too many requests" }),
          );
          return;
        }
        // Better Call is the official Better Auth Node adapter. Supplying its
        // bodySizeLimit also bounds chunked bodies, unlike Content-Length alone.
        const result = await auth.handler(
          getRequest({ request, base: config.baseURL, bodySizeLimit: 16384 }),
        );
        if (result.status >= 500) {
          response.statusCode = 503;
          response.setHeader("Content-Type", "application/json");
          response.end(
            JSON.stringify({
              status: "error",
              message: "Authentication unavailable",
            }),
          );
          return;
        }
        await setResponse(response, result);
      } catch {
        if (!response.headersSent) {
          response.statusCode = 503;
          response.setHeader("Content-Type", "application/json");
          response.end(
            JSON.stringify({
              status: "error",
              message: "Authentication unavailable",
            }),
          );
        } else response.end();
      }
    },
    async getIdentity(headers) {
      const session = await auth.api.getSession({
        headers:
          headers instanceof Headers ? headers : fromNodeHeaders(headers),
        query: { disableCookieCache: true, disableRefresh: true },
      });
      if (!session) return null;
      const assurance = await pool.query(
        "SELECT 1 FROM auth_mfa_sessions a JOIN auth_users u ON u.id=a.user_id WHERE a.session_id=$1 AND a.user_id=$2 AND u.\"twoFactorEnabled\"=true AND a.verified_at > now()-interval '15 minutes'",
        [session.session.id, session.user.id],
      );
      return Object.freeze({
        userId: session.user.id,
        sessionId: session.session.id,
        mfaVerified: assurance.rowCount === 1,
      });
    },
    async close() {
      await pool.end();
    },
  };
}
