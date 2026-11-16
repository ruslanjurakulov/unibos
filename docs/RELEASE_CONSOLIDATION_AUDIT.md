# UniBOS Release Consolidation Audit

Date: 2026-11-16

## Executive status

This audit prepared the P3–P4.4 consolidation and stopped before any merge. The current functional candidate is P4 commit `a86601bcd99e098ebcf11b4b8786965f089f6225`; the final audit-document commit is documentation-only. PRs #4, #6 and #5 remain open. `main` remains at `b1e6a75c9beec77ab2ab744a3367caceae409b1f`.

The `main`-branch deployment exclusion is included in PR #4 and was accepted by Vercel while a Preview deployment remained available. Vercel documents that `git.deploymentEnabled` branch rules prevent automatic Git deployments for matching branches, with unspecified branches enabled by default. No `main` push, merge, or production deployment was used to test this rule. It becomes active on `main` only when PR #4 is merged.

Two owner decisions remain before treating the entire release as ready: the repository is currently Public despite the repository confidentiality policy, and integrated catalog management UI work remains uncommitted in another worktree. This audit did not change repository visibility or touch that worktree.

## Initial and current GitHub state

### Initial state observed at Gate 0

| Item                  | State                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `main`                | `b1e6a75c9beec77ab2ab744a3367caceae409b1f`                                                        |
| PR #4 / P3            | Open; base `main`; head `80257b46ebec29c9501473c2e8aac86ce0549838`; mergeable                     |
| PR #6 / P4            | Open; base `feat/p3-website-preview`; head `4fc51e102d0e25c76d24148da8cfee5f6a8d56f6`; mergeable  |
| PR #5 / P4.7 roadmap  | Open draft; base `feat/p3-website-preview`; head `1062be2c14cdd732619a6c0bcbeb98ada46f4999`       |
| Branch comparisons    | `main → P3`: 16 ahead / 0 behind; `P3 → P4`: 14 ahead / 0 behind; `P3 → P4.7`: 1 ahead / 0 behind |
| Repository visibility | Public                                                                                            |

### Current state after safety and QA updates

| PR              | Current head                               | Base                      | GitHub status                                   |
| --------------- | ------------------------------------------ | ------------------------- | ----------------------------------------------- |
| #4 P3           | `0a7528a45d4ee85ff2ef624c3a4baf8051d3752a` | `main`                    | Open, non-draft, clean/mergeable                |
| #6 P4           | `a86601bcd99e098ebcf11b4b8786965f089f6225` | `feat/p3-website-preview` | Open, non-draft, clean/mergeable                |
| #5 P4.7 roadmap | `1062be2c14cdd732619a6c0bcbeb98ada46f4999` | `feat/p3-website-preview` | Open draft, clean/mergeable, documentation only |

Current comparisons: `main → P3` is 17 ahead / 0 behind; `P3 → P4` is 15 ahead / 1 behind; `P3 → P4.7` is 1 ahead / 1 behind. The one-commit base lag is the `vercel.json` safety commit added to P3. A local `git merge-tree` of P3 and P4 completed without conflicts. This is a conflict check only, not a merge.

GitHub reports PR #4 and #6 as clean/mergeable after checks completed. PR #5 is still a draft and should remain separate. Querying `main` branch protection returned HTTP 403 (`Resource not accessible by integration`), so required branch rules and mandatory-check settings could not be independently inspected. The PR checks themselves were visible and passed.

The repository is Public, while `CONFIDENTIALITY.md` says UniBOS source should remain Private and this task prohibits visibility changes. No visibility change was attempted. Owner action is needed to resolve that policy/state mismatch.

## GitHub automation and merge behavior

The repository has two GitHub Actions workflows: `engineering.yml` and `brand-audit.yml`. Both run on pull requests and on pushes to `main`; neither contains a deployment or release step. Vercel is separately connected to the GitHub repository, so absence of a GitHub deploy workflow does not disable Vercel's native Git deployment.

The engineering workflow runs format, lint, typecheck, unit tests, build, secret check, dependency audit, local disposable infrastructure, database migration/integration/security tests, and smoke tests. It does not promote deployments or run production migrations.

## Vercel audit and safety rule

