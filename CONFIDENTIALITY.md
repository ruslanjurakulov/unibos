# UniBOS confidentiality policy

Owner-approved requirement: this repository must remain private. Never change visibility, publish source or internal documents, deploy publicly, or share proprietary materials without explicit owner approval. Use least privilege, MFA, separate credentials and infrastructure from Nightshift, and never commit secrets or customer data. Treat external integrations as trust boundaries. Report suspected disclosure immediately. Verify repository visibility before every upload.

## Owner-authorized temporary exception —2026-11-15
The owner explicitly authorized temporary Public repository visibility while building the engineering foundation, followed by a return to Private. Secret/customer-data disclosure, paid operations and Nightshift access remained unauthorized. Verify actual visibility before uploads and restore Private after the authorized work. See docs/P1_FOUNDATION.md.
This exception ends after the P1 foundation's post-merge verification and restoration to Private. It does not authorize returning to Public for later phases without fresh owner approval.

## Owner-authorized P2 exception —2026-11-15
The owner explicitly authorized temporary Public work for P2. The P2 authorization did not cover P3. Restore Private after each approved phase if administration access permits. The prior restoration request returned GitHub403; report any remaining blocker accurately. See docs/P2_SECURITY.md.

## Owner-authorized P3 and Vercel preview — 2026-11-15
The owner explicitly authorized temporary Public source work for P3 and requested a Vercel project and deployment, with a later migration to the owner's server when the product is ready. Current deploy scope is the UniBOS website preview on the existing Vercel Hobby account: no paid plan or resource, custom domain, production authentication/backend, customer data, payment, Nightshift, or migration to the server. The preview must keep authentication disabled unless an independently reviewed HTTPS API origin is configured. This authorization is not permission to claim the whole product is production-ready. Restore GitHub Private visibility after the approved public work if administration access permits; an owner action is required if the integration remains unable to change visibility.

## Owner-authorized temporary Public development exception — 2026-11-17

The owner explicitly authorizes the `ruslanjurakulov/unibos` repository to remain Public during continued UniBOS development, until the product is ready. This exception applies only to this repository and supersedes the earlier timing instruction to convert it to Private immediately after P3/P4 work. It does not weaken any other confidentiality or security requirement.

- Never commit credentials, tokens, private keys, real customer data, or proprietary third-party information.
- Public repository visibility does not authorize disclosure of private credentials, customer information, or unrelated materials.
- Production deployment, promotion, production database migration, real payments, and customer onboarding are not authorized by this exception.
- This exception ends before production customer onboarding or final commercial launch, whichever comes first.
- Converting the repository to Private requires a separate owner-approved operation. Do not change visibility without that approval.
- Review public source, Git history, pull requests, artifacts, and existing deployment URLs for historical exposure before launch. Rotate any credential found to have been exposed.
- Keep secret scanning enabled and report suspected disclosure promptly.

See `docs/P4_4_7_PUBLIC_DEVELOPMENT_AND_MERGE_SAFETY.md` for the current release-safety assessment. This exception does not authorize public production deployment or use of real customer data.
