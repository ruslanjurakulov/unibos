import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{50,}/,
  /AKIA[A-Z0-9]{16}/,
];
let failures = 0;
for (const file of new Set(files)) {
  if (/\.(?:png|pdf|zip|ico)$/.test(file)) continue;
  const text = await readFile(file, "utf8");
  if (patterns.some((pattern) => pattern.test(text))) {
    console.error(`Potential credential in ${file}; value redacted`);
    failures++;
  }
}
if (failures) process.exitCode = 1;
else
  console.log(
    "PASS: tracked/candidate text checked for known credential formats; not a comprehensive secret audit",
  );
