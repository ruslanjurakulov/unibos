import type { Server } from "node:http";
import { Pool } from "pg";
import { readRuntimeConfig } from "@unibos/runtime";
import { createApplication } from "./application";
import type { ApiSecurityOptions, SecurityInstance } from "./security-routes";
import { writeEvent } from "./logging";

async function main() {
  // Runtime processes have no reason to retain bootstrap credentials even if a shell inherited them.
  for (const key of [
    "MIGRATION_DATABASE_URL",
    "POSTGRES_PASSWORD",
    "APP_DATABASE_PASSWORD",
    "AUTH_DATABASE_PASSWORD",
    "GH_TOKEN",
    "GITHUB_TOKEN",
  ])
    delete process.env[key];
  const config = readRuntimeConfig(process.env);
  let security: SecurityInstance | undefined;
  let pool: Pool | undefined;
  try {
    let options: ApiSecurityOptions | undefined;
    if (config.security) {
      const { createSecurity } = await import("@unibos/security");
      security = await createSecurity({
        ...config.security,
        trustedOrigins: [...config.security.trustedOrigins],
      });
      pool = new Pool({
        connectionString: config.databaseUrl,
        max: 5,
        connectionTimeoutMillis: 1500,
        idleTimeoutMillis: 10000,
        statement_timeout: 3000,
        query_timeout: 3500,
        application_name: "unibos-api",
      });
      pool.on("error", () => writeEvent("api.request_failed", "failed"));
      options = {
        security,
        pool,
        trustedOrigins: [
          ...new Set([
            new URL(config.security.baseURL).origin,
            ...config.security.trustedOrigins,
          ]),
        ],
      };
    }
    const app = await createApplication(config, undefined, undefined, options);
    await app.listen(config.apiPort, config.host);
    const server = app.getHttpServer() as Server;
    server.requestTimeout = 10000;
    server.headersTimeout = 5000;
    server.keepAliveTimeout = 5000;
    server.maxHeadersCount = 100;
    writeEvent("api.started", "ok");
  } catch (error) {
    await Promise.allSettled([security?.close(), pool?.end()]);
    throw error;
  }
}

main().catch(() => {
  // Do not print raw config, connection errors, URLs, stack traces or credentials.
  writeEvent("api.startup_failed", "failed");
  process.exitCode = 1;
});
