declare module "@unibos/api/dist/staging.js" {
  import type { IncomingMessage, ServerResponse } from "node:http";
  export function createPreviewHandler(
    origin: string,
  ): Promise<(req: IncomingMessage, res: ServerResponse) => void>;
}
