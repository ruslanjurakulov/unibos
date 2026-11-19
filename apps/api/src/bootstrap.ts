import { Pool } from "pg";
import type { RuntimeConfig } from "@unibos/runtime";
import { createApplication } from "./application";
import type { ApiSecurityOptions, SecurityInstance } from "./security-routes";
import { writeEvent } from "./logging";

export async function initializeApplication(config: RuntimeConfig) {
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
    return await createApplication(config, undefined, undefined, options);
  } catch (error) {
    await Promise.allSettled([security?.close(), pool?.end()]);
    throw error;
  }
}
