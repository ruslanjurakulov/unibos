import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { stagingBranch } from "./staging-preview.ts";

type Environment = Readonly<Record<string, string | undefined>>;
export const admissionHeader = "x-unibos-staging-admission";

export function requiresStagingAdmission(env: Environment) {
  if (env.VERCEL_ENV === "production") return false;
  return (
    env.UNIBOS_STAGING_API === "1" ||
    (env.VERCEL === "1" && env.VERCEL_GIT_COMMIT_REF === stagingBranch)
  );
}

export function gatePassword(env: Environment) {
  const value = env.UNIBOS_STAGING_GATE_PASSWORD;
  return value && value.length >= 48 ? value : undefined;
}

export function acceptsBasic(header: string | null, password: string) {
  const token = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header ?? "")?.[1];
  if (!token) return false;
  const expected = Buffer.from("unibos:" + password).toString("base64");
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(token), digest(expected));
}

function signature(password: string, time: number, method: string, url: URL) {
  return createHmac("sha256", password)
    .update(
      JSON.stringify([time, method, url.origin, url.pathname, url.search]),
    )
    .digest("hex");
}

// Only forward proof to the API. Nest must never receive the admission password.
export function signAdmission(
  password: string,
  method: string,
  url: URL,
  now = Date.now(),
) {
  return now + "." + signature(password, now, method, url);
}

export function validAdmission(
  value: string | undefined,
  password: string,
  method: string,
  url: URL,
  now = Date.now(),
) {
  const parts = /^(\d{13})\.([a-f0-9]{64})$/.exec(value ?? "");
  if (!parts) return false;
  const time = Number(parts[1]);
  if (time > now || now - time > 60_000) return false;
  return timingSafeEqual(
    Buffer.from(parts[2]!, "hex"),
    Buffer.from(signature(password, time, method, url), "hex"),
  );
}
