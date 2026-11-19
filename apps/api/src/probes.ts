import { Pool } from "pg";
import { createClient } from "redis";
import type { RuntimeConfig } from "@unibos/runtime";
import { writeEvent } from "./logging";

export interface HealthProbes {
  postgres(): Promise<void>;
  redis(): Promise<void>;
}

/** Only infrastructure checks; no tenant or business data is accessed. */
export class InfrastructureProbes implements HealthProbes {
  private readonly pool: Pool;

  constructor(
    private readonly config: RuntimeConfig,
    private readonly connectTimeout = 1000,
  ) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: 2,
      connectionTimeoutMillis: connectTimeout,
      idleTimeoutMillis: 1000,
      query_timeout: 1000,
      statement_timeout: 1000,
      application_name: "unibos-api-health",
    });
    // Idle connection errors must not terminate the process or expose credentials.
    this.pool.on("error", () =>
      writeEvent("api.connection_failed", "failed", "postgres"),
    );
  }

  async postgres(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async redis(): Promise<void> {
    const client = createClient({
      url: this.config.redisUrl,
      socket: { connectTimeout: this.connectTimeout, reconnectStrategy: false },
      disableOfflineQueue: true,
      // Redis AUTH/HELLO/CLIENT initialization pipelines several commands.
      commandsQueueMaxLength: 32,
    });
    client.on("error", () => undefined);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        (async () => {
          await client.connect();
          await client.ping();
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Readiness timeout")),
            this.connectTimeout + 500,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      if (client.isOpen) client.destroy();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
    writeEvent("api.stopped", "ok");
  }
}