Project `unibos` (`prj_PvQoV4lu1LILIBB88iBvK9JmoNLB`) is linked to `ruslanjurakulov/unibos` in the `ruslanjurakulov9-1482` team on the Hobby plan. The project reports `live: false`; filtered project environment-variable listing returned zero variables. `unibos.vercel.app` is a verified project domain. No project domains, aliases, environment variables, or hosting settings were changed.

Vercel deployment history contains a failed production-target deployment from `main`: deployment `dpl_55kL3G3scCgZvF8iLuHXTRyWcSei`, commit `b1e6a75c9beec77ab2ab744a3367caceae409b1f`, state `ERROR`. This confirms that a `main` update can initiate a production-target deployment. The failure does not establish that future builds will fail. No READY production deployment was found in the filtered production history.

### Applied, narrow, reversible protection

PR #4 adds root `vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "git": {
    "deploymentEnabled": {
      "main": false
    }
  }
}
```

Official Vercel documentation: <https://vercel.com/docs/project-configuration/git-configuration>. It defines branch-specific `git.deploymentEnabled` rules and says unspecified branches default to enabled. The setting is limited to automatic Git deployment from `main`; feature branches remain eligible for Preview deployments. Reversal is to remove the `main` mapping or set it to `true` in a reviewed change.

Vercel build events for PR #4 showed project entrypoint `.` (repository root), confirming the configuration file is at the linked project's root. On PR #4 commit `0a7528a45d4ee85ff2ef624c3a4baf8051d3752a`, Vercel produced Preview deployment `dpl_42FsEQZ3hmvMiEfSdKUXXwtsJpr2` at `https://unibos-fkl4xoufe-ruslanjurakulov9-1482.vercel.app/`, state READY, target Preview (`target: null`); the homepage returned HTTP 200. Thus Preview remained available and Vercel accepted the configuration.

The rule's documented `main` exclusion has not been exercised by a push or merge to `main`. No production-target test was performed. The rule will be present in `main` only after PR #4 is merged; keep PR #4 as the first merge in any approved sequence.

PR #6's latest code Preview is deployment `dpl_45Eyw6HPpfP66jvir4VpPyyKEgkf`, commit `a86601bcd99e098ebcf11b4b8786965f089f6225`, state READY and target Preview. Its homepage and `/dashboard/payments` both returned HTTP 200. The website is frontend-only in Vercel; it has no connected NestJS API or PostgreSQL backend.

## P3–P4.4 functional and test audit

### P3 marketing, demos, navigation, and motion

The P3 PR contains the marketing routes, brand assets, guest demo, language/theme variants, responsive layout, and motion system. P4 adds the Demo Hub with seven implemented demo destinations. P3 Preview and PR #6 Preview both built successfully.

Local browser checks against the production build passed for:

- Guest cart, quantities, totals, removal, keyboard behavior, and pricing preview.
- Motion/reduced-motion behavior, keyboard flow, dashboard typography, and 12 page motion checks. The P4 run measured lab-only mobile/desktop timing; these measurements are not real-user INP.
- Solutions page: 30 locale/theme/viewport states and 30 reduced-motion states.
- Demo Hub localization, seven demo entries, browser history, route links, mobile menu focus/Escape, and 23 routes returning HTTP 200 with no overflow across seven widths.
- Synthetic cashier → kitchen → waiter workflow across 320, 390, 768, 1024, 1366, 1440, and 1920px.

The first combined browser run found stale assertions expecting six demos and three motion cards. The Hub currently has seven cards, including Finance. Tests were corrected to check all available cards and all seven destinations; reruns passed.

### P4.1 catalog and tables

The PR #6 branch includes organization/branch-scoped catalog and table APIs, migration `003-restaurant-catalog-tables.sql`, catalog/price/availability/table/QR-token authorization, FORCE RLS, composite foreign keys, and integration tests. `/demo/operations` includes a synthetic catalog/table/QR workflow.

The authenticated owner catalog management screen is not in PR #6. A separate `feat/p4-menu-catalog` worktree has uncommitted `/dashboard/menu` work and `003-menu-catalog.sql`; it was not modified or staged. This is related to the known migration lineage collision. Decide whether that integrated UI is required for this consolidation before claiming P4.1 UI completeness.

### P4.2–P4.4 operations

The PR #6 branch contains canonical cashier orders and immutable price snapshots; waiter/KDS tickets and order additions; branch-scoped workspace capabilities; cash shifts and internal cash payment recording; transaction history and reconciliation. It does not connect Vercel to a real API, PostgreSQL, payment provider, or fiscal service.

