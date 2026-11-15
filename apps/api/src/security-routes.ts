import type {
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from "node:http";
import { Pool, type PoolClient } from "pg";
import {
  createOrganization,
  withTenantTransaction,
  withUserTransaction,
} from "@unibos/database";

export interface VerifiedIdentity {
  userId: string;
  sessionId: string;
  mfaVerified: boolean;
}
export interface SecurityInstance {
  nodeHandler(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void>;
  getIdentity(
    headers: IncomingHttpHeaders | Headers,
  ): Promise<VerifiedIdentity | null>;
  close(): Promise<void>;
}
export interface ApiSecurityOptions {
  security: SecurityInstance;
  pool: Pool;
  trustedOrigins: readonly string[];
}
export class ApiAccessError extends Error {
  constructor(readonly status: number) {
    super("Request denied");
  }
}
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const branchRoles = [
  "administrator",
  "accountant",
  "cashier",
  "waiter",
  "kitchen",
] as const;
type Role = "owner" | "director" | (typeof branchRoles)[number];
interface Membership {
  role: Role;
  branch_id: string | null;
}

export function validateUuid(value: string): string {
  if (!uuidPattern.test(value)) throw new ApiAccessError(400);
  return value;
}
export function validateName(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim().length < 1 ||
    value.trim().length > 120 ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new ApiAccessError(400);
  return value.trim();
}
export function canManageOrganization(
  memberships: readonly Membership[],
): boolean {
  return memberships.some(
    (membership) =>
      membership.branch_id === null &&
      ["owner", "director"].includes(membership.role),
  );
}
export function validateMembershipGrant(
  body: Record<string, unknown>,
  memberships: readonly Membership[],
) {
  exactKeys(body, ["userId", "role", "branchId"], ["userId", "role"]);
  if (
    typeof body.userId !== "string" ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(body.userId)
  )
    throw new ApiAccessError(400);
  if (body.role === "director") {
    if (body.branchId !== undefined && body.branchId !== null)
      throw new ApiAccessError(400);
    if (!memberships.some((m) => m.role === "owner" && m.branch_id === null))
      throw new ApiAccessError(403);
    return { userId: body.userId, role: "director", branchId: null };
  }
  if (
    typeof body.role !== "string" ||
    !branchRoles.includes(body.role as (typeof branchRoles)[number])
  )
    throw new ApiAccessError(400);
  if (typeof body.branchId !== "string") throw new ApiAccessError(400);
  const branchId = validateUuid(body.branchId);
  if (!canManageOrganization(memberships)) throw new ApiAccessError(403);
  return { userId: body.userId, role: body.role, branchId };
}
function exactKeys(
  body: Record<string, unknown>,
  allowed: readonly string[],
  required = allowed,
) {
  if (
    Object.keys(body).some((key) => !allowed.includes(key)) ||
    required.some((key) => !(key in body))
  )
    throw new ApiAccessError(400);
}
function requireMfa(identity: VerifiedIdentity) {
  if (!identity.mfaVerified) throw new ApiAccessError(403);
}
async function readJson(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  if (
    request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !==
    "application/json"
  )
    throw new ApiAccessError(415);
  const chunks: Buffer[] = [];
  let length = 0;
  const raw = await new Promise<Buffer>((resolve, reject) => {
    const timer = setTimeout(() => finish(new ApiAccessError(400)), 5000);
    const cleanup = () => {
      clearTimeout(timer);
      request.off("data", data);
      request.off("end", end);
      request.off("error", failed);
      request.off("aborted", failed);
      if (!request.complete) request.once("error", () => undefined);
    };
    const finish = (error?: Error) => {
      cleanup();
      if (error) {
        request.resume();
        reject(error);
      } else resolve(Buffer.concat(chunks));
    };
    const data = (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += buffer.length;
      if (length > 16384) finish(new ApiAccessError(413));
      else chunks.push(buffer);
    };
    const end = () => finish();
    const failed = () => finish(new ApiAccessError(400));
    request.on("data", data);
    request.once("end", end);
    request.once("error", failed);
    request.once("aborted", failed);
  });
  try {
    const body: unknown = JSON.parse(raw.toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new ApiAccessError(400);
    return body as Record<string, unknown>;
  } catch {
    throw new ApiAccessError(400);
  }
}
function json(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}
export function sendSafeApiError(response: ServerResponse, error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? error.code
      : undefined;
  const status =
    error instanceof ApiAccessError
      ? error.status
      : code === "TENANT_ACCESS_DENIED" || code === "42501"
        ? 403
        : code === "23505"
          ? 409
          : ["23503", "23514", "22P02"].includes(String(code))
            ? 400
            : 500;
  if (response.headersSent) {
    response.end();
    return;
  }
  if (status === 413 || status === 400)
    response.setHeader("Connection", "close");
  json(response, status, {
    status: "error",
    statusCode: status,
    message:
      status === 401
        ? "Unauthorized"
        : status === 403
          ? "Forbidden"
          : status === 404
            ? "Not found"
            : status === 409
              ? "Conflict"
              : status === 413
                ? "Request too large"
                : status === 415
                  ? "Unsupported media type"
                  : status === 400
                    ? "Invalid request"
                    : "Request failed",
  });
}
async function actorMemberships(
  client: PoolClient,
  orgId: string,
  userId: string,
): Promise<Membership[]> {
  const result = await client.query<Membership>(
    "SELECT role, branch_id FROM public.memberships WHERE organization_id = $1 AND user_id = $2",
    [orgId, userId],
  );
  if (result.rows.length === 0) throw new ApiAccessError(403);
  return result.rows;
}

/** Runs before Nest's body parser; all authorization comes from the verified session. */
export async function handleSecurityRoute(
  request: IncomingMessage,
  response: ServerResponse,
  options: ApiSecurityOptions,
): Promise<boolean> {
  const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  if (!path.startsWith("/api/")) return false;
  const origin = request.headers.origin;
  const unsafe = !["GET", "HEAD", "OPTIONS"].includes(request.method ?? "GET");
  if (
    (origin && !options.trustedOrigins.includes(origin)) ||
    (unsafe && !origin)
  )
    throw new ApiAccessError(403);
  if (origin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Vary", "Origin");
  }
  if (request.method === "OPTIONS") {
    if (!origin) throw new ApiAccessError(403);
    response.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PATCH, DELETE, OPTIONS",
    );
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.statusCode = 204;
    response.end();
    return true;
  }
  const contentLength = request.headers["content-length"];
  if (
    contentLength !== undefined &&
    (!/^\d+$/.test(contentLength) || Number(contentLength) > 16384)
  )
    throw new ApiAccessError(413);
  request.headers["x-unibos-client-ip"] =
    request.socket.remoteAddress ?? "unknown";
  if (path === "/api/auth" || path.startsWith("/api/auth/")) {
    await options.security.nodeHandler(request, response);
    return true;
  }
  const identity = await options.security.getIdentity(request.headers);
  if (!identity) throw new ApiAccessError(401);
  if (path === "/api/me" && request.method === "GET") {
    json(response, 200, {
      userId: identity.userId,
      mfaVerified: identity.mfaVerified,
    });
    return true;
  }
  if (path === "/api/organizations") {
    if (request.method === "GET") {
      const rows = await withUserTransaction(
        options.pool,
        identity.userId,
        async (client) =>
          (
            await client.query(
              "SELECT id, name, created_at FROM public.organizations ORDER BY created_at, id LIMIT 100",
            )
          ).rows,
      );
      json(response, 200, { organizations: rows });
      return true;
    }
    if (request.method === "POST") {
      requireMfa(identity);
      const body = await readJson(request);
      exactKeys(body, ["name"]);
      const name = validateName(body.name);
      const organization = await withUserTransaction(
        options.pool,
        identity.userId,
        (client) => createOrganization(client, name),
      );
      json(response, 201, { organization });
      return true;
    }
  }
  const match =
    /^\/api\/organizations\/([^/]+)\/(branches|memberships|audit)(?:\/([^/]+))?$/.exec(
      path,
    );
  if (!match) throw new ApiAccessError(404);
  const orgId = validateUuid(match[1] ?? "");
  const resource = match[2];
  const targetId = match[3] ? validateUuid(match[3]) : undefined;
  if (targetId && resource !== "memberships") throw new ApiAccessError(404);
  if (!(
    (!targetId && ["GET", "POST"].includes(request.method ?? "")) ||
    (targetId && ["PATCH", "DELETE"].includes(request.method ?? ""))
  ))
    throw new ApiAccessError(404);
  const body = ["POST", "PATCH"].includes(request.method ?? "")
    ? await readJson(request)
    : undefined;
  const result = await withTenantTransaction(
    options.pool,
    identity.userId,
    orgId,
    async (client) => {
      const memberships = await actorMemberships(
        client,
        orgId,
        identity.userId,
      );
      if (resource === "branches" && request.method === "GET")
        return {
          status: 200,
          payload: {
            branches: (
              await client.query(
                "SELECT id, organization_id, name, created_at FROM public.branches WHERE organization_id = $1 ORDER BY created_at, id LIMIT 100",
                [orgId],
              )
            ).rows,
          },
        };
      requireMfa(identity);
      if (!canManageOrganization(memberships)) throw new ApiAccessError(403);
      if (resource === "memberships" && targetId) {
        if (request.method === "DELETE") {
          const deleted = await client.query(
            "DELETE FROM public.memberships WHERE organization_id=$1 AND id=$2 RETURNING id",
            [orgId, targetId],
          );
          if (deleted.rowCount !== 1) throw new ApiAccessError(404);
          return { status: 200, payload: { revoked: true } };
        }
        if (request.method === "PATCH" && body) {
          exactKeys(body, ["role", "branchId"], ["role"]);
          const current = await client.query<{ user_id: string }>(
            "SELECT user_id FROM public.memberships WHERE organization_id=$1 AND id=$2",
            [orgId, targetId],
          );
          if (!current.rows[0]) throw new ApiAccessError(404);
          const grant = validateMembershipGrant(
            { ...body, userId: current.rows[0].user_id },
            memberships,
          );
          const changed = await client.query(
            "UPDATE public.memberships SET role=$3,branch_id=$4 WHERE organization_id=$1 AND id=$2 RETURNING id,organization_id,user_id,role,branch_id,created_at",
            [orgId, targetId, grant.role, grant.branchId],
          );
          if (changed.rowCount !== 1) throw new ApiAccessError(404);
          return { status: 200, payload: { membership: changed.rows[0] } };
        }
      }
      if (resource === "branches" && request.method === "POST" && body) {
        exactKeys(body, ["name"]);
        const branch = await client.query(
          "INSERT INTO public.branches (organization_id, name) VALUES ($1, $2) RETURNING id, organization_id, name, created_at",
          [orgId, validateName(body.name)],
        );
        return { status: 201, payload: { branch: branch.rows[0] } };
      }
      if (resource === "memberships" && request.method === "GET")
        return {
          status: 200,
          payload: {
            memberships: (
              await client.query(
                "SELECT id, organization_id, user_id, role, branch_id, created_at FROM public.memberships WHERE organization_id = $1 ORDER BY created_at, id LIMIT 100",
                [orgId],
              )
            ).rows,
          },
        };
      if (resource === "memberships" && request.method === "POST" && body) {
        const grant = validateMembershipGrant(body, memberships);
        const membership = await client.query(
          "INSERT INTO public.memberships (organization_id, user_id, role, branch_id) VALUES ($1, $2, $3, $4) RETURNING id, organization_id, user_id, role, branch_id, created_at",
          [orgId, grant.userId, grant.role, grant.branchId],
        );
        return { status: 201, payload: { membership: membership.rows[0] } };
      }
      if (resource === "audit" && request.method === "GET")
        return {
          status: 200,
          payload: {
            events: (
              await client.query(
                "SELECT id, organization_id, branch_id, actor_user_id, action, entity_id, created_at, target_user_id, old_role, new_role, old_branch_id, new_branch_id FROM public.audit_events WHERE organization_id = $1 ORDER BY created_at DESC, id DESC LIMIT 100",
                [orgId],
              )
            ).rows,
          },
        };
      throw new ApiAccessError(404);
    },
  );
  json(response, result.status, result.payload);
  return true;
}

/** The API connection must never inherit migration/auth privileges or own tables. */
export async function verifyRestrictedAppPool(pool: Pool): Promise<void> {
  const result = await pool.query<{ role_name: string; unsafe: boolean }>(`
    SELECT current_user AS role_name,
      (r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolinherit
      OR has_database_privilege(current_user, current_database(), 'CREATE')
      OR has_schema_privilege(current_user, 'public', 'CREATE')
      OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member = r.oid)
      OR EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE relowner = r.oid)
      OR EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE nspowner = r.oid)
      OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname LIKE 'auth_%'
            AND c.relkind IN ('r','p','v','m','f')
            AND (has_table_privilege(current_user,c.oid,'SELECT') OR has_table_privilege(current_user,c.oid,'INSERT')
              OR has_table_privilege(current_user,c.oid,'UPDATE') OR has_table_privilege(current_user,c.oid,'DELETE')
              OR has_any_column_privilege(current_user,c.oid,'SELECT') OR has_any_column_privilege(current_user,c.oid,'INSERT')
              OR has_any_column_privilege(current_user,c.oid,'UPDATE')))) AS unsafe
    FROM pg_catalog.pg_roles r WHERE r.rolname = current_user
  `);
  if (
    result.rows[0]?.role_name !== "unibos_app" ||
    result.rows[0].unsafe !== false
  )
    throw new Error("Restricted application database role required");
}
