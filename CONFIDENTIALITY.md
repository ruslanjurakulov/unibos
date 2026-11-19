# UniBOS confidentiality policy

Owner-approved requirement: this repository must remain private. Never change visibility, publish source or internal documents, deploy publicly, or share proprietary materials without explicit owner approval. Use least privilege, MFA, separate credentials and infrastructure from Nightshift, and never commit secrets or customer data. Treat external integrations as trust boundaries. Report suspected disclosure immediately. Verify repository visibility before every upload.

## Owner-authorized temporary exception —2026-11-15
The owner explicitly authorized temporary Public repository visibility while building the engineering foundation, followed by a return to Private. Secret/customer-data disclosure, paid operations and Nightshift access remained unauthorized. Verify actual visibility before uploads and restore Private after the authorized work. See docs/P1_FOUNDATION.md.
This exception ends after the P1 foundation's post-merge verification and restoration to Private. It does not authorize returning to Public for later phases without fresh owner approval.

## Owner-authorized P2 exception —2026-11-15
The owner explicitly authorized temporary Public work for P2. The P2 authorization did not cover P3. Restore Private after each approved phase if administration access permits. The prior restoration request returned GitHub403; report any remaining blocker accurately. See docs/P2_SECURITY.md.

## Owner-authorized P3 and Vercel preview — 2026-11-15
The owner explicitly authorized temporary Public source work for P3 and requested a Vercel project and deployment, with a later migration to the owner's server when the product is ready. Current deploy scope is the UniBOS website preview on the existing Vercel Hobby account: no paid plan or resource, custom domain, production authentication/backend, customer data, payment, Nightshift, or migration to the server. The preview must keep authentication disabled unless an independently reviewed HTTPS API origin is configured. This authorization is not permission to claim the whole product is production-ready. Restore GitHub Private visibility after the approved public work if administration access permits; an owner action is required if the integration remains unable to change visibility.
