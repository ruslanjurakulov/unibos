import { readRuntimeConfig } from "@unibos/runtime";
import { createApplication } from "./application";
import { writeEvent } from "./logging";

async function main() {
  const config = readRuntimeConfig(process.env);
  const app = await createApplication(config);
  await app.listen(config.apiPort, config.host);
  writeEvent("api.started", "ok");
}

main().catch(() => {
  // Do not print raw config, connection errors, URLs, stack traces or credentials.
  writeEvent("api.startup_failed", "failed");
  process.exitCode = 1;
});
