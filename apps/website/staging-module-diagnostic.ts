// Never copy runtime error text (which can include paths or credentials) to logs.
export function previewModuleDiagnostic(error: unknown): string {
  const prefix = "unibos.preview.init.ADAPTER_MODULE";
  if (!error || typeof error !== "object" || !("code" in error)) return prefix;
  if (error.code === "ERR_REQUIRE_ESM") return prefix + ".ESM";
  if (error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED") return prefix + ".EXPORT";
  if (
    error.code !== "MODULE_NOT_FOUND" &&
    error.code !== "ERR_MODULE_NOT_FOUND"
  )
    return prefix;
  const text = error instanceof Error ? error.message : "";
  const missing = /Cannot find (?:module|package) ['"]([^'"]+)['"]/.exec(
    text,
  )?.[1];
  switch (missing) {
    case "pg":
      return prefix + ".PG";
    case "redis":
      return prefix + ".REDIS";
    case "express":
      return prefix + ".EXPRESS";
    case "@nestjs/core":
      return prefix + ".NEST";
    case "@nestjs/platform-express":
      return prefix + ".NEST_EXPRESS";
    case "better-auth":
      return prefix + ".AUTH";
    case "reflect-metadata":
      return prefix + ".METADATA";
    case "@unibos/api/dist/staging.js":
      return prefix + ".WORKSPACE_API";
    default:
      return prefix + ".MISSING";
  }
}
