# Synthetic identities for protected staging

The maintenance tool supports `qa@unibos-staging.invalid` for automated QA and `owner@unibos-staging.invalid` for the owner's browser. Give each account its own password and authenticator. The `.invalid` addresses belong to a test mailbox held in process memory. Better Auth creates the password account and verifies its signed mailbox token through the library's normal verification endpoint. This verifies a synthetic mailbox for staging. A human email address requires a real delivery and verification flow.

## Windows maintenance setup

Use the reviewed source revision, Node 24 and npm 11 on the maintenance workstation. Run `npm ci` and `npm run build:security` from the repository root. Prepare the database as documented in [dedicated staging bootstrap](P4_6_NEON_BOOTSTRAP.md). Keep the public staging API in production runtime mode with `AUTH_ALLOW_SIGNUP=false`. Run the maintenance process outside Vercel in a fresh PowerShell session. It checks the approved direct Neon endpoint, the `unibos_staging` database and the restricted `unibos_auth` role. The presence of any other identity outside the two fixed addresses stops provisioning.

Choose the alias, save a unique random 24–128 character password in your password manager, and enter the following values at the prompts. The database URL must use the `unibos_auth` login, the direct endpoint hostname, `/unibos_staging`, and exactly `?sslmode=verify-full`. A maintenance or application database login is rejected.

```powershell
$env:UNIBOS_MAINTENANCE_TARGET = 'dedicated-neon-staging'
$env:UNIBOS_STAGING_NEON_HOST = Read-Host 'Dedicated direct Neon hostname'
$env:UNIBOS_SYNTHETIC_ALIAS = 'owner'
try {
  $env:UNIBOS_STAGING_AUTH_URL = [System.Net.NetworkCredential]::new('', (Read-Host 'Restricted auth database URL' -AsSecureString)).Password
  $env:UNIBOS_SYNTHETIC_PASSWORD = [System.Net.NetworkCredential]::new('', (Read-Host 'Synthetic account password' -AsSecureString)).Password
  node packages/security/scripts/staging-identity.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Synthetic identity setup failed' }
} finally {
  Remove-Item Env:\UNIBOS_SYNTHETIC_PASSWORD,Env:\UNIBOS_STAGING_AUTH_URL -ErrorAction SilentlyContinue
}
```

For the QA identity set the alias to `qa` and use its separate password. A repeated run with the original password preserves a verified account and finishes an interrupted verification. A different password stops the run. Provisioning creates no authenticated browser session, organization, membership, MFA factor or recovery code.

## Browser acceptance

1. Open `/sign-in` on the authenticated staging Preview. Complete its outer admission challenge and sign in with the synthetic address and password.
2. Enroll a TOTP authenticator in the normal **Protect your account** flow, enter a live code, and save the recovery codes privately. Keep setup keys, codes, cookies and admission credentials out of screenshots and logs.
3. In `/dashboard`, create a synthetic organization and its first branch. The server assigns the creator the owner membership. Open the catalog and owner analytics through the workspace navigation and verify that both display the selected branch.
4. Use a fresh browser context. Verify that the account requires its password and second factor. Confirm that the workspace opens with the same synthetic organization and branch. Record only the tested Preview revision, URL, outcome and non-sensitive screen state.
