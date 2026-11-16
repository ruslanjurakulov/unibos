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
  constructor(
    readonly status: number,
    readonly reason?: string,
  ) {
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

const workspaceCapabilities: Record<Role, readonly string[]> = {
  owner: [
    "workspace.view",
    "organizations.manage",
    "branches.manage",
    "catalog.read",
    "catalog.manage",
    "tables.read",
    "tables.manage",
    "orders.read",
    "orders.create",
    "waiter.operate",
    "kitchen.operate",
    "shifts.open",
    "shifts.close",
  ],
  director: [
    "workspace.view",
    "organizations.manage",
    "branches.manage",
    "catalog.read",
    "catalog.manage",
    "tables.read",
    "tables.manage",
    "orders.read",
    "orders.create",
    "waiter.operate",
    "kitchen.operate",
    "shifts.open",
    "shifts.close",
  ],
  administrator: [
    "workspace.view",
    "catalog.read",
    "catalog.branch.manage",
    "tables.read",
    "tables.manage",
    "orders.read",
    "orders.create",
    "waiter.operate",
    "kitchen.operate",
    "shifts.open",
    "shifts.close",
  ],
  accountant: ["workspace.view", "orders.read", "shifts.read"],
  cashier: [
    "workspace.view",
    "catalog.read",
    "tables.read",
    "orders.read",
    "orders.create",
    "waiter.operate",
    "shifts.open",
    "shifts.close",
  ],
  waiter: ["workspace.view", "catalog.read", "tables.read", "waiter.operate"],
  kitchen: ["workspace.view", "kitchen.operate"],
};

export function capabilitiesForMemberships(memberships: readonly Membership[]) {
  return [
    ...new Set(
      memberships.flatMap(
        (membership) => workspaceCapabilities[membership.role] ?? [],
      ),
    ),
  ].sort();
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
    ...(error instanceof ApiAccessError && error.reason
      ? { reason: error.reason }
      : {}),
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
function canReadCashShifts(
  memberships: readonly Membership[],
  branchId: string,
) {
  return (
    memberships.some(
      (membership) =>
        membership.branch_id === branchId &&
        ["administrator", "accountant", "cashier"].includes(membership.role),
    ) ||
    memberships.some(
      (membership) =>
        membership.branch_id === null &&
        ["owner", "director"].includes(membership.role),
    )
  );
}
function canOperateCashShifts(
  memberships: readonly Membership[],
  branchId: string,
) {
  return (
    memberships.some(
      (membership) =>
        membership.branch_id === branchId &&
        ["administrator", "cashier"].includes(membership.role),
    ) ||
    memberships.some(
      (membership) =>
        membership.branch_id === null &&
        ["owner", "director"].includes(membership.role),
    )
  );
}
function shiftRequestHash(payload: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(payload)).digest();
}
function minorAmount(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^(?:0|[1-9]\d{0,12})$/.test(value) ||
    BigInt(value) > 1_000_000_000_000n
  )
    throw new ApiAccessError(400);
  return value;
}
function shiftVersion(value: unknown) {
  if (!Number.isSafeInteger(value) || typeof value !== "number" || value < 1)
    throw new ApiAccessError(400);
  return value;
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

type OrderRequestItem = {
  productId: string;
  quantity: string;
  priceVersion: string;
  notes: string | null;
};

function parseOrderRequest(body: Record<string, unknown>) {
  exactKeys(
    body,
    ["idempotencyKey", "fulfillmentType", "tableId", "items", "note"],
    ["idempotencyKey", "fulfillmentType", "items"],
  );
  const idempotencyKey = validateUuid(stringField(body, "idempotencyKey", 36));
  const fulfillmentType = body.fulfillmentType;
  if (fulfillmentType !== "DINE_IN" && fulfillmentType !== "PICKUP")
    throw new ApiAccessError(400);
  const tableId =
    body.tableId === undefined || body.tableId === null
      ? null
      : validateUuid(stringField(body, "tableId", 36));
  if ((fulfillmentType === "DINE_IN") !== Boolean(tableId))
    throw new ApiAccessError(400);
  if (
    !Array.isArray(body.items) ||
    body.items.length < 1 ||
    body.items.length > 100
  )
    throw new ApiAccessError(400);
  const items: OrderRequestItem[] = body.items.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new ApiAccessError(400);
    const item = raw as Record<string, unknown>;
    exactKeys(
      item,
      ["productId", "quantity", "priceVersion", "notes"],
      ["productId", "quantity", "priceVersion"],
    );
    const quantity = stringField(item, "quantity", 12);
    if (
      !/^(?:0|[1-9]\d{0,3})(?:\.\d{1,3})?$/.test(quantity) ||
      /^0(?:\.0{1,3})?$/.test(quantity)
    )
      throw new ApiAccessError(400);
    return {
      productId: validateUuid(stringField(item, "productId", 36)),
      quantity,
      priceVersion: validateUuid(stringField(item, "priceVersion", 36)),
      notes: optionalStringField(item, "notes", 300),
    };
  });
  if (new Set(items.map((item) => item.productId)).size !== items.length)
    throw new ApiAccessError(400);
  const note = optionalStringField(body, "note", 500);
  return { idempotencyKey, fulfillmentType, tableId, items, note } as const;
}

function parseOrderAddition(body: Record<string, unknown>) {
  exactKeys(body, ["idempotencyKey", "items"], ["idempotencyKey", "items"]);
  const idempotencyKey = validateUuid(stringField(body, "idempotencyKey", 36));
  if (
    !Array.isArray(body.items) ||
    body.items.length < 1 ||
    body.items.length > 100
  )
    throw new ApiAccessError(400);
  const items = body.items.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new ApiAccessError(400);
    const item = raw as Record<string, unknown>;
    exactKeys(
      item,
      ["productId", "quantity", "priceVersion", "notes"],
      ["productId", "quantity", "priceVersion"],
    );
    const quantity = stringField(item, "quantity", 12);
    if (
      !/^(?:0|[1-9]\d{0,3})(?:\.\d{1,3})?$/.test(quantity) ||
      /^0(?:\.0{1,3})?$/.test(quantity)
    )
      throw new ApiAccessError(400);
    return {
      productId: validateUuid(stringField(item, "productId", 36)),
      quantity,
      priceVersion: validateUuid(stringField(item, "priceVersion", 36)),
      notes: optionalStringField(item, "notes", 300),
    };
  });
  if (new Set(items.map((i) => i.productId)).size !== items.length)
    throw new ApiAccessError(400);
  return { idempotencyKey, items };
}

function quantityMilli(quantity: string): bigint {
  const [whole = "0", fraction = ""] = quantity.split(".");
  return BigInt(whole) * 1000n + BigInt((fraction + "000").slice(0, 3));
}

