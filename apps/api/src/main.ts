import type { Server } from "node:http";
import { readRuntimeConfig } from "@unibos/runtime";
import { initializeApplication } from "./bootstrap";
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
  const app = await initializeApplication(config);
  try {
    await app.listen(config.apiPort, config.host);
    const server = app.getHttpServer() as Server;
    server.requestTimeout = 10000;
    server.headersTimeout = 5000;
    server.keepAliveTimeout = 5000;
    server.maxHeadersCount = 100;
    writeEvent("api.started", "ok");
  } catch (error) {
    await app.close();
    throw error;
  }
}

main().catch(() => {
  // Do not print raw config, connection errors, URLs, stack traces or credentials.
  writeEvent("api.startup_failed", "failed");
  process.exitCode = 1;
});
