import { isBuiltin } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { stagingPreviewHost } from "./staging-preview.ts";

if (stagingPreviewHost(process.env)) {
  const cwd = fileURLToPath(new URL("../../", import.meta.url));
  for (const args of [
    ["run", "build:security"],
    ["run", "build", "--workspace", "@unibos/api"],
  ]) {
    execFileSync("npm", args, { cwd, stdio: "inherit" });
  }

  // Bundle from compiled JS to retain Nest decorator metadata. A single server module
  // travels with the Pages function, independent of workspace links on Vercel.
  const { build } = await import("esbuild");
  const result = await build({
    metafile: true,
    absWorkingDir: cwd,
    entryPoints: ["apps/api/dist/staging.js"],
    outfile: "apps/website/dist/preview-api.cjs",
    bundle: true,
    platform: "node",
    target: "node24",
    format: "cjs",
    keepNames: true,
    minifyWhitespace: true,
    minifySyntax: true,
    // These optional Nest features are not installed or used by the HTTP adapter.
    external: [
      "@nestjs/microservices",
      "@nestjs/websockets/*",
      "class-validator",
      "class-transformer",
    ],
  });

  // A hosted Pages function must never reach for a workspace package at runtime.
  // These are optional dependencies with tested fallbacks in our locked HTTP stack.
  const optional = new Set([
    "@nestjs/microservices",
    "@nestjs/microservices/microservices-module.js",
    "@nestjs/websockets/socket-module.js",
    "class-transformer",
    "class-validator",
    "pg-native",
    "@node-rs/xxhash",
    "supports-color",
  ]);
  for (const output of Object.values(result.metafile.outputs)) {
    for (const entry of output.imports) {
      if (entry.external && !isBuiltin(entry.path) && !optional.has(entry.path))
        throw new Error("Unexpected external dependency in Preview API bundle");
    }
  }
}
