export type RuntimeMode = "development" | "test" | "production";

export interface SecurityRuntimeConfig {
  readonly secret: string;
  readonly baseURL: string;
  readonly authDatabaseUrl: string;
  readonly trustedOrigins: readonly string[];
  readonly enableSignup: boolean;
  readonly mode: RuntimeMode;
}

export interface RuntimeConfig {
  readonly mode: RuntimeMode;
  readonly host: string;
  readonly apiPort: number;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly security?: SecurityRuntimeConfig;
}

/** Errors identify configuration keys only; never echo credential-bearing values. */
export function readRuntimeConfig(
  env: Record<string, string | undefined>,
): RuntimeConfig {
  const mode = env.NODE_ENV ?? "development";
  if (!["development", "test", "production"].includes(mode)) {
    throw new Error("Invalid NODE_ENV");
  }
  const host = env.HOST ?? "127.0.0.1";
  if (!["127.0.0.1", "::1", "0.0.0.0"].includes(host)) {
    throw new Error("Invalid HOST");
  }
  const rawPort = env.PORT ?? "3001";
  if (!/^\d+$/.test(rawPort)) throw new Error("Invalid PORT");
  const apiPort = Number(rawPort);
  if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) {
    throw new Error("Invalid PORT");
  }
  const databaseUrl = validateUrl("DATABASE_URL", env.DATABASE_URL, [
    "postgres:",
    "postgresql:",
  ]);
  const redisUrl = validateUrl("REDIS_URL", env.REDIS_URL, [
    "redis:",
    "rediss:",
  ]);
  if (mode === "production") {
    if (new URL(databaseUrl).searchParams.get("sslmode") !== "verify-full") {
      throw new Error("DATABASE_URL must use verified TLS in production");
    }
    if (new URL(redisUrl).protocol !== "rediss:") {
      throw new Error("REDIS_URL must use TLS in production");
    }
  }
  const security = readSecurityConfig(env, mode as RuntimeMode, databaseUrl);
  return Object.freeze({
    mode: mode as RuntimeMode,
    host,
    apiPort,
    databaseUrl,
    redisUrl,
    ...(security ? { security } : {}),
  });
}

function booleanFlag(key: string, raw: string | undefined): boolean {
  if (raw === undefined || raw === "false") return false;
  if (raw === "true") return true;
  throw new Error(`Invalid ${key}`);
}

function origin(key: string, raw: string, mode: RuntimeMode): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Invalid ${key}`);
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/" ||
    parsed.hostname.includes("*") ||
    (mode === "production" && parsed.protocol !== "https:") ||
    (parsed.protocol === "http:" &&
      !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname))
  )
    throw new Error(`Invalid ${key}`);
  return parsed.origin;
}

function readSecurityConfig(
  env: Record<string, string | undefined>,
  mode: RuntimeMode,
  databaseUrl: string,
): SecurityRuntimeConfig | undefined {
  if (!booleanFlag("AUTH_ENABLED", env.AUTH_ENABLED)) {
    if (mode === "production")
      throw new Error("AUTH_ENABLED is required in production");
    return undefined;
  }
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("Invalid BETTER_AUTH_SECRET");
  if (!env.AUTH_BASE_URL) throw new Error("Missing AUTH_BASE_URL");
  const baseURL = origin("AUTH_BASE_URL", env.AUTH_BASE_URL, mode);
  const authDatabaseUrl = validateUrl(
    "AUTH_DATABASE_URL",
    env.AUTH_DATABASE_URL,
    ["postgres:", "postgresql:"],
  );
  const authURL = new URL(authDatabaseUrl);
  if (
    authURL.username !== "unibos_auth" ||
    new URL(databaseUrl).username !== "unibos_app"
  ) {
    throw new Error(
      "Separate restricted application and identity database roles are required",
    );
  }
  if (
    mode === "production" &&
    authURL.searchParams.get("sslmode") !== "verify-full"
  ) {
    throw new Error("AUTH_DATABASE_URL must use verified TLS in production");
  }
  const trustedOrigins = Object.freeze([
    ...new Set([
      baseURL,
      ...(env.AUTH_TRUSTED_ORIGINS ?? baseURL)
        .split(",")
        .map((value) => origin("AUTH_TRUSTED_ORIGINS", value.trim(), mode)),
    ]),
  ]);
  const enableSignup = booleanFlag("AUTH_ALLOW_SIGNUP", env.AUTH_ALLOW_SIGNUP);
  if (mode === "production" && enableSignup) {
    throw new Error(
      "Production signup requires a verified email delivery integration",
    );
  }
  return Object.freeze({
    secret,
    baseURL,
    authDatabaseUrl,
    trustedOrigins,
    enableSignup,
    mode,
  });
}

function validateUrl(
  key: string,
  value: string | undefined,
  protocols: string[],
): string {
  if (!value) throw new Error(`Missing ${key}`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid ${key}`);
  }
  if (
    !protocols.includes(url.protocol) ||
    !url.hostname ||
    !url.password ||
    url.hash
  ) {
    throw new Error(`Invalid ${key}`);
  }
  if (
    protocols.includes("postgres:") &&
    (!url.username || !url.pathname || url.pathname === "/")
  ) {
    throw new Error(`Invalid ${key}`);
  }
  return value;
}
