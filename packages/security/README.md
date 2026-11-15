# Identity security boundary

Self-hosted Better Auth1.7.25 with PostgreSQL-backed identity/session/rate state, TOTP/recovery codes and session-bound recent-MFA assurance. No hosted account, manual password hashing, JWT issuer or external email integration. Runtime pool is unibos_auth; application/tenant privileges are forbidden. No request-time migrations.

Export createSecurity(config) supplies a bounded official Node handler, verified getIdentity(headers) and explicit close(). Trusted origins are exact, cookies HttpOnly/SameSiteLax/Secure in production, session cookie cache off, database counters atomic/shared, remembered devices disabled. Recent-MFA guards cover factor secret/recovery material as well as account security changes. Never infer assurance solely from user.twoFactorEnabled.

Root setup writes secrets only to ignored mode0600 environment files. root db:migrate applies official-planner auth001, manual assurance table and forward002 retention index before business migrations. The schema planner utility writes an ignored work/ preview; compare it and add forward migrations rather than overwriting applied snapshots. No production signup until verified email delivery is approved. Full tests/contracts/limitations: docs/P2_SECURITY.md.
