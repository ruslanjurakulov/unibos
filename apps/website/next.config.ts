import type { NextConfig } from "next";
import { resolve } from "node:path";
import { stagingPreviewHost } from "@unibos/website/staging-preview.ts";

const stagingRequested = process.env.UNIBOS_STAGING_API === "1";
const embedded = Boolean(stagingPreviewHost(process.env));

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

function configuredApiOrigin(): string | undefined {
  const configured = process.env.UNIBOS_API_ORIGIN;
  if (!configured) return undefined;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("UNIBOS_API_ORIGIN must be a valid origin URL");
  }
  const isOrigin =
    url.origin === configured &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash;
  const localHttp =
    !process.env.VERCEL &&
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!isOrigin || (url.protocol !== "https:" && !localHttp))
    throw new Error(
      "UNIBOS_API_ORIGIN must be an origin URL with HTTPS on Vercel",
    );
  return url.origin;
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Protected files must be fetched through the original authenticated browser request.
  ...(embedded && {
    images: { unoptimized: true },
    skipTrailingSlashRedirect: true,
  }),
  outputFileTracingRoot: resolve(__dirname, "../.."),
  turbopack: {
    resolveAlias: embedded
      ? {}
      : { "../../dist/preview-api.cjs": "./staging-disabled.ts" },
  },
  webpack(config, { isServer }) {
    if (config.cache && typeof config.cache === "object")
      config.cache.version =
        (config.cache.version ?? "") +
        (embedded ? "|embedded-api" : "|ordinary-website");
    if (embedded && isServer) {
      // esbuild already bundled the compiled Nest application and its dependencies.
      // Preserve Node's native built-ins inside the server-only Pages function.
      const existing = config.module.noParse;
      config.module.noParse = [
        ...(existing ? (Array.isArray(existing) ? existing : [existing]) : []),
        /[/\\]dist[/\\]preview-api\.cjs$/,
      ];
    } else {
      config.resolve.alias["../../dist/preview-api.cjs$"] = false;
    }
    return config;
  },
  env: {
    NEXT_PUBLIC_AUTH_CONFIGURED: String(
      stagingRequested
        ? embedded
        : Boolean(configuredApiOrigin()) || !process.env.VERCEL,
    ),
  },
  async rewrites() {
    if (stagingRequested) return [];
    const apiOrigin =
      configuredApiOrigin() ??
      (!process.env.VERCEL ? "http://127.0.0.1:3001" : undefined);
    if (!apiOrigin) return [];
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: contentSecurityPolicy },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "no-referrer" },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=()",
        },
      ],
    },
  ],
};

export default nextConfig;
