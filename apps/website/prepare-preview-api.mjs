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
}