async function readOrder(
  client: PoolClient,
  orgId: string,
  branchId: string,
  orderId: string,
) {
  const order = await client.query(
    "SELECT id,organization_id,branch_id,table_id,source,fulfillment_type,created_by,status,currency_code,subtotal_minor,total_minor,order_note,version,created_at FROM public.orders WHERE organization_id=$1 AND branch_id=$2 AND id=$3",
    [orgId, branchId, orderId],
  );
  if (!order.rows[0]) throw new ApiAccessError(404);
  const items = await client.query(
    "SELECT id,product_id,product_name_snapshot,unit_price_minor,currency_code,quantity::text,line_total_minor,product_price_version,notes FROM public.order_items WHERE organization_id=$1 AND branch_id=$2 AND order_id=$3 ORDER BY created_at,id",
    [orgId, branchId, orderId],
  );
  return { order: order.rows[0], items: items.rows };
}

async function createKitchenTicket(
  client: PoolClient,
  orgId: string,
  branchId: string,
  orderId: string,
  actorId: string,
  itemIds: readonly string[],
) {
  const next = await client.query<{ ticket_number: number }>(
    "SELECT COALESCE(MAX(ticket_number),0)+1 ticket_number FROM public.kitchen_tickets WHERE organization_id=$1 AND branch_id=$2 AND order_id=$3",
    [orgId, branchId, orderId],
  );
  const ticket = await client.query<{ id: string }>(
    "INSERT INTO public.kitchen_tickets(organization_id,branch_id,order_id,ticket_number,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id",
    [orgId, branchId, orderId, next.rows[0]!.ticket_number, actorId],
  );
  const ticketId = ticket.rows[0]!.id;
  for (const itemId of itemIds)
    await client.query(
      "INSERT INTO public.kitchen_ticket_items(organization_id,branch_id,ticket_id,order_id,order_item_id) VALUES($1,$2,$3,$4,$5)",
      [orgId, branchId, ticketId, orderId, itemId],
    );
  return ticketId;
}

