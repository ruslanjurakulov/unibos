# P4.4.5 Baseline Audit

Audit date: 2026-11-17 (Asia/Tashkent)

## Repository and pull requests

- Repository: `ruslanjurakulov/unibos`; default branch: `main`; observed visibility: **Public**.
- `main`: `b1e6a75c9beec77ab2ab744a3367caceae409b1f`.
- PR #4 / `feat/p3-website-preview`: `0a7528a45d4ee85ff2ef624c3a4baf8051d3752a`, open and mergeable.
- PR #6 / `feat/p4-restaurant-operations`: `82889c1ec43bcc96d48ffecc156b87914d4c7769`, open and mergeable at audit start; base is `feat/p3-website-preview`.
- PR #5 / `docs/p47-restaurant-storefront-plan`: `1062be2c14cdd732619a6c0bcbeb98ada46f4999`, open draft and mergeable at audit start.
- GitHub branch-protection endpoint returned HTTP 403; required branch rules could not be independently verified.

## Worktrees and preserved work

The active P4 worktree was clean at audit start. The separate `feat/p4-menu-catalog` worktree was dirty and contained the following changes. They were inspected read-only and preserved:

- Modified: `README.md`, `ROADMAP.md`, `apps/api/src/security-routes.ts`, `apps/website/app/dashboard/page.tsx`, `apps/website/app/globals.css`, `packages/database/README.md`, `packages/database/src/index.ts`, and `packages/database/test/isolation.integration.mjs`.
- Untracked: `apps/api/test/menu-routes.test.mjs`, `apps/website/app/dashboard/menu/page.tsx`, `docs/P4_MENU_CATALOG.md`, and `packages/database/migrations/003-menu-catalog.sql`.
- No active editor process targeting those paths was observed. No files were copied back into or changed in that worktree.
- The useful page structure and state-management ideas were reimplemented against P4's canonical API. The alternate migration, API routes, database package changes, CSS edits, and other dirty files were not imported.

## Architecture and release findings

- Canonical P4 business migrations are `001` through `007`. Their identifiers are unique in that sequence.
- The alternate `003-menu-catalog.sql` defines incompatible `menu_*` tables and cannot be combined by renaming or copying the file.
- `CONFIDENTIALITY.md` requires Private visibility, but the GitHub repository is Public. Visibility was not changed.
- Vercel project `unibos` is linked to this GitHub repository and is on the Hobby plan. The most recent deployment at audit start was a Preview (`target: null`). There are no listed project environment variables or hidden production variables.
- Vercel has one production deployment record, from `main`, in `ERROR` state. An earlier failure does not prove a future `main` deployment will fail.
- PR #4 includes a branch-specific `vercel.json` exclusion for `main`; this has not been exercised on `main`.
- The persistent local PostgreSQL volume is running. Its migration ledger and legacy `menu_*` table row counts were queried inside a read-only transaction; no database writes were made.

## Required cautions

- Preserve the `feat/p4-menu-catalog` worktree as the owner requested. Do not cherry-pick its conflicting `003` migration.
- Keep the P4 canonical lineage and validate it only in a disposable database.
- Do not merge while production deployment exclusion is only documented and not live-tested.
- Do not change repository visibility without explicit owner approval; changing to Private cannot retract copies already made while Public.
