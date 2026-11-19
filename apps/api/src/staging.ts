import type { IncomingMessage, ServerResponse } from "node:http";
import { readRuntimeConfig } from "@unibos/runtime";
import { initializeApplication } from "./bootstrap";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

// Each warm function instance owns one restricted pool and one auth instance.
export async function createPreviewHandler(origin: string): Promise<Handler> {
  const config = readRuntimeConfig(process.env);
  if (
    config.mode !== "production" ||
    !config.security ||
    config.security.baseURL !== origin ||
    config.security.trustedOrigins.some((allowed) => allowed !== origin)
  ) {
    throw new Error("Invalid isolated Preview runtime configuration");
  }
  const app = await initializeApplication(config);
  try {
    await app.init();
    return app.getHttpAdapter().getInstance() as Handler;
  } catch (error) {
    await app.close();
    throw error;
  }
}
