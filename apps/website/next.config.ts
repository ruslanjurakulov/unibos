import type { NextConfig } from "next";

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
  env: {
    NEXT_PUBLIC_AUTH_CONFIGURED: String(
      Boolean(configuredApiOrigin()) || !process.env.VERCEL,
    ),
  },
  async rewrites() {
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
