import { NextRequest, NextResponse } from "next/server.js";
import {
  admissionHeader,
  acceptsBasic,
  gatePassword,
  requiresStagingAdmission,
  signAdmission,
} from "./staging-admission.ts";
import { requestStagingOrigin } from "./staging-preview.ts";

function privateResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("CDN-Cache-Control", "no-store");
  response.headers.set("Vercel-CDN-Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export function proxy(request: NextRequest) {
  if (!requiresStagingAdmission(process.env)) return NextResponse.next();
  const origin = requestStagingOrigin(
    process.env,
    request.headers.get("host") ?? undefined,
  );
  const protocol =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.slice(0, -1);
  if (!origin || protocol !== "https")
    return privateResponse(new NextResponse(null, { status: 404 }));
  const password = gatePassword(process.env);
  if (!password)
    return privateResponse(new NextResponse(null, { status: 503 }));
  if (!acceptsBasic(request.headers.get("authorization"), password))
    return privateResponse(
      new NextResponse(null, {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="UniBOS staging", charset="UTF-8"',
        },
      }),
    );

  const headers = new Headers(request.headers);
  headers.delete("authorization");
  headers.delete(admissionHeader);
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const url = new URL(
      request.nextUrl.pathname + request.nextUrl.search,
      origin,
    );
    headers.set(admissionHeader, signAdmission(password, request.method, url));
  }
  return privateResponse(NextResponse.next({ request: { headers } }));
}

// Include HTML, static assets, framework data requests, and every API method.
export const config = { matcher: "/:path*" };
