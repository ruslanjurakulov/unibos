import { Pool } from "pg";
import type { RuntimeConfig } from "@unibos/runtime";
import { InfrastructureProbes } from "./probes";
import { createApplication } from "./application";
import type { ApiSecurityOptions, SecurityInstance } from "./security-routes";
import { writeEvent } from "./logging";

export async function initializeApplication(
  config: RuntimeConfig,
  target: "standalone" | "preview" = "standalone",
) {
  // A suspended hosted database can take several seconds to complete verified TLS.
  const connectionTimeoutMillis = target === "preview" ? 8000 : 1500;
  let security: SecurityInstance | undefined;
  let pool: Pool | undefined;
  try {
    let options: ApiSecurityOptions | undefined;
    if (config.security) {
      const { createSecurity } = await import("@unibos/security");
      security = await createSecurity(
        {
          ...config.security,
          trustedOrigins: [...config.security.trustedOrigins],
        },
        { connectionTimeoutMillis },
      );
      pool = new Pool({
        connectionString: config.databaseUrl,
        max: 5,
        connectionTimeoutMillis,
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
    return await createApplication(
      config,
      target === "preview"
        ? new InfrastructureProbes(config, connectionTimeoutMillis)
        : undefined,
      undefined,
      options,
    );
  } catch (error) {
    await Promise.allSettled([security?.close(), pool?.end()]);
    throw error;
  }
}
