import { IdentityProvisionError } from "./staging-identity-diagnostic.mjs";
let stage = "dependencies";
try {
  const { provisionHostedIdentity } =
    await import("./staging-identity-flow.mjs");
  stage = "target-config";
  const result = await provisionHostedIdentity(process.env);
  console.log(
    `Synthetic staging identity ${result}. Complete authenticator enrollment in the protected browser.`,
  );
} catch (error) {
  const diagnostic =
    error instanceof IdentityProvisionError
      ? error
      : new IdentityProvisionError(stage, error);
  console.error(
    `Synthetic identity provisioning failed. ${diagnostic.message}`,
  );
  process.exitCode = 1;
}