async function createCashierOrder(
  client: PoolClient,
  identity: VerifiedIdentity,
  orgId: string,
  branchId: string,
  body: ReturnType<typeof parseOrderRequest>,
) {
  const memberships = await actorMemberships(client, orgId, identity.userId);
  if (!canAccessBranch(memberships, branchId)) throw new ApiAccessError(403);
  const allowed = memberships.some(
    (membership) =>
      (membership.branch_id === branchId &&
        ["cashier", "administrator"].includes(membership.role)) ||
      (membership.branch_id === null &&
        ["owner", "director"].includes(membership.role)),
  );
  if (!allowed) throw new ApiAccessError(403);
  const normalized = {
    fulfillmentType: body.fulfillmentType,
    tableId: body.tableId,
    note: body.note,
    items: [...body.items].sort((a, b) =>
      a.productId.localeCompare(b.productId),
    ),
  };
  const requestHash = createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest();
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    `${orgId}:${branchId}:${identity.userId}:CREATE_ORDER:${body.idempotencyKey}`,
  ]);
  const idempotency = await client.query<{
    request_hash: Buffer;
    order_id: string;
    result_ticket_id: string;
  }>(
    "SELECT request_hash,order_id,result_ticket_id FROM public.order_idempotency_keys WHERE organization_id=$1 AND branch_id=$2 AND actor_user_id=$3 AND operation='CREATE_ORDER' AND idempotency_key=$4",
    [orgId, branchId, identity.userId, body.idempotencyKey],
  );
  const existing = idempotency.rows[0];
  if (existing && !existing.request_hash.equals(requestHash))
    throw new ApiAccessError(409, "IDEMPOTENCY_KEY_REUSED");
  if (existing)
    return {
      ...(await readOrder(client, orgId, branchId, existing.order_id)),
      ticketId: existing.result_ticket_id,
      duplicate: true,
    };
  if (body.tableId) {
    const table = await client.query<{ available: boolean }>(
      "SELECT private.lock_cashier_table($1,$2,$3) AS available",
      [orgId, branchId, body.tableId],
    );
    if (!table.rows[0]?.available)
      throw new ApiAccessError(409, "TABLE_UNAVAILABLE");
  }

  let currency: string | undefined;
  let subtotal = 0n;
  const resolved: Array<
    OrderRequestItem & {
      name: string;
      unitPrice: bigint;
      currency: string;
      lineTotal: bigint;
    }
  > = [];
  for (const item of body.items) {
    const locked = await client.query<{ available: boolean }>(
      "SELECT private.lock_cashier_product($1,$2,$3) AS available",
      [orgId, branchId, item.productId],
    );
    if (!locked.rows[0]?.available)
      throw new ApiAccessError(409, "PRODUCT_UNAVAILABLE");
    const product = await client.query<{
      name: string;
      price_minor: string | null;
      currency_code: string | null;
      price_version: string | null;
      available: boolean;
    }>(
      "SELECT p.name,v.price_minor::text,v.currency_code,v.id price_version,COALESCE(a.available,true) available FROM public.products p JOIN public.product_categories c ON c.organization_id=p.organization_id AND c.id=p.category_id LEFT JOIN public.branch_product_availability a ON a.organization_id=p.organization_id AND a.branch_id=$2 AND a.product_id=p.id LEFT JOIN LATERAL(SELECT id,price_minor,currency_code FROM public.product_price_versions WHERE organization_id=p.organization_id AND branch_id=$2 AND product_id=p.id AND effective_at<=clock_timestamp() ORDER BY effective_at DESC,id DESC LIMIT 1)v ON true WHERE p.organization_id=$1 AND p.id=$3 AND p.active AND c.active",
      [orgId, branchId, item.productId],
    );
    const row = product.rows[0];
    if (
      !row ||
      !row.available ||
      row.price_minor === null ||
      !row.price_version
    )
      throw new ApiAccessError(409, "PRODUCT_UNAVAILABLE");
    if (row.price_version !== item.priceVersion)
      throw new ApiAccessError(409, "STALE_PRICE");
    if (currency && currency !== row.currency_code)
      throw new ApiAccessError(409, "CURRENCY_MISMATCH");
    currency = row.currency_code ?? undefined;
    const unitPrice = BigInt(row.price_minor ?? "0");
    const lineTotal = (unitPrice * quantityMilli(item.quantity) + 500n) / 1000n;
    subtotal += lineTotal;
    if (subtotal > 9000000000000000n) throw new ApiAccessError(400);
    resolved.push({
      ...item,
      name: row.name,
      unitPrice,
      currency: row.currency_code ?? "",
      lineTotal,
    });
  }
  if (!currency) throw new ApiAccessError(409, "CURRENCY_MISMATCH");
  const order = await client.query<{ id: string }>(
    "INSERT INTO public.orders(organization_id,branch_id,table_id,source,fulfillment_type,created_by,status,currency_code,subtotal_minor,total_minor,order_note) VALUES($1,$2,$3,'CASHIER_POS',$4,$5,'SUBMITTED',$6,$7,$7,$8) RETURNING id",
    [
      orgId,
      branchId,
      body.tableId,
      body.fulfillmentType,
      identity.userId,
      currency,
      subtotal.toString(),
      body.note,
    ],
  );
  const orderId = order.rows[0]!.id;
  const itemIds: string[] = [];
  for (const item of resolved) {
    const inserted = await client.query<{ id: string }>(
      "INSERT INTO public.order_items(organization_id,branch_id,order_id,product_id,product_name_snapshot,unit_price_minor,currency_code,quantity,line_total_minor,product_price_version,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8::numeric,$9,$10,$11) RETURNING id",
      [
        orgId,
        branchId,
        orderId,
        item.productId,
        item.name,
        item.unitPrice.toString(),
        item.currency,
        item.quantity,
        item.lineTotal.toString(),
        item.priceVersion,
        item.notes,
      ],
    );
    itemIds.push(inserted.rows[0]!.id);
  }
  const ticketId = await createKitchenTicket(
    client,
    orgId,
    branchId,
    orderId,
    identity.userId,
    itemIds,
  );
  await client.query(
    "INSERT INTO public.order_events(organization_id,branch_id,order_id,event_type,actor_user_id,event_data) VALUES($1,$2,$3,'ORDER_SUBMITTED',$4,$5::jsonb)",
    [
      orgId,
      branchId,
      orderId,
      identity.userId,
      JSON.stringify({ source: "CASHIER_POS", itemCount: resolved.length }),
    ],
  );
  await client.query(
    "INSERT INTO public.order_idempotency_keys(organization_id,branch_id,actor_user_id,operation,idempotency_key,request_hash,order_id,result_ticket_id) VALUES($1,$2,$3,'CREATE_ORDER',$4,$5,$6,$7)",
    [
      orgId,
      branchId,
      identity.userId,
      body.idempotencyKey,
      requestHash,
      orderId,
      ticketId,
    ],
  );
  return {
    ...(await readOrder(client, orgId, branchId, orderId)),
    ticketId,
    duplicate: false,
  };
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
  if (
    path === "/api/v1/me/workspace-capabilities" &&
    request.method === "GET"
  ) {
    const membershipRows = await withUserTransaction(
      options.pool,
      identity.userId,
      async (client) =>
        (
          await client.query<{
            organization_id: string;
            organization_name: string;
            role: Role;
            branch_id: string | null;
          }>(
            `SELECT o.id AS organization_id, o.name AS organization_name,
                m.role, m.branch_id
           FROM public.memberships m
           JOIN public.organizations o ON o.id = m.organization_id
          WHERE m.user_id = $1
          ORDER BY o.name, m.branch_id NULLS FIRST, m.role
          LIMIT 1000`,
            [identity.userId],
          )
        ).rows,
    );
    const grouped = new Map<
      string,
      {
        id: string;
        name: string;
        roles: Role[];
        branches: Array<{ id: string; name: string; roles: Role[] }>;
      }
    >();
    for (const row of membershipRows) {
      let organization = grouped.get(row.organization_id);
      if (!organization) {
        organization = {
          id: row.organization_id,
          name: row.organization_name,
          roles: [],
          branches: [],
        };
        grouped.set(row.organization_id, organization);
      }
      if (row.branch_id === null) organization.roles.push(row.role);
      else {
        const branch = organization.branches.find(
          (item) => item.id === row.branch_id,
        );
        if (branch) branch.roles.push(row.role);
        else
          organization.branches.push({
            id: row.branch_id,
            name: "",
            roles: [row.role],
          });
      }
    }
    const organizations = await Promise.all(
      [...grouped.values()].map(async (organization) => {
        const branches = await withTenantTransaction(
          options.pool,
          identity.userId,
          organization.id,
          async (client) =>
            (
              await client.query<{ id: string; name: string }>(
                "SELECT id, name FROM public.branches ORDER BY name, id LIMIT 500",
              )
            ).rows,
        );
        const branchRoles = new Map(
          organization.branches.map((branch) => [branch.id, branch.roles]),
        );
        const orgCapabilities = capabilitiesForMemberships(
          organization.roles.map((role) => ({ role, branch_id: null })),
        );
        return {
          id: organization.id,
          name: organization.name,
          roles: [...new Set(organization.roles)].sort(),
          capabilities: orgCapabilities,
          branches: branches.map((branch) => {
            const roles = [
              ...new Set(branchRoles.get(branch.id) ?? []),
            ].sort() as Role[];
            const effectiveRoles = [
              ...new Set([...organization.roles, ...roles]),
            ].sort();
            const memberships = [
              ...organization.roles.map((role) => ({ role, branch_id: null })),
              ...roles.map((role) => ({ role, branch_id: branch.id })),
            ];
            const capabilities = capabilitiesForMemberships(memberships);
            return {
              id: branch.id,
              name: branch.name,
              roles,
              effectiveRoles,
              capabilities,
              navigation: [
                ...(capabilities.includes("workspace.view")
                  ? [
                      {
                        href: `/dashboard?organizationId=${encodeURIComponent(organization.id)}&branchId=${encodeURIComponent(branch.id)}`,
                        id: "workspace",
                      },
                    ]
                  : []),
                ...(capabilities.includes("orders.create")
                  ? [
                      {
                        href: `/dashboard/pos?organizationId=${encodeURIComponent(organization.id)}&branchId=${encodeURIComponent(branch.id)}`,
                        id: "pos",
                      },
                    ]
                  : []),
                ...(capabilities.includes("waiter.operate")
                  ? [
                      {
                        href: `/dashboard/waiter?organizationId=${encodeURIComponent(organization.id)}&branchId=${encodeURIComponent(branch.id)}`,
                        id: "waiter",
                      },
                    ]
                  : []),
                ...(capabilities.includes("kitchen.operate")
                  ? [
                      {
                        href: `/dashboard/kitchen?organizationId=${encodeURIComponent(organization.id)}&branchId=${encodeURIComponent(branch.id)}`,
                        id: "kitchen",
                      },
                    ]
                  : []),
                ...(capabilities.includes("shifts.read") ||
                capabilities.includes("shifts.open")
                  ? [
                      {
                        href: `/dashboard/shifts?organizationId=${encodeURIComponent(organization.id)}&branchId=${encodeURIComponent(branch.id)}`,
                        id: "shifts",
                      },
                    ]
                  : []),
              ],
            };
          }),
        };
      }),
    );
    response.setHeader("Cache-Control", "no-store, private");
    json(response, 200, {
      version: 1,
      generatedAt: new Date().toISOString(),
      userId: identity.userId,
      organizations,
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
  const shiftRoute =
    /^\/api\/v1\/organizations\/([^/]+)\/branches\/([^/]+)\/cash-shifts(?:\/([^/]+))?(?:\/(movements|begin-close|confirm-close))?$/.exec(
      path,
    );
  if (shiftRoute) {
    const orgId = validateUuid(shiftRoute[1] ?? "");
    const branchId = validateUuid(shiftRoute[2] ?? "");
    const shiftId = shiftRoute[3] ? validateUuid(shiftRoute[3]) : null;
    const action = shiftRoute[4] ?? null;
    const method = request.method ?? "GET";
    const isRead = method === "GET" && !shiftId && !action;
    const isOpen = method === "POST" && !shiftId && !action;
    const isMovement =
      method === "POST" && Boolean(shiftId) && action === "movements";
    const isBeginClose =
      method === "POST" && Boolean(shiftId) && action === "begin-close";
    const isConfirmClose =
      method === "POST" && Boolean(shiftId) && action === "confirm-close";
    if (!(isRead || isOpen || isMovement || isBeginClose || isConfirmClose))
      throw new ApiAccessError(404);
    const body = method === "POST" ? await readJson(request) : undefined;
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
        if (!canAccessBranch(memberships, branchId))
          throw new ApiAccessError(403);
        if (isRead) {
          if (!canReadCashShifts(memberships, branchId))
            throw new ApiAccessError(403);
          const privileged =
            canManageOrganization(memberships) ||
            memberships.some(
              (m) =>
                m.branch_id === branchId &&
                ["administrator", "accountant"].includes(m.role),
            );
          const ownFilter = privileged ? "" : " AND s.cashier_user_id=$3";
          const params = privileged
            ? [orgId, branchId]
            : [orgId, branchId, identity.userId];
          const active = await client.query(
            "SELECT s.*,(s.opening_amount_minor+COALESCE(sum(CASE m.movement_type WHEN 'CASH_IN' THEN m.amount_minor ELSE -m.amount_minor END),0))::text AS expected_current_minor " +
              "FROM public.cash_shifts s LEFT JOIN public.cash_drawer_movements m ON m.organization_id=s.organization_id AND m.branch_id=s.branch_id AND m.shift_id=s.id " +
              "WHERE s.organization_id=$1 AND s.branch_id=$2 AND s.status IN ('OPEN','CLOSING')" +
              ownFilter +
              " GROUP BY s.id ORDER BY s.opened_at DESC LIMIT 1",
            params,
          );
          const history = await client.query(
            "SELECT s.*,(s.opening_amount_minor+COALESCE(sum(CASE m.movement_type WHEN 'CASH_IN' THEN m.amount_minor ELSE -m.amount_minor END),0))::text AS expected_current_minor " +
              "FROM public.cash_shifts s LEFT JOIN public.cash_drawer_movements m ON m.organization_id=s.organization_id AND m.branch_id=s.branch_id AND m.shift_id=s.id " +
              "WHERE s.organization_id=$1 AND s.branch_id=$2 AND s.status='CLOSED'" +
              ownFilter +
              " GROUP BY s.id ORDER BY s.closed_at DESC,s.id DESC LIMIT 50",
            params,
          );
          const movements = active.rows[0]
            ? (
                await client.query(
                  "SELECT id,movement_type,amount_minor::text,reason,created_by,created_at FROM public.cash_drawer_movements WHERE organization_id=$1 AND branch_id=$2 AND shift_id=$3 ORDER BY created_at,id",
                  [orgId, branchId, active.rows[0].id],
                )
              ).rows
            : [];
          return {
            status: 200,
            payload: {
              activeShift: active.rows[0] ?? null,
              movements,
              history: history.rows,
            },
          };
        }
        if (!canOperateCashShifts(memberships, branchId))
          throw new ApiAccessError(403);
        requireMfa(identity);
        const operation = isOpen
          ? "OPEN_SHIFT"
          : isMovement
            ? "ADD_MOVEMENT"
            : isBeginClose
              ? "BEGIN_CLOSE"
              : "CONFIRM_CLOSE";
        const idempotencyKey = validateUuid(
          stringField(body!, "idempotencyKey", 36),
        );
        const expectedVersion = isOpen
          ? null
          : shiftVersion(body!.expectedVersion);
        let payload: Record<string, unknown>;
        let currencyCode: string | null = null;
        let openingAmount: string | null = null;
        let movementType: string | null = null;
        let movementAmount: string | null = null;
        let movementReason: string | null = null;
        let countedAmount: string | null = null;
        if (isOpen) {
          exactKeys(body!, [
            "idempotencyKey",
            "currencyCode",
            "openingAmountMinor",
          ]);
          currencyCode = stringField(body!, "currencyCode", 3);
          if (!["UZS", "USD", "EUR", "RUB"].includes(currencyCode))
            throw new ApiAccessError(400);
          openingAmount = minorAmount(body!.openingAmountMinor);
          payload = { operation, currencyCode, openingAmount };
        } else if (isMovement) {
          exactKeys(body!, [
            "idempotencyKey",
            "expectedVersion",
            "movementType",
            "amountMinor",
            "reason",
          ]);
          movementType = stringField(body!, "movementType", 12);
          if (!["CASH_IN", "CASH_OUT"].includes(movementType))
            throw new ApiAccessError(400);
          movementAmount = minorAmount(body!.amountMinor);
          if (movementAmount === "0") throw new ApiAccessError(400);
          movementReason = stringField(body!, "reason", 300);
          payload = {
            operation,
            shiftId,
            expectedVersion,
            movementType,
            movementAmount,
            movementReason,
          };
        } else if (isBeginClose) {
          exactKeys(body!, [
            "idempotencyKey",
            "expectedVersion",
            "countedCashMinor",
          ]);
          countedAmount = minorAmount(body!.countedCashMinor);
          payload = { operation, shiftId, expectedVersion, countedAmount };
        } else {
          exactKeys(body!, ["idempotencyKey", "expectedVersion"]);
          payload = { operation, shiftId, expectedVersion };
        }
        const requestHash = shiftRequestHash(payload);
        const lockKey = [
          orgId,
          branchId,
          identity.userId,
          operation,
          idempotencyKey,
        ].join(":");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          lockKey,
        ]);
        const prior = await client.query(
          "SELECT request_hash,shift_id,movement_id FROM public.cash_shift_idempotency_keys WHERE organization_id=$1 AND branch_id=$2 AND actor_user_id=$3 AND operation=$4 AND idempotency_key=$5",
          [orgId, branchId, identity.userId, operation, idempotencyKey],
        );
        if (prior.rows[0]) {
          if (!Buffer.from(prior.rows[0].request_hash).equals(requestHash))
            throw new ApiAccessError(409);
          const priorShift = await client.query(
            "SELECT * FROM public.cash_shifts WHERE organization_id=$1 AND branch_id=$2 AND id=$3",
            [orgId, branchId, prior.rows[0].shift_id],
          );
          const priorMovement = prior.rows[0].movement_id
            ? (
                await client.query(
                  "SELECT * FROM public.cash_drawer_movements WHERE organization_id=$1 AND branch_id=$2 AND shift_id=$3 AND id=$4",
                  [
                    orgId,
                    branchId,
                    prior.rows[0].shift_id,
                    prior.rows[0].movement_id,
                  ],
                )
              ).rows[0]
            : null;
          return {
            status: 200,
            payload: {
              shift: priorShift.rows[0],
              movement: priorMovement,
              duplicate: true,
            },
          };
        }
        let shift: Record<string, unknown>;
        let movement: Record<string, unknown> | null = null;
        let eventType: string;
        let eventData: Record<string, unknown>;
        if (isOpen) {
          const inserted = await client.query(
            "INSERT INTO public.cash_shifts(organization_id,branch_id,cashier_user_id,currency_code,opening_amount_minor,created_by) VALUES($1,$2,$3,$4,$5,$3) RETURNING *",
            [orgId, branchId, identity.userId, currencyCode, openingAmount],
          );
          shift = inserted.rows[0];
          eventType = "OPENED";
          eventData = { currencyCode, openingAmountMinor: openingAmount };
        } else {
          const lockedShift = await client.query(
            "SELECT * FROM public.cash_shifts WHERE organization_id=$1 AND branch_id=$2 AND id=$3 FOR UPDATE",
            [orgId, branchId, shiftId],
          );
          const current = lockedShift.rows[0];
          if (!current || current.version !== expectedVersion)
            throw new ApiAccessError(409);
          if (isMovement) {
            if (current.status !== "OPEN") throw new ApiAccessError(409);
            const drawer = await client.query(
              "SELECT ($4::bigint+COALESCE(sum(CASE movement_type WHEN 'CASH_IN' THEN amount_minor ELSE -amount_minor END),0))::text AS expected_minor FROM public.cash_drawer_movements WHERE organization_id=$1 AND branch_id=$2 AND shift_id=$3",
              [orgId, branchId, shiftId, current.opening_amount_minor],
            );
            const change =
              BigInt(movementAmount!) * (movementType === "CASH_IN" ? 1n : -1n);
            const nextExpected = BigInt(drawer.rows[0].expected_minor) + change;
            if (nextExpected < 0n || nextExpected > 1_000_000_000_000n)
              throw new ApiAccessError(409, "CASH_DRAWER_LIMIT");
            const insertedMovement = await client.query(
              "INSERT INTO public.cash_drawer_movements(organization_id,branch_id,shift_id,movement_type,amount_minor,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
              [
                orgId,
                branchId,
                shiftId,
                movementType,
                movementAmount,
                movementReason,
                identity.userId,
              ],
            );
            movement = insertedMovement.rows[0];
            const updated = await client.query(
              "UPDATE public.cash_shifts SET version=version+1 WHERE organization_id=$1 AND branch_id=$2 AND id=$3 RETURNING *",
              [orgId, branchId, shiftId],
            );
            shift = updated.rows[0];
            eventType = "MOVEMENT_RECORDED";
            eventData = {
              movementId: movement!.id,
              movementType,
              amountMinor: movementAmount,
            };
          } else if (isBeginClose) {
            if (current.status !== "OPEN") throw new ApiAccessError(409);
            const expected = await client.query(
              "SELECT ($4::bigint+COALESCE(sum(CASE movement_type WHEN 'CASH_IN' THEN amount_minor ELSE -amount_minor END),0))::text AS expected_minor FROM public.cash_drawer_movements WHERE organization_id=$1 AND branch_id=$2 AND shift_id=$3",
              [orgId, branchId, shiftId, current.opening_amount_minor],
            );
            const expectedMinor = expected.rows[0].expected_minor;
            if (
              BigInt(expectedMinor) < 0n ||
              BigInt(expectedMinor) > 1000000000000n
            )
              throw new ApiAccessError(409);
            const updated = await client.query(
              "UPDATE public.cash_shifts SET status='CLOSING',closing_expected_minor=$4,counted_cash_minor=$5,closing_started_at=now(),version=version+1 WHERE organization_id=$1 AND branch_id=$2 AND id=$3 RETURNING *",
              [orgId, branchId, shiftId, expectedMinor, countedAmount],
            );
            shift = updated.rows[0];
            eventType = "CLOSING_STARTED";
            eventData = {
              expectedCashMinor: expectedMinor,
              countedCashMinor: countedAmount,
            };
          } else {
            if (current.status !== "CLOSING") throw new ApiAccessError(409);
            const variance =
              BigInt(current.counted_cash_minor) -
              BigInt(current.closing_expected_minor);
            const updated = await client.query(
              "UPDATE public.cash_shifts SET status='CLOSED',variance_minor=$4,closed_at=now(),version=version+1 WHERE organization_id=$1 AND branch_id=$2 AND id=$3 RETURNING *",
              [orgId, branchId, shiftId, variance.toString()],
            );
            shift = updated.rows[0];
            eventType = "CLOSED";
            eventData = { varianceMinor: variance.toString() };
          }
        }
        await client.query(
          "INSERT INTO public.cash_shift_events(organization_id,branch_id,shift_id,event_type,version,actor_user_id,event_data) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            orgId,
            branchId,
            shift.id,
            eventType,
            shift.version,
            identity.userId,
            eventData,
          ],
        );
        await client.query(
          "INSERT INTO public.cash_shift_idempotency_keys(organization_id,branch_id,actor_user_id,operation,idempotency_key,request_hash,shift_id,movement_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            orgId,
            branchId,
            identity.userId,
            operation,
            idempotencyKey,
            requestHash,
            shift.id,
            movement?.id ?? null,
          ],
        );
        return { status: 201, payload: { shift, movement, duplicate: false } };
      },
    );
    response.setHeader("Cache-Control", "no-store, private");
    json(response, result.status, result.payload);
    return true;
  }
  const serviceRoute =
    /^\/api\/v1\/organizations\/([^/]+)\/branches\/([^/]+)\/(waiter|kitchen\/tickets)(?:\/([^/]+))?(?:\/(bill))?$/.exec(
      path,
    );
  if (serviceRoute) {
    const orgId = validateUuid(serviceRoute[1] ?? "");
    const branchId = validateUuid(serviceRoute[2] ?? "");
    const surface = serviceRoute[3] ?? "";
    const ticketId = serviceRoute[4] ? validateUuid(serviceRoute[4]) : null;
    const action = serviceRoute[5] ?? null;
    const method = request.method ?? "GET";
    const isKitchen = surface === "kitchen/tickets";
    if (
      (isKitchen &&
        !(
          (method === "GET" && !ticketId) ||
          (method === "PATCH" && ticketId && !action)
        )) ||
      (!isKitchen &&
        !(
          (method === "GET" && !ticketId) ||
          (method === "POST" &&
            ticketId &&
            (action === null || action === "bill")) ||
          (method === "PATCH" && ticketId && !action)
        ))
    )
      throw new ApiAccessError(404);
    const body =
      method === "POST" || method === "PATCH"
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
        if (!canAccessBranch(memberships, branchId))
          throw new ApiAccessError(403);
        const roles = memberships
          .filter((m) => m.branch_id === branchId)
          .map((m) => m.role);
        const orgOwner = memberships.some(
          (m) => m.branch_id === null && ["owner", "director"].includes(m.role),
        );
        const canWait =
          orgOwner ||
          roles.some((r) => ["waiter", "cashier", "administrator"].includes(r));
        const canKitchen =
          orgOwner ||
          roles.some((r) => ["kitchen", "administrator"].includes(r));
        if ((isKitchen && !canKitchen) || (!isKitchen && !canWait))
          throw new ApiAccessError(403);
        if (method === "GET" && isKitchen) {
          const rows = await client.query(
            "SELECT * FROM private.staff_ticket_context($1,$2,NULL) ORDER BY created_at,id LIMIT 200",
            [orgId, branchId],
          );
          const tickets = [];
          for (const row of rows.rows) {
            const items = await client.query(
              "SELECT * FROM private.staff_ticket_items($1,$2,$3)",
              [orgId, branchId, row.id],
            );
            tickets.push({ ...row, items: items.rows });
          }
          return { status: 200, payload: { tickets, mode: "INTEGRATED" } };
        }
        if (method === "GET") {
          const branch = await client.query(
            "SELECT id,name FROM public.branches WHERE organization_id=$1 AND id=$2",
            [orgId, branchId],
          );
          const tables = await client.query(
            "SELECT id,table_code,display_name,seats,status FROM public.restaurant_tables WHERE organization_id=$1 AND branch_id=$2 AND active ORDER BY table_code",
            [orgId, branchId],
          );
          const products = await client.query(
            "SELECT p.id,p.name,p.description,p.image_key,p.category_id,c.name category_name,COALESCE(a.available,true) available,v.id price_version,v.price_minor::text,currency_code FROM public.products p JOIN public.product_categories c ON c.organization_id=p.organization_id AND c.id=p.category_id LEFT JOIN public.branch_product_availability a ON a.organization_id=p.organization_id AND a.branch_id=$2 AND a.product_id=p.id LEFT JOIN LATERAL(SELECT id,price_minor,currency_code FROM public.product_price_versions WHERE organization_id=p.organization_id AND branch_id=$2 AND product_id=p.id AND effective_at<=clock_timestamp() ORDER BY effective_at DESC,id DESC LIMIT 1)v ON true WHERE p.organization_id=$1 AND p.active AND c.active ORDER BY c.sort_order,p.sort_order,p.name LIMIT 1000",
            [orgId, branchId],
          );
          const orders = await client.query(
            "SELECT * FROM private.staff_active_orders($1,$2) ORDER BY created_at DESC LIMIT 200",
            [orgId, branchId],
          );
          const ticketRows = await client.query(
            "SELECT * FROM private.staff_ticket_context($1,$2,NULL) ORDER BY created_at,id LIMIT 200",
            [orgId, branchId],
          );
          if (!branch.rows[0]) throw new ApiAccessError(404);
          const tickets = [];
          for (const row of ticketRows.rows)
            tickets.push({
              ...row,
              items: (
                await client.query(
                  "SELECT * FROM private.staff_ticket_items($1,$2,$3)",
                  [orgId, branchId, row.id],
                )
              ).rows,
            });
          return {
            status: 200,
            payload: {
              branch: branch.rows[0],
              tables: tables.rows,
              products: products.rows,
              orders: orders.rows,
              tickets,
              mode: "INTEGRATED",
            },
          };
        }
        if (method === "POST" && body && ticketId && action === "bill") {
          requireMfa(identity);
          exactKeys(body, ["idempotencyKey"], ["idempotencyKey"]);
          const key = validateUuid(stringField(body, "idempotencyKey", 36));
          const requestHash = createHash("sha256")
            .update(
              JSON.stringify({ operation: "REQUEST_BILL", orderId: ticketId }),
            )
            .digest();
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            [`${orgId}:${branchId}:${identity.userId}:REQUEST_BILL:${key}`],
          );
          const previous = await client.query(
            "SELECT request_hash FROM public.order_idempotency_keys WHERE organization_id=$1 AND branch_id=$2 AND actor_user_id=$3 AND operation='REQUEST_BILL' AND idempotency_key=$4",
            [orgId, branchId, identity.userId, key],
          );
          if (previous.rows[0]) {
            if (!previous.rows[0].request_hash.equals(requestHash))
              throw new ApiAccessError(409, "IDEMPOTENCY_KEY_REUSED");
            return {
              status: 200,
              payload: { orderId: ticketId, requested: true, duplicate: true },
            };
          }
          const order = await client.query(
            "SELECT id,status FROM private.staff_order_context($1,$2,$3)",
            [orgId, branchId, ticketId],
          );
          if (!order.rows[0]) throw new ApiAccessError(404);
          if (
            !["SUBMITTED", "ACCEPTED", "PREPARING", "READY", "SERVED"].includes(
              order.rows[0].status,
            )
          )
            throw new ApiAccessError(409, "ORDER_NOT_OPEN");
          await client.query(
            "INSERT INTO public.order_events(organization_id,branch_id,order_id,event_type,actor_user_id,event_data) VALUES($1,$2,$3,'BILL_REQUESTED',$4,'{}'::jsonb)",
            [orgId, branchId, ticketId, identity.userId],
          );
          await client.query(
            "INSERT INTO public.order_idempotency_keys(organization_id,branch_id,actor_user_id,operation,idempotency_key,request_hash,order_id) VALUES($1,$2,$3,'REQUEST_BILL',$4,$5,$6)",
            [orgId, branchId, identity.userId, key, requestHash, ticketId],
          );
          return {
            status: 202,
            payload: { orderId: ticketId, requested: true, duplicate: false },
          };
        }
        if (method === "POST" && body && ticketId) {
          requireMfa(identity);
          const parsed = parseOrderAddition(body);
          const lockKey = `${orgId}:${branchId}:${identity.userId}:ADD_ORDER_ITEMS:${parsed.idempotencyKey}`;
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            [lockKey],
          );
          const normalized = {
            orderId: ticketId,
            items: [...parsed.items].sort((a, b) =>
              a.productId.localeCompare(b.productId),
            ),
          };
          const hash = createHash("sha256")
            .update(JSON.stringify(normalized))
            .digest();
          const previous = await client.query(
            "SELECT request_hash,result_ticket_id FROM public.order_idempotency_keys WHERE organization_id=$1 AND branch_id=$2 AND actor_user_id=$3 AND operation='ADD_ORDER_ITEMS' AND idempotency_key=$4",
            [orgId, branchId, identity.userId, parsed.idempotencyKey],
          );
          if (previous.rows[0]) {
            if (!previous.rows[0].request_hash.equals(hash))
              throw new ApiAccessError(409, "IDEMPOTENCY_KEY_REUSED");
            return {
              status: 200,
              payload: {
                ticketId: previous.rows[0].result_ticket_id,
                duplicate: true,
              },
            };
          }
          const order = await client.query(
            "SELECT id,status,currency_code FROM private.lock_staff_order($1,$2,$3)",
            [orgId, branchId, ticketId],
          );
          const orderRow = order.rows[0];
          if (!orderRow) throw new ApiAccessError(404);
          if (
            !["SUBMITTED", "ACCEPTED", "PREPARING", "READY"].includes(
              orderRow.status,
            )
          )
            throw new ApiAccessError(409, "ORDER_NOT_OPEN");
          let subtotal = 0n;
          const resolved = [];
          for (const item of parsed.items) {
            const locked = await client.query(
              "SELECT private.lock_order_product($1,$2,$3) available",
              [orgId, branchId, item.productId],
            );
            if (!locked.rows[0]?.available)
              throw new ApiAccessError(409, "PRODUCT_UNAVAILABLE");
            const p = await client.query(
              "SELECT p.name,v.price_minor::text,v.currency_code,v.id price_version,COALESCE(a.available,true) available FROM public.products p JOIN public.product_categories c ON c.organization_id=p.organization_id AND c.id=p.category_id LEFT JOIN public.branch_product_availability a ON a.organization_id=p.organization_id AND a.branch_id=$2 AND a.product_id=p.id LEFT JOIN LATERAL(SELECT id,price_minor,currency_code FROM public.product_price_versions WHERE organization_id=p.organization_id AND branch_id=$2 AND product_id=p.id AND effective_at<=clock_timestamp() ORDER BY effective_at DESC,id DESC LIMIT 1)v ON true WHERE p.organization_id=$1 AND p.id=$3 AND p.active AND c.active",
              [orgId, branchId, item.productId],
            );
            const row = p.rows[0];
            if (!row?.available || !row.price_version)
              throw new ApiAccessError(409, "PRODUCT_UNAVAILABLE");
            if (row.price_version !== item.priceVersion)
              throw new ApiAccessError(409, "STALE_PRICE");
            if (row.currency_code !== orderRow.currency_code)
              throw new ApiAccessError(409, "CURRENCY_MISMATCH");
            const line =
              (BigInt(row.price_minor) * quantityMilli(item.quantity) + 500n) /
              1000n;
            subtotal += line;
            if (subtotal > 9000000000000000n)
              throw new ApiAccessError(400, "ORDER_TOTAL_OUT_OF_RANGE");
            resolved.push({
              ...item,
              name: row.name,
              price: row.price_minor,
              currency: row.currency_code,
              line: line.toString(),
            });
          }
          const ids = [];
          for (const item of resolved) {
            const inserted = await client.query<{ id: string }>(
              "SELECT id FROM private.add_staff_order_item($1,$2,$3,$4,$5::numeric,$6,$7)",
              [
                orgId,
                branchId,
                ticketId,
                item.productId,
                item.quantity,
                item.priceVersion,
                item.notes,
              ],
            );
            ids.push(inserted.rows[0]!.id);
          }
          await client.query(
            "SELECT private.recalculate_order_total($1,$2,$3)",
            [orgId, branchId, ticketId],
          );
          const newTicketId = await createKitchenTicket(
            client,
            orgId,
            branchId,
            ticketId,
            identity.userId,
            ids,
          );
          await client.query(
            "SELECT private.recalculate_order_status($1,$2,$3)",
            [orgId, branchId, ticketId],
          );
          await client.query(
            "INSERT INTO public.order_events(organization_id,branch_id,order_id,event_type,actor_user_id,event_data) VALUES($1,$2,$3,'ORDER_ITEMS_ADDED',$4,$5::jsonb)",
            [
              orgId,
              branchId,
              ticketId,
              identity.userId,
              JSON.stringify({ itemCount: ids.length, ticketId: newTicketId }),
            ],
          );
          await client.query(
            "INSERT INTO public.order_idempotency_keys(organization_id,branch_id,actor_user_id,operation,idempotency_key,request_hash,order_id,result_ticket_id) VALUES($1,$2,$3,'ADD_ORDER_ITEMS',$4,$5,$6,$7)",
            [
              orgId,
              branchId,
              identity.userId,
              parsed.idempotencyKey,
              hash,
              ticketId,
              newTicketId,
            ],
          );
          return {
            status: 201,
            payload: { ticketId: newTicketId, duplicate: false },
          };
        }
        if (method === "PATCH" && body && ticketId) {
          requireMfa(identity);
          exactKeys(
            body,
            ["idempotencyKey", "expectedVersion", "transition", "reason"],
            ["idempotencyKey", "expectedVersion", "transition"],
          );
          const key = validateUuid(stringField(body, "idempotencyKey", 36));
          const expected = body.expectedVersion;
          const transition = body.transition;
          const reason = optionalStringField(body, "reason", 300);
          if (
            !Number.isInteger(expected) ||
            Number(expected) < 1 ||
            !["ACCEPT", "START", "READY", "SERVE", "CANCEL"].includes(
              String(transition),
            )
          )
            throw new ApiAccessError(400);
          if (transition === "CANCEL" && !reason) throw new ApiAccessError(400);
          const requestHash = createHash("sha256")
            .update(JSON.stringify({ ticketId, expected, transition, reason }))
            .digest();
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            [
              `${orgId}:${branchId}:${identity.userId}:TRANSITION_TICKET:${key}`,
            ],
          );
          const previous = await client.query(
            "SELECT request_hash,result_ticket_id FROM public.order_idempotency_keys WHERE organization_id=$1 AND branch_id=$2 AND actor_user_id=$3 AND operation='TRANSITION_TICKET' AND idempotency_key=$4",
            [orgId, branchId, identity.userId, key],
          );
          if (previous.rows[0]) {
            if (!previous.rows[0].request_hash.equals(requestHash))
              throw new ApiAccessError(409, "IDEMPOTENCY_KEY_REUSED");
            return { status: 200, payload: { ticketId, duplicate: true } };
          }
          const locked = await client.query(
            "SELECT status,version,order_id FROM public.kitchen_tickets WHERE organization_id=$1 AND branch_id=$2 AND id=$3 FOR UPDATE",
            [orgId, branchId, ticketId],
          );
          const current = locked.rows[0];
          if (!current) throw new ApiAccessError(404);
          if (current.version !== expected)
            throw new ApiAccessError(409, "STALE_TICKET");
          const nextByTransition: Record<string, string> = {
            ACCEPT: "ACCEPTED",
            START: "PREPARING",
            READY: "READY",
            SERVE: "SERVED",
            CANCEL: "CANCELLED",
          };
          const next = nextByTransition[String(transition)]!;
          const legal: Record<string, string[]> = {
            QUEUED: ["ACCEPTED", "CANCELLED"],
            ACCEPTED: ["PREPARING", "CANCELLED"],
            PREPARING: ["READY", "CANCELLED"],
            READY: ["SERVED"],
            SERVED: [],
            CANCELLED: [],
          };
          if (!legal[current.status]?.includes(next))
            throw new ApiAccessError(409, "INVALID_TRANSITION");
          if (
            (transition === "SERVE" && !canWait) ||
            (transition !== "SERVE" && (!isKitchen || !canKitchen))
          )
            throw new ApiAccessError(403);
          await client.query(
            "UPDATE public.kitchen_tickets SET status=$1,cancel_reason=$2,version=version+1,updated_at=now() WHERE organization_id=$3 AND branch_id=$4 AND id=$5",
            [
              next,
              next === "CANCELLED" ? reason : null,
              orgId,
              branchId,
              ticketId,
            ],
          );
          await client.query(
            "INSERT INTO public.order_idempotency_keys(organization_id,branch_id,actor_user_id,operation,idempotency_key,request_hash,order_id,result_ticket_id) VALUES($1,$2,$3,'TRANSITION_TICKET',$4,$5,$6,$7)",
            [
              orgId,
              branchId,
              identity.userId,
              key,
              requestHash,
              current.order_id,
              ticketId,
            ],
          );
          return {
            status: 200,
            payload: {
              ticketId,
              status: next,
              version: Number(expected) + 1,
              duplicate: false,
            },
          };
        }
        throw new ApiAccessError(404);
      },
    );
    json(response, result.status, result.payload);
    return true;
  }
  const orderRoute =
    /^\/api\/v1\/organizations\/([^/]+)\/branches\/([^/]+)\/(pos|orders)(?:\/([^/]+))?$/.exec(
      path,
    );
  if (orderRoute) {
    const orgId = validateUuid(orderRoute[1] ?? "");
    const branchId = validateUuid(orderRoute[2] ?? "");
    const resource = orderRoute[3];
    const orderId = orderRoute[4] ? validateUuid(orderRoute[4]) : undefined;
    const method = request.method ?? "GET";
    if (
      (resource === "pos" && (method !== "GET" || orderId)) ||
      (resource === "orders" &&
        !((method === "POST" && !orderId) || (method === "GET" && orderId)))
    )
      throw new ApiAccessError(404);
    const body =
      method === "POST"
        ? parseOrderRequest(await readJson(request))
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
        if (!canAccessBranch(memberships, branchId))
          throw new ApiAccessError(403);
        const canOperate = memberships.some(
          (membership) =>
            (membership.branch_id === branchId &&
              ["cashier", "administrator"].includes(membership.role)) ||
            (membership.branch_id === null &&
              ["owner", "director"].includes(membership.role)),
        );
        const canReadFinancials = memberships.some(
          (membership) =>
            (membership.branch_id === branchId &&
              ["cashier", "accountant", "administrator"].includes(
                membership.role,
              )) ||
            (membership.branch_id === null &&
              ["owner", "director"].includes(membership.role)),
        );
        if (
          (resource === "pos" && !canOperate) ||
          (resource === "orders" && method === "GET" && !canReadFinancials)
        )
          throw new ApiAccessError(403);
        if (resource === "pos") {
          const branch = await client.query(
            "SELECT id,name FROM public.branches WHERE organization_id=$1 AND id=$2",
            [orgId, branchId],
          );
          if (!branch.rows[0]) throw new ApiAccessError(404);
          const products = await client.query(
            "SELECT p.id,p.name,p.description,p.image_key,p.category_id,c.name category_name,COALESCE(a.available,true) available,v.id price_version,v.price_minor::text,currencY_code FROM public.products p JOIN public.product_categories c ON c.organization_id=p.organization_id AND c.id=p.category_id LEFT JOIN public.branch_product_availability a ON a.organization_id=p.organization_id AND a.branch_id=$2 AND a.product_id=p.id LEFT JOIN LATERAL(SELECT id,price_minor,currency_code FROM public.product_price_versions WHERE organization_id=p.organization_id AND branch_id=$2 AND product_id=p.id AND effective_at<=clock_timestamp() ORDER BY effective_at DESC,id DESC LIMIT 1)v ON true WHERE p.organization_id=$1 AND p.active AND c.active ORDER BY c.sort_order,p.sort_order,p.name LIMIT 1000",
            [orgId, branchId],
          );
          const tables = await client.query(
            "SELECT id,table_code,display_name,seats,status FROM public.restaurant_tables WHERE organization_id=$1 AND branch_id=$2 AND active ORDER BY table_code LIMIT 500",
            [orgId, branchId],
          );
          return {
            status: 200,
            payload: {
              branch: branch.rows[0],
              products: products.rows,
              tables: tables.rows,
            },
          };
        }
        if (method === "POST" && body) {
          requireMfa(identity);
          const created = await createCashierOrder(
            client,
            identity,
            orgId,
            branchId,
            body,
          );
          return { status: created.duplicate ? 200 : 201, payload: created };
        }
        const found = await readOrder(client, orgId, branchId, orderId!);
        return { status: 200, payload: found };
      },
    );
    json(response, result.status, result.payload);
    return true;
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
          const product = await client.query(
            "SELECT id FROM public.products WHERE organization_id=$1 AND id=$2 AND active FOR UPDATE",
            [orgId, itemId],
          );
          if (!product.rows[0]) throw new ApiAccessError(404);
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
          const product = await client.query(
            "SELECT id FROM public.products WHERE organization_id=$1 AND id=$2 AND active FOR UPDATE",
            [orgId, itemId],
          );
          if (!product.rows[0]) throw new ApiAccessError(404);
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
