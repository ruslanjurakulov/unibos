import { finished } from "node:stream/promises";
import type { NextApiRequest, NextApiResponse } from "next";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  admissionHeader,
  gatePassword,
  requiresStagingAdmission,
  validAdmission,
} from "../../staging-admission";
import { previewModuleDiagnostic } from "../../staging-module-diagnostic";
import { requestStagingOrigin } from "../../staging-preview";

// Better Auth reads the original HTTP stream. Its own middleware owns the response.
export const config = { api: { bodyParser: false, externalResolver: true } };
type Handler = (req: IncomingMessage, res: ServerResponse) => void;
let pending: Promise<Handler> | undefined;

export default async function api(
  request: NextApiRequest,
  response: NextApiResponse,
) {
  response.setHeader("Cache-Control", "no-store");
  const origin = requestStagingOrigin(process.env, request.headers.host);
  if (!origin) {
    if (requiresStagingAdmission(process.env))
      console.error("unibos.preview.init.ORIGIN_GUARD");
    return response.status(503).json({
      status: "unavailable",
      message:
        "Authentication and business API are not connected to this preview.",
    });
  }
  const password = gatePassword(process.env);
  const proof = request.headers[admissionHeader];
  const url = new URL(request.url ?? "/", origin);
  if (
    !password ||
    typeof proof !== "string" ||
    !validAdmission(proof, password, request.method ?? "", url)
  ) {
    return response.status(403).json({ status: "denied" });
  }
  delete request.headers[admissionHeader];
  delete request.headers.authorization;
  try {
    pending ??= import(/* webpackMode: "eager" */ "../../dist/preview-api.cjs")
      .then(
        ({ createPreviewHandler }) => createPreviewHandler(origin),
        (error: unknown) => {
          console.error(previewModuleDiagnostic(error));
          throw new Error("Preview API unavailable");
        },
      )
      .catch((error: unknown) => {
        pending = undefined;
        throw error;
      });
    const handle = await pending;
    // Nest's health controller is mounted outside the original /api namespace.
    if (
      request.url === "/api/health/live" ||
      request.url === "/api/health/ready"
    )
      request.url = request.url.slice(4);
    handle(request, response);
    await finished(response, { cleanup: true });
  } catch {
    if (!response.headersSent && !response.destroyed)
      response.status(503).json({ status: "unavailable" });
  }
}
