// Only controlled labels may be printed. PostgreSQL details and driver messages can contain credentials.
const knownMessages = new Map([
  [
    "Dedicated staging maintenance process required",
    "MAINTENANCE_CONTEXT_REQUIRED",
  ],
  ["An approved direct Neon endpoint is required", "HOST_NOT_ALLOWED"],
  [
    "Staging migration connection does not match the designated target",
    "TARGET_MISMATCH",
  ],
  ["Restricted staging identity role required", "ROLE_NAME_MISMATCH"],
  ["Invalid synthetic identity settings", "INVALID_FIXTURE_SETTINGS"],
  ["Unsafe or busy staging target", "TARGET_UNSAFE_OR_BUSY"],
  ["Database contains unrelated identities", "UNRELATED_IDENTITIES"],
  ["Existing identity credentials differ", "CREDENTIAL_MISMATCH"],
  ["Unexpected test mailbox delivery", "UNEXPECTED_DELIVERY"],
  ["Synthetic verification was not delivered", "MISSING_DELIVERY"],
  ["Synthetic identity verification incomplete", "INCOMPLETE_VERIFICATION"],
]);
const driverCodes = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ENETUNREACH",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "CERT_HAS_EXPIRED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "ERR_MODULE_NOT_FOUND",
  "MODULE_NOT_FOUND",
  "ERR_MODULE_NOT_EXPORTED",
  "ERR_PACKAGE_PATH_NOT_EXPORTED",
  "ERR_INVALID_URL",
]);
function reason(error) {
  if (typeof error?.message === "string") {
    if (knownMessages.has(error.message))
      return knownMessages.get(error.message);
    if (
      /^AUTH_ROLE_(UNEXPECTED|ROLSUPER|ROLBYPASSRLS|ROLCREATEDB|ROLCREATEROLE|ROLINHERIT|ROLREPLICATION|OWNS_RELATIONS|OWNS_SCHEMAS|HAS_MEMBERSHIPS|CAN_CREATE_SCHEMA|CAN_CREATE_IN_PUBLIC|HAS_BUSINESS_GRANTS)$/.test(
        error.message,
      )
    )
      return error.message;
  }
  if (driverCodes.has(error?.code)) return error.code;
  if (
    typeof error?.severity === "string" &&
    typeof error?.code === "string" &&
    /^[A-Z0-9]{5}$/.test(error.code)
  )
    return `SQLSTATE_${error.code}`;
  if (
    typeof error?.message === "string" &&
    /timeout|timed out/i.test(error.message)
  )
    return "TIMEOUT";
  return "FAILED";
}
export class IdentityProvisionError extends Error {
  constructor(stage, error) {
    super(`stage=${stage} reason=${reason(error)}`);
  }
}
