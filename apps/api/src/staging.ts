import type { IncomingMessage, ServerResponse } from "node:http";
import { readRuntimeConfig } from "@unibos/runtime";
import { initializeApplication } from "./bootstrap";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;
type InitStage =
  "RUNTIME_CONFIG" | "ORIGIN_GUARD" | "NEST_BOOTSTRAP" | "NEST_INIT";

// Use only fixed local codes in the Vercel log. Errors can contain connection strings.
const startupCodes = new Map([
  ["MODULE_NOT_FOUND", "RUNTIME_MODULE"],
  ["ERR_MODULE_NOT_FOUND", "RUNTIME_MODULE"],
  ["ERR_PACKAGE_PATH_NOT_EXPORTED", "RUNTIME_MODULE"],
  ["ERR_REQUIRE_ESM", "RUNTIME_MODULE"],
  ["UNIBOS_AUTH_ROLE_REJECTED", "AUTH_ROLE_REJECTED"],
  ["UNIBOS_AUTH_DB_UNAVAILABLE", "AUTH_DB_UNAVAILABLE"],
  ["UNIBOS_APP_ROLE_REJECTED", "APP_ROLE_REJECTED"],
  ["UNIBOS_APP_DB_UNAVAILABLE", "APP_DB_UNAVAILABLE"],
]);

function logStartupFailure(stage: InitStage, error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  const reason = typeof code === "string" ? startupCodes.get(code) : undefined;
  console.error("unibos.preview.init." + (reason ?? stage));
}

// Each warm function instance owns one restricted pool and one auth instance.
export async function createPreviewHandler(origin: string): Promise<Handler> {
  let stage: InitStage = "RUNTIME_CONFIG";
  try {
    // Vercel owns the listening socket. Only the standalone entry point binds HOST/PORT.
    const config = readRuntimeConfig({
      ...process.env,
      HOST: undefined,
      PORT: undefined,
    });
    stage = "ORIGIN_GUARD";
    if (
      config.mode !== "production" ||
      !config.security ||
      config.security.baseURL !== origin ||
      config.security.trustedOrigins.some((allowed) => allowed !== origin)
    )
      throw new Error("Invalid isolated Preview runtime configuration");
    stage = "NEST_BOOTSTRAP";
    const app = await initializeApplication(config, "preview");
    stage = "NEST_INIT";
    try {
      await app.init();
      return app.getHttpAdapter().getInstance() as Handler;
    } catch (error) {
      await app.close();
      throw error;
    }
  } catch (error) {
    logStartupFailure(stage, error);
    throw new Error("Preview API unavailable");
  }
}