The latest P4 browser reruns passed for navigation and route discovery (23 routes and seven viewports), workspace capability navigation, synthetic shifts, cash-payment UX, and transaction-history retry/reconciliation UX. The pending-payment unknown-result view previously duplicated its message; it now shows the message once while preserving the same idempotency key for safe retry.

## Migration integrity and database preservation

The PR #6 migration sequence is `001` through `007`, with unique identifiers:

1. `001-business-security.sql`
2. `002-audit-permission-details.sql`
3. `003-restaurant-catalog-tables.sql`
4. `004-unified-orders.sql`
5. `005-kitchen-operations.sql`
6. `006-cash-shifts.sql`
7. `007-cash-payments.sql`

The security integration suite creates a new random local disposable database, applies the migration sequence twice, checks RLS/tenant/branch isolation and checksum fail-closed behavior, then drops only that disposable database. The P4.4 checks include concurrent payment attempts, duplicate/idempotent behavior, ledger entries, reconciliation, closed-shift rejection, and tenant isolation. These tests passed.

The persistent local volume remains unresolved and untouched. Its `unibos-business-003` ledger digest belongs to the other worktree's uncommitted `003-menu-catalog.sql`, while PR #6 uses `003-restaurant-catalog-tables.sql`. No persistent data, ledger, checksum, or migration file was edited by this audit. A clean disposable database passing does not repair the persistent volume or prove production migration readiness.

## Verification evidence

On the P4 code candidate, `npm test` and `npm run test:security` passed before the final UI-only duplicate-message change. After that UI change, typecheck, lint, format check, production build, and focused browser reruns passed locally. GitHub then ran the full Engineering workflow against the exact code commit `a86601bcd99e098ebcf11b4b8786965f089f6225` and passed.

| Command/check                  | Result                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `npm run format:check`         | PASS                                                                                                               |
| `npm run lint`                 | PASS                                                                                                               |
| `npm run typecheck`            | PASS                                                                                                               |
| `npm test`                     | PASS — 23 tests: runtime 6, database 3, security 3, API 11                                                         |
| `npm run test:security`        | PASS — disposable PostgreSQL 13/13; HTTP identity/MFA/tenant security 19/19                                        |
| `npm run build`                | PASS — Next.js production build, 28 routes                                                                         |
| `npm run test:smoke`           | PASS — local API/database/Redis readiness and safe failure behavior                                                |
| `npm run security:secrets`     | PASS for known patterns and locally available secret values; not a comprehensive secret audit                      |
| `npm audit --audit-level=high` | PASS — zero reported vulnerabilities                                                                               |
| Focused Chromium browser suite | PASS after updating stale route/card assertions and removing duplicate pending message                             |
| Accessibility                  | Targeted keyboard, focus, control-name, and reduced-motion assertions passed; no separate axe/WCAG scanner was run |

GitHub CI on P4 code SHA `a86601bcd99e098ebcf11b4b8786965f089f6225`: Engineering `verify` PASS; `brand-static` PASS; Vercel Preview PASS. P3 safety commit `0a7528a45d4ee85ff2ef624c3a4baf8051d3752a` also has Engineering, Brand Audit, and Vercel Preview PASS.

## Merge sequence and final gate

Recommended order remains:

1. PR #4 P3 → `main`; its head now carries the `main` deployment exclusion.
2. Rebase/update PR #6 against the new `main`, rerun CI and Preview on the exact candidate, then merge only after a separate owner approval.
3. Retarget PR #5's documentation-only roadmap to the updated `main`, recheck it, and merge only after separate owner approval.

No PR was merged. No force-push or history rewrite occurred. PR #5 remains a draft. No P4.5 branch was created.

The repository is still Public; branch-protection details remain inaccessible to this integration; the P4.1 authenticated catalog UI and persistent database lineage need owner resolution. These are explicit review items, not successful gates. The owner must approve each intended merge after reviewing them. A request to audit or prepare is not treated as merge approval.

## Explicit non-actions

No `main` push, merge, production deployment/promotion, production database migration, payment/refund/fiscal action, paid infrastructure, DNS/domain change, repository visibility change, destructive database action, or Nightshift operation occurred.
