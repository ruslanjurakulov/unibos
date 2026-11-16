import { createHash, randomBytes } from "node:crypto";
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

function canManageBranch(memberships: readonly Membership[], branchId: string) {
  return memberships.some(
    (membership) =>
      (membership.branch_id === null &&
        ["owner", "director"].includes(membership.role)) ||
      (membership.branch_id === branchId &&
        membership.role === "administrator"),
  );
}
function canAccessBranch(memberships: readonly Membership[], branchId: string) {
  return memberships.some(
    (membership) =>
      membership.branch_id === branchId ||
      (membership.branch_id === null &&
        ["owner", "director"].includes(membership.role)),
  );
}
function stringField(body: Record<string, unknown>, key: string, max: number) {
  const value = body[key];
  if (
    typeof value !== "string" ||
    value.trim().length < 1 ||
    value.trim().length > max ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new ApiAccessError(400);
  return value.trim();
}
function optionalStringField(
  body: Record<string, unknown>,
  key: string,
  max: number,
) {
  const value = body[key];
  if (value === null || value === undefined || value === "") return null;
  return stringField(body, key, max);
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
  const p4 =
    /^\/api\/organizations\/([^/]+)\/(?:catalog\/(categories|products)(?:\/([^/]+))?|branches\/([^/]+)\/(catalog|tables)(?:\/([^/]+))?(?:\/(price|availability|qr-tokens))?|table-qr-tokens\/([^/]+))$/.exec(
      path,
    );
  if (p4) {
    const orgId = validateUuid(p4[1] ?? "");
    const branchId = p4[4] ? validateUuid(p4[4]) : undefined;
    const group = p4[2] ?? p4[5] ?? "";
    const itemId = p4[3] ?? p4[6];
    const operation = p4[7];
    const tokenId = p4[8];
    const method = request.method ?? "GET";
    const branchRoute = Boolean(branchId);
    const valid = tokenId
      ? method === "PATCH"
      : branchRoute
        ? group === "catalog"
          ? (method === "GET" && !itemId && !operation) ||
            (method === "GET" && itemId && operation === "price") ||
            (method === "POST" && itemId && operation === "price") ||
            (method === "PATCH" && itemId && operation === "availability")
          : group === "tables" &&
            ((method === "GET" && !itemId) ||
              (method === "POST" && (!itemId || operation === "qr-tokens")) ||
              (method === "PATCH" && itemId && !operation))
        : (group === "categories" || group === "products") &&
          ((method === "GET" && !itemId) ||
            (method === "POST" && !itemId) ||
            (method === "PATCH" && itemId));
    if (!valid) throw new ApiAccessError(404);
    if (itemId) validateUuid(itemId);
    if (tokenId) validateUuid(tokenId);
    const body = ["POST", "PATCH"].includes(method)
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
        if (branchId && !canAccessBranch(memberships, branchId))
          throw new ApiAccessError(403);
        const orgManager = canManageOrganization(memberships);
        if (!branchRoute && group === "categories") {
          if (method === "GET")
            return {
              status: 200,
              payload: {
                categories: (
                  await client.query(
                    "SELECT id,name,description,sort_order,active,created_at,updated_at FROM public.product_categories WHERE organization_id=$1 ORDER BY sort_order,name,id LIMIT 500",
                    [orgId],
                  )
                ).rows,
              },
            };
          requireMfa(identity);
          if (!orgManager) throw new ApiAccessError(403);
          if (method === "POST" && body) {
            exactKeys(body, ["name", "description", "sortOrder"], ["name"]);
            const sort = body.sortOrder ?? 0;
            if (
              !Number.isInteger(sort) ||
              Number(sort) < 0 ||
              Number(sort) > 9999
            )
              throw new ApiAccessError(400);
            const row = await client.query(
              "INSERT INTO public.product_categories(organization_id,name,description,sort_order) VALUES($1,$2,$3,$4) RETURNING id,name,description,sort_order,active,created_at,updated_at",
              [
                orgId,
                stringField(body, "name", 80),
                optionalStringField(body, "description", 500),
                sort,
              ],
            );
            return { status: 201, payload: { category: row.rows[0] } };
          }
          if (method === "PATCH" && body && itemId) {
            exactKeys(body, ["name", "description", "sortOrder", "active"], []);
            if (!Object.keys(body).length) throw new ApiAccessError(400);
            const name =
              body.name === undefined ? null : stringField(body, "name", 80);
            const description =
              body.description === undefined
                ? null
                : optionalStringField(body, "description", 500);
            const sort = body.sortOrder;
            const active = body.active;
            if (
              sort !== undefined &&
              (!Number.isInteger(sort) ||
                Number(sort) < 0 ||
                Number(sort) > 9999)
            )
              throw new ApiAccessError(400);
            if (active !== undefined && typeof active !== "boolean")
              throw new ApiAccessError(400);
            const row = await client.query(
              "UPDATE public.product_categories SET name=COALESCE($3,name),description=CASE WHEN $4 THEN $5 ELSE description END,sort_order=COALESCE($6,sort_order),active=COALESCE($7,active),updated_at=now() WHERE organization_id=$1 AND id=$2 RETURNING id,name,description,sort_order,active,created_at,updated_at",
              [
                orgId,
                itemId,
                name,
                body.description !== undefined,
                description,
                sort ?? null,
                active ?? null,
              ],
            );
            if (!row.rows[0]) throw new ApiAccessError(404);
            return { status: 200, payload: { category: row.rows[0] } };
          }
        }
        if (!branchRoute && group === "products") {
          if (method === "GET")
            return {
              status: 200,
              payload: {
                products: (
                  await client.query(
                    "SELECT p.id,p.category_id,c.name category_name,p.name,p.description,p.image_key,p.sort_order,p.active FROM public.products p JOIN public.product_categories c ON c.organization_id=p.organization_id AND c.id=p.category_id WHERE p.organization_id=$1 ORDER BY c.sort_order,p.sort_order,p.name LIMIT 1000",
                    [orgId],
                  )
                ).rows,
              },
            };
          requireMfa(identity);
          if (!orgManager) throw new ApiAccessError(403);
          if (method === "POST" && body) {
            exactKeys(
              body,
              ["categoryId", "name", "description", "imageKey", "sortOrder"],
              ["categoryId", "name"],
            );
            const sort = body.sortOrder ?? 0;
            if (
              !Number.isInteger(sort) ||
              Number(sort) < 0 ||
              Number(sort) > 9999
            )
              throw new ApiAccessError(400);
            const image = optionalStringField(body, "imageKey", 240);
            if (
              image &&
              (!/^\/images\/products\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(
                image,
              ) ||
                /(^|\/)\.\.(\/|$)/.test(image))
            )
              throw new ApiAccessError(400);
            const row = await client.query(
              "INSERT INTO public.products(organization_id,category_id,name,description,image_key,sort_order) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,category_id,name,description,image_key,sort_order,active",
              [
                orgId,
                validateUuid(stringField(body, "categoryId", 36)),
                stringField(body, "name", 120),
                optionalStringField(body, "description", 1200),
                image,
                sort,
              ],
            );
            return { status: 201, payload: { product: row.rows[0] } };
          }
          if (method === "PATCH" && body && itemId) {
            exactKeys(
              body,
              [
                "categoryId",
                "name",
                "description",
                "imageKey",
                "sortOrder",
                "active",
              ],
              [],
            );
            if (!Object.keys(body).length) throw new ApiAccessError(400);
            const category =
              body.categoryId === undefined
                ? null
                : validateUuid(stringField(body, "categoryId", 36));
            const name =
              body.name === undefined ? null : stringField(body, "name", 120);
            const description =
              body.description === undefined
                ? null
                : optionalStringField(body, "description", 1200);
            const image =
              body.imageKey === undefined
                ? null
                : optionalStringField(body, "imageKey", 240);
            if (
              image &&
              (!/^\/images\/products\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(
                image,
              ) ||
                /(^|\/)\.\.(\/|$)/.test(image))
            )
              throw new ApiAccessError(400);
            const sort = body.sortOrder;
            const active = body.active;
            if (
              sort !== undefined &&
              (!Number.isInteger(sort) ||
                Number(sort) < 0 ||
                Number(sort) > 9999)
            )
              throw new ApiAccessError(400);
            if (active !== undefined && typeof active !== "boolean")
              throw new ApiAccessError(400);
            const row = await client.query(
              "UPDATE public.products SET category_id=COALESCE($3,category_id),name=COALESCE($4,name),description=CASE WHEN $5 THEN $6 ELSE description END,image_key=CASE WHEN $7 THEN $8 ELSE image_key END,sort_order=COALESCE($9,sort_order),active=COALESCE($10,active),updated_at=now() WHERE organization_id=$1 AND id=$2 RETURNING id,category_id,name,description,image_key,sort_order,active",
              [
                orgId,
                itemId,
                category,
                name,
                body.description !== undefined,
                description,
                body.imageKey !== undefined,
                image,
                sort ?? null,
                active ?? null,
              ],
            );
            if (!row.rows[0]) throw new ApiAccessError(404);
            return { status: 200, payload: { product: row.rows[0] } };
          }
        }
        if (
          branchRoute &&
          group === "catalog" &&
          method === "GET" &&
          !itemId &&
          !operation
        )
          return {
            status: 200,
            payload: {
              products: (
                await client.query(
                  "SELECT p.id,p.category_id,c.name category_name,p.name,p.description,COALESCE(a.available,true) available,v.price_minor,v.currency_code FROM public.products p JOIN public.product_categories c ON c.organization_id=p.organization_id AND c.id=p.category_id LEFT JOIN public.branch_product_availability a ON a.organization_id=p.organization_id AND a.branch_id=$2 AND a.product_id=p.id LEFT JOIN LATERAL(SELECT price_minor,currency_code FROM public.product_price_versions WHERE organization_id=p.organization_id AND branch_id=$2 AND product_id=p.id AND effective_at<=now() ORDER BY effective_at DESC,id DESC LIMIT 1)v ON true WHERE p.organization_id=$1 AND p.active AND c.active ORDER BY c.sort_order,p.sort_order,p.name LIMIT 1000",
                  [orgId, branchId],
                )
              ).rows,
            },
          };
        if (
          branchRoute &&
          group === "catalog" &&
          operation === "price" &&
          method === "GET" &&
          itemId
        ) {
          const rows = await client.query(
            "SELECT id,product_id,price_minor,currency_code,effective_at FROM public.product_price_versions WHERE organization_id=$1 AND branch_id=$2 AND product_id=$3 ORDER BY effective_at DESC,id DESC LIMIT 100",
            [orgId, branchId, itemId],
          );
          return { status: 200, payload: { priceHistory: rows.rows } };
        }
        if (
          branchRoute &&
          group === "catalog" &&
          operation === "price" &&
          body &&
          itemId
        ) {
          exactKeys(body, ["priceMinor", "currencyCode"]);
          requireMfa(identity);
          if (!orgManager) throw new ApiAccessError(403);
          if (
            !Number.isSafeInteger(body.priceMinor) ||
            Number(body.priceMinor) < 0 ||
            typeof body.currencyCode !== "string" ||
            !/^[A-Z]{3}$/.test(body.currencyCode)
          )
            throw new ApiAccessError(400);
          const row = await client.query(
            "INSERT INTO public.product_price_versions(organization_id,branch_id,product_id,price_minor,currency_code) VALUES($1,$2,$3,$4,$5) RETURNING id,product_id,price_minor,currency_code,effective_at",
            [orgId, branchId, itemId, body.priceMinor, body.currencyCode],
          );
          return { status: 201, payload: { price: row.rows[0] } };
        }
        if (
          branchRoute &&
          group === "catalog" &&
          operation === "availability" &&
          body &&
          itemId
        ) {
          exactKeys(body, ["available"]);
          requireMfa(identity);
          if (
            !canManageBranch(memberships, branchId!) ||
            typeof body.available !== "boolean"
          )
            throw new ApiAccessError(403);
          const row = await client.query(
            "INSERT INTO public.branch_product_availability(organization_id,branch_id,product_id,available) VALUES($1,$2,$3,$4) ON CONFLICT(organization_id,branch_id,product_id) DO UPDATE SET available=EXCLUDED.available,updated_at=now() RETURNING id,product_id,available,updated_at",
            [orgId, branchId, itemId, body.available],
          );
          return { status: 200, payload: { availability: row.rows[0] } };
        }
        if (branchRoute && group === "tables") {
          if (method === "GET")
            return {
              status: 200,
              payload: {
                tables: (
                  await client.query(
                    "SELECT t.id,t.branch_id,t.table_code,t.display_name,t.seats,t.status,t.active,t.created_at,t.updated_at,CASE WHEN q.id IS NULL THEN 'none' WHEN q.revoked_at IS NOT NULL THEN 'revoked' WHEN q.expires_at<=now() THEN 'expired' ELSE 'active' END AS qr_status,q.id AS qr_token_id,q.expires_at AS qr_expires_at FROM public.restaurant_tables t LEFT JOIN LATERAL (SELECT id,expires_at,revoked_at FROM public.table_qr_tokens WHERE organization_id=t.organization_id AND branch_id=t.branch_id AND table_id=t.id ORDER BY created_at DESC,id DESC LIMIT 1) q ON true WHERE t.organization_id=$1 AND t.branch_id=$2 ORDER BY t.table_code LIMIT 500",
                    [orgId, branchId],
                  )
                ).rows,
              },
            };
          requireMfa(identity);
          if (!canManageBranch(memberships, branchId!))
            throw new ApiAccessError(403);
          if (method === "POST" && body && !itemId) {
            exactKeys(body, ["tableCode", "displayName", "seats"]);
            const code = stringField(body, "tableCode", 20);
            const seats = body.seats;
            if (
              !/^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/.test(code) ||
              !Number.isInteger(seats) ||
              Number(seats) < 1 ||
              Number(seats) > 24
            )
              throw new ApiAccessError(400);
            const row = await client.query(
              "INSERT INTO public.restaurant_tables(organization_id,branch_id,table_code,display_name,seats) VALUES($1,$2,$3,$4,$5) RETURNING id,branch_id,table_code,display_name,seats,status,active",
              [
                orgId,
                branchId,
                code,
                stringField(body, "displayName", 80),
                seats,
              ],
            );
            return { status: 201, payload: { table: row.rows[0] } };
          }
          if (method === "PATCH" && body && itemId && !operation) {
            exactKeys(
              body,
              ["tableCode", "displayName", "seats", "status", "active"],
              [],
            );
            if (!Object.keys(body).length) throw new ApiAccessError(400);
            const code =
              body.tableCode === undefined
                ? null
                : stringField(body, "tableCode", 20);
            const name =
              body.displayName === undefined
                ? null
                : stringField(body, "displayName", 80);
            const seats = body.seats;
            const status = body.status;
            const active = body.active;
            if (
              (code !== null &&
                !/^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/.test(code)) ||
              (seats !== undefined &&
                (!Number.isInteger(seats) ||
                  Number(seats) < 1 ||
                  Number(seats) > 24)) ||
              (status !== undefined &&
                !["available", "reserved", "blocked", "cleaning"].includes(
                  String(status),
                )) ||
              (active !== undefined && typeof active !== "boolean")
            )
              throw new ApiAccessError(400);
            const row = await client.query(
              "UPDATE public.restaurant_tables SET table_code=COALESCE($4,table_code),display_name=COALESCE($5,display_name),seats=COALESCE($6,seats),status=COALESCE($7,status),active=COALESCE($8,active),updated_at=now() WHERE organization_id=$1 AND branch_id=$2 AND id=$3 RETURNING id,branch_id,table_code,display_name,seats,status,active",
              [
                orgId,
                branchId,
                itemId,
                code,
                name,
                seats ?? null,
                status ?? null,
                active ?? null,
              ],
            );
            if (!row.rows[0]) throw new ApiAccessError(404);
            return { status: 200, payload: { table: row.rows[0] } };
          }
          if (
            method === "POST" &&
            body &&
            itemId &&
            operation === "qr-tokens"
          ) {
            exactKeys(body, []);
            const table = await client.query(
              "SELECT id FROM public.restaurant_tables WHERE organization_id=$1 AND branch_id=$2 AND id=$3 AND active FOR UPDATE",
              [orgId, branchId, itemId],
            );
            if (!table.rows[0]) throw new ApiAccessError(404);
            await client.query(
              "UPDATE public.table_qr_tokens SET revoked_at=now() WHERE organization_id=$1 AND branch_id=$2 AND table_id=$3 AND revoked_at IS NULL AND expires_at>now()",
              [orgId, branchId, itemId],
            );
            const secret = randomBytes(32).toString("base64url");
            const hash = createHash("sha256").update(secret).digest();
            const expires = new Date(Date.now() + 30 * 86400000).toISOString();
            const row = await client.query(
              "INSERT INTO public.table_qr_tokens(organization_id,branch_id,table_id,token_hash,expires_at) VALUES($1,$2,$3,$4,$5) RETURNING id,table_id,created_at,expires_at",
              [orgId, branchId, itemId, hash, expires],
            );
            return { status: 201, payload: { token: row.rows[0], secret } };
          }
        }
        if (tokenId && method === "PATCH" && body) {
          exactKeys(body, []);
          requireMfa(identity);
          const row = await client.query(
            "UPDATE public.table_qr_tokens SET revoked_at=now() WHERE organization_id=$1 AND id=$2 AND revoked_at IS NULL RETURNING id,table_id,revoked_at",
            [orgId, tokenId],
          );
          if (!row.rows[0]) throw new ApiAccessError(404);
          return { status: 200, payload: { revoked: row.rows[0] } };
        }
        throw new ApiAccessError(404);
      },
    );
    json(response, result.status, result.payload);
    return true;
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
