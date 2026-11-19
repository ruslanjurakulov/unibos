declare module "*dist/preview-api.cjs" {
  import type { IncomingMessage, ServerResponse } from "node:http";
  export function createPreviewHandler(
    origin: string,
  ): Promise<(req: IncomingMessage, res: ServerResponse) => void>;
}
