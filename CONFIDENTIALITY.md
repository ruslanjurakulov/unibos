# UniBOS confidentiality policy

Owner-approved requirement: this repository must remain private. Never change visibility, publish source or internal documents, deploy publicly, or share proprietary materials without explicit owner approval. Use least privilege, MFA, separate credentials and infrastructure from Nightshift, and never commit secrets or customer data. Treat external integrations as trust boundaries. Report suspected disclosure immediately. Verify repository visibility before every upload.

## Owner-authorized temporary exception —2026-11-15
The owner explicitly authorized temporary Public repository visibility while building the engineering foundation, followed by a return to Private. This current session authorization overrides the earlier always-private rule for that limited period. Secret/customer-data disclosure, paid operations, Nightshift access and public application deployment remain unauthorized. Verify actual visibility before uploads and restore Private after foundation verification. See docs/P1_FOUNDATION.md.
This exception ends after the P1 foundation's post-merge verification and restoration to Private. It does not authorize returning to Public for later phases without fresh owner approval.

## Owner-authorized P2 exception —2026-11-15
The owner explicitly authorized temporary Public work for P2. This is fresh phase-specific authorization after the P1 exception; it does not authorize P3 Public work, deployment, secrets/customer-data disclosure, paid operations or Nightshift access. Restore Private after P2 verification if administration access permits. The prior restoration request returned GitHub403; report any remaining blocker accurately. See docs/P2_SECURITY.md.
