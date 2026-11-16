# P4.4.5 Pre-Merge Readiness

Review date: 2026-11-17 (Asia/Tashkent)

## Delivery scope

- Active branch: `feat/p4-restaurant-operations`.
- PR: `https://github.com/ruslanjurakulov/unibos/pull/6`.
- PR #6 remains based on `feat/p3-website-preview`; preserve its dependency on PR #4.
- PR #4 and draft PR #5 are not modified by this P4.4.5 work.
- The separate dirty `feat/p4-menu-catalog` worktree and the persistent local PostgreSQL volume remain unchanged.
- No merge, production deployment, production migration, domain change, paid service, visibility change, or Nightshift change is authorized or performed.

## Local implementation and evidence

See `P4_4_5_BASELINE_AUDIT.md`, `P4_4_5_MIGRATION_RECONCILIATION.md`, `P4_4_5_CONFIDENTIALITY_REVIEW.md`, `P4_4_5_VERCEL_RELEASE_SAFETY.md`, and `P4_4_5_INTEGRATION_QA.md`.

The canonical P4 migration sequence remains unchanged. The catalog page and API use the canonical P4 schema. Real PostgreSQL security tests use disposable databases only. Unit, type, build, security, browser, secret-scan, and dependency-audit results are recorded in the QA report.

## Merge recommendation: NO-GO

The code review has no blocking implementation finding, but merge remains blocked by project-level controls:

1. `CONFIDENTIALITY.md` requires Private visibility while GitHub currently reports the repository Public. This task prohibits a visibility change; the owner must decide and authorize the required remedy.
2. Vercel's `main` deployment exclusion is present in PR #4 but has not been tested against a real `main` event. The Vercel production-branch setting could not be verified through the available project response.
3. GitHub branch protection could not be independently verified; the repository API returned HTTP 403 for that endpoint.
4. The persistent local database remains on the incompatible alternate migration lineage and must not be used for migration rehearsal or production migration.

Do not merge PR #4 or #6 until the owner resolves the visibility mismatch and approves a safe, non-production verification plan for production deployment controls. Do not validate the setting by pushing to `main`, promoting a Preview, or changing domains.

## Actions after local review

- Push the P4.4.5 commit to the existing P4 branch only after all local gates pass and confirm the exact remote SHA.
- Update PR #6 with the QA and migration-safety reports; keep PR #6 open and unmerged.
- Verify Engineering CI and Brand Audit on the exact pushed SHA.
- Create and inspect a Vercel **Preview** only. Record deployment ID, SHA, state, URL, and screenshot evidence in the QA report.
- If Preview is unavailable, fails, or exposes unexpected production configuration, stop and report it; do not promote or deploy to production.
