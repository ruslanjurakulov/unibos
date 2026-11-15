export type RuntimeMode = "development" | "test" | "production";

export interface RuntimeConfig {
  readonly mode: RuntimeMode;
  readonly host: string;
  readonly apiPort: number;
  readonly databaseUrl: string;
  readonly redisUrl: string;
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
  return Object.freeze({
    mode: mode as RuntimeMode,
    host,
    apiPort,
    databaseUrl,
    redisUrl,
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
