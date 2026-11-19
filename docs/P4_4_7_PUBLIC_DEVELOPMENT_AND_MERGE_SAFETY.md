# P4.4.7 Public Development and Merge Safety

Review date: 2026-11-17 (Asia/Tashkent)

## Current release decision (19 November 2026)

The owner authorized push and merge for the remaining plan. The `main` release still requires the repository controls in the plan. GitHub returned 403 when the integration attempted to activate ruleset `27314327`; a subsequent read showed `disabled`. The proposed rules preserve one approving review, require GitHub Actions jobs `verify` and `brand-static`, and disallow bypasses. No technical approval was recorded by that attempt.

PR #4 commit `59c7d3c17398447c8179e259757c1297b6cd7a89` installs the same `git.deploymentEnabled.main = false` in both the repository and `apps/website` roots. A separate feature branch tested the project-root rule with an enabled, disabled, enabled sequence. Both enabled commits produced Ready Previews (`dpl_7ButT7aRzVDZzJn4Sa3qHyCvPmbq`, `dpl_5zHJ5jjqdS3FerZH9vKkATYyD6Rv`); the disabled commit `c9615d9be73eda02c7ae895f2545cdb566a55e01` produced no deployment in the observation window. Manual production access remains a separate account setting.

Release controls and subsequent development can be integrated through reviewed PRs targeting the P4 feature branch while the `main` rule is pending. At release, verify the current base, CI, approvals and deployment configuration for each PR. The dated records below describe earlier branch tips and service availability.

## Decision and status

The owner has authorized the UniBOS repository to remain **Public until the product is ready**. This is a temporary, repository-specific development exception recorded in `CONFIDENTIALITY.md`. It ends before production customer onboarding or final commercial launch, whichever comes first. Private conversion remains a separate owner-approved task.

**Consolidation: NO-GO pending Gates A, B, and per-PR merge approvals.** No GitHub ruleset, Vercel production setting, PR base, or production target was changed. No PR was merged.

## 1. Current GitHub baseline

Repository: `ruslanjurakulov/unibos`; GitHub reports visibility `public`. The connected identity has `admin` permission. Default branch SHA: `b1e6a75c9beec77ab2ab744a3367caceae409b1f`.

| PR  | Scope                        | State                      | Base SHA                                                               | Head SHA                                                                           | Exact workflow checks                                             |
| --- | ---------------------------- | -------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| #4  | P3 website                   | Open, non-draft, mergeable | `main` / `b1e6a75c9beec77ab2ab744a3367caceae409b1f`                    | `feat/p3-website-preview` / `0a7528a45d4ee85ff2ef624c3a4baf8051d3752a`             | `verify` PASS (run 29); `brand-static` PASS (run 33); Vercel PASS |
| #6  | P4 operations through P4.4.5 | Open, non-draft, mergeable | `feat/p3-website-preview` / `80257b46ebec29c9501473c2e8aac86ce0549838` | `feat/p4-restaurant-operations` / `f1a23f2951505d9bc03222dcaae527bedf973d6a`       | `verify` PASS (run 34); `brand-static` PASS (run 38); Vercel PASS |
| #5  | P4.7 roadmap document        | Open, **draft**, mergeable | `feat/p3-website-preview` / `80257b46ebec29c9501473c2e8aac86ce0549838` | `docs/p47-restaurant-storefront-plan` / `1062be2c14cdd732619a6c0bcbeb98ada46f4999` | `verify` PASS (run 20); `brand-static` PASS (run 24); Vercel PASS |

The Engineering workflow job name is `verify`; the Brand Audit job name is `brand-static`. These exact successful check-run names were read from GitHub Actions runs for the PR head SHAs above. These checks are not currently enforced on `main`.

## 2. Public exception and confidentiality safeguards

**PASS — policy updated:** the existing confidentiality requirements and earlier phase exceptions remain intact. A new dated section documents the current Public development exception, its scope, prohibition on committing secrets/customer data, production restrictions, termination point, separate Private-transition approval, and mandatory historical exposure review. `AGENTS.md` now points agents to the scoped exception while retaining the prohibition on production deployment and unauthorized visibility changes.

**PASS — repo visibility:** GitHub currently reports Public, matching the owner's new decision. No visibility setting was changed.

**LIMITATION — secret audit:** the last scoped `npm run security:secrets` run passed on P4 SHA `f1a23f2951505d9bc03222dcaae527bedf973d6a`. The scanner is heuristic/current-tree coverage, not full Git-history analysis. The Vercel environment listing returned zero visible and zero hidden production variables. No full-history scanner or credential rotation review has been run. Do not claim there were never exposed credentials. Before launch, review repository history, Actions artifacts, PR content, logs, and deployment outputs; rotate every credential found in public history. No secret values belong in this document.

Public deployment URLs are separate from source visibility. The Vercel project reports password protection, SSO, and trusted-IP protection disabled; a deployed Preview can remain accessible even if the source later becomes Private. The current marketing response advertises `noindex`, which is not access control.

## 3. GitHub ruleset and branch-protection assessment

Current ruleset `main` (id `27314327`) targets the default branch but has `enforcement: disabled`. It currently contains:

- Block branch deletion.
- Block non-fast-forward updates.
- Require pull requests, one approving review, dismissal of stale approvals, and resolution of review threads.
- No bypass actors.
- **No required status-check rule.**

These rules are present but inactive while enforcement is disabled. The classic branch-protection endpoint returned HTTP 403, so classic protection is **BLOCKED / NOT TESTED**. The repository ruleset endpoint is readable and shows the disabled state.

### Plan and visibility compatibility

GitHub's current documentation says repository rulesets are available for public repositories on GitHub Free (and Free for organizations); private-repository availability requires Pro, Team, or Enterprise Cloud. Because UniBOS is Public, the documented plan floor does not block enabling this ruleset. The exact GitHub billing plan is not exposed in the repository metadata, but public visibility is sufficient for this ruleset feature. Sources: [GitHub ruleset availability and supported rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets), [managing rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets).

### Exact proposed `main` rules

After Gate A approval only, edit ruleset `main` with:

1. Enforcement `active`.
2. Required pull request before updating the default branch.
3. At least one approval; dismiss stale approvals; require review-thread resolution.
4. Required status checks, selected from the actual successful check runs: `verify` (Engineering foundation) and `brand-static` (Brand Audit), with GitHub Actions as expected source where the UI supports source selection.
5. Keep deletion and non-fast-forward protections.
6. Keep bypass actors empty so ordinary development has no bypass.

This would block direct unreviewed changes, force pushes, deletion, and merge while either check is missing/failed. It may require updating a PR branch against `main` if strict up-to-date checks are selected. Reversal: in Repository → Settings → Rules → Rulesets, switch enforcement back to Disabled or edit the specific rule. Do not apply or roll back without owner approval.

### Gate A — GitHub ruleset approval

**Current:** enforcement disabled, checks not required. **Proposed:** activate the existing `main` ruleset and require exact checks `verify` and `brand-static`, retaining review and non-fast-forward/deletion rules. **Impact:** unreviewed direct updates and merges without both successful checks will be blocked; PR updates may be needed to meet strict check policy. **Rollback:** disable enforcement or remove the added check rules through the same ruleset UI. **No change has been made.** Wait for explicit owner approval before applying.

## 4. Vercel production isolation

Project `unibos`, ID `prj_PvQoV4lu1LILIBB88iBvK9JmoNLB`, is linked to GitHub `ruslanjurakulov/unibos`. Team plan is Hobby per the previously verified project audit. Latest deployment: `dpl_9Bhm2jJNqRXREyVFhms3iPW7zHBf`, branch `feat/p4-restaurant-operations`, SHA `f1a23f2951505d9bc03222dcaae527bedf973d6a`, READY, Preview target (`target: null`). URL: https://unibos-9d7kzyz49-ruslanjurakulov9-1482.vercel.app/ . A read-only HTTP fetch returned 200. The Preview is a frontend demo with no deployed NestJS API/PostgreSQL backend. Vercel reports `live: false`; project environment listing has zero variables, including hidden production variables. `unibos.vercel.app` is verified on the project domain list.

Production deployment history has one reviewed record: `dpl_55kL3G3scCgZvF8iLuHXTRyWcSei`, target `production`, from `main` SHA `b1e6a75c9beec77ab2ab744a3367caceae409b1f`, state ERROR. This proves `main` previously initiated a production-target deployment; it does not prove future builds will fail. No READY production deployment was found in the inspected history.

The `vercel.json` rule exists at the root of PR #4 and its branch exclusion passed Preview validation while other feature-branch Preview deployments remained available. Vercel documents that `git.deploymentEnabled` maps branch names to booleans, with unspecified branches enabled by default; an exact false rule disables automatic Git deployments for that branch. It does not block manual CLI/API production deployments or explicit promotion. Source: [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration).

The Vercel project response does not expose the configured Production Branch, automatic domain assignment, or deploy actor permissions: **NOT TESTED**. Prior release audit evidence says the linked Vercel project uses repository root `.` and has no GitHub Actions production deployment workflow. Current workflows were rechecked; neither contains a deployment step. Vercel's GitHub integration separately builds branches and the production branch. A deployment to Production Branch is automatically production; other branches are Preview. Source: [Deploying Git repositories with Vercel](https://vercel.com/docs/git).

### Hobby/private-repository limit (future launch planning)

The owner has deliberately chosen to keep this repository Public during development, so no private transition or private-repository deployment test is appropriate now. Vercel documents that Hobby does **not** support collaboration for private repositories; under a Hobby team, the commit author must be the Hobby owner. If the final Private transition must retain deployments by multiple contributors, Pro would be required, which is a paid-plan decision and is not authorized here. If only the owner authors/deploys commits, test that exact path after a separate Private-transition approval; do not assume the integration will keep working. Source: [Vercel project collaboration troubleshooting](https://vercel.com/docs/deployments/troubleshoot-project-collaboration).

### Gate B — Vercel setting approval

**Current behavior:** feature-branch pushes create Preview deployments; a prior `main` event created a failed Production-target build. The `main: false` repo rule will suppress automatic Git deployments from `main` once present in the deployed source, but it has not been exercised on `main`. It will not block manual/API deploys or promotion. **Proposed control:** after explicit owner approval, set the Vercel Production Branch to a dedicated protected release branch; retain `main: false`; continue Preview deployments for PR feature branches; do not store production deploy tokens in CI; restrict production deploy/promote access to the owner. Verify the setting in Vercel UI and rollback instructions before saving. **Preview impact:** the Git branch rule leaves unspecified feature branches enabled; a distinct production branch leaves other branches as Previews. **Rollback:** restore the prior Production Branch in Vercel Environment settings and revert the reviewed `vercel.json` mapping in a feature PR. This reduces accidental Git-triggered releases but is not a universal technical barrier to owner-operated CLI/API production deploys. No project settings changed; exact approval required before any modification.

## 5. P3–P4.4.5 completeness and migration safety

The current PR #4/#6 branch contents and earlier P4.4.5 audit describe these implemented areas: P3 marketing/Demo Hub; catalog UI; cashier POS; waiter and kitchen workspaces; verified workspace capabilities; cash shifts; internal cash recording; transaction history and reconciliation; navigation, localization, Auth/MFA/RLS; order/payment idempotency and concurrency. The current verification confirms the branches and their CI results, not a new end-to-end product re-audit. No feature was changed in this task.

Canonical migrations remain `001-business-security.sql` through `007-cash-payments.sql`, including `003-restaurant-catalog-tables.sql`. Preserve the persistent local PostgreSQL volume: its `unibos-business-003` ledger belongs to the separate `feat/p4-menu-catalog` lineage. Do not rewrite checksums, delete volumes, drop tables, or run production migrations. Use only disposable PostgreSQL databases for regressions. The separate dirty menu worktree remains untouched.

## 6. Merge dependency graph and readiness

```text
main @ b1e6a75
  └─ PR #4 P3 @ 0a7528a (first; introduces main Git-deployment exclusion)
       └─ update PR #6 base to resulting main; reverify P4 @ f1a23f2 (second)
  └─ PR #5 roadmap @ 1062be2 (third only after separate draft/content review)
```

| PR  | Readiness   | Remaining before merge                                                                                                                                                   |
| --- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #4  | **BLOCKED** | Gate A (ruleset activation) and Gate B (Vercel release strategy) approval; current head CI/Preview pass, but enforcement and production setting are not active/verified. |
| #6  | **BLOCKED** | #4 dependency; update its base after #4, inspect complete diff/migration sequence and rerun full gates on the exact candidate SHA; then separate approval.               |
| #5  | **BLOCKED** | Still draft; review its document scope and consistency, retarget to current `main` after #4, run checks, then separate approval.                                         |

The branches currently report mergeable, but #6 and #5 are based on older P3 SHA `80257b46…`. A local read-only merge-tree simulation of current P3 and P4 produced tree `dc4d71ac77267965124f9c900108de6e33995963` without conflicts. This is not a merge commit SHA. Expected resulting commit IDs depend on the chosen merge method and must be verified after each separately approved merge.

Recommended sequence: (1) approve and activate GitHub `main` protections; (2) approve and apply Vercel release isolation; (3) obtain separate PR #4 approval, merge it, then verify exact main SHA/CI/deployment history; (4) update PR #6 base and run complete regressions, seek separate approval, merge and verify; (5) keep PR #5 draft until its separate review and approval. Approval of one PR never authorizes another.

## 7. Verification record

| Verification                                    | SHA / reference                            | Result                                                     |
| ----------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------- |
| PR #4 Engineering `verify` run 29               | `0a7528a45d4ee85ff2ef624c3a4baf8051d3752a` | PASS                                                       |
| PR #4 Brand `brand-static` run 33               | `0a7528a45d4ee85ff2ef624c3a4baf8051d3752a` | PASS                                                       |
| PR #4 Vercel Preview check                      | `0a7528a45d4ee85ff2ef624c3a4baf8051d3752a` | PASS                                                       |
| PR #6 Engineering `verify` run 34               | `f1a23f2951505d9bc03222dcaae527bedf973d6a` | PASS                                                       |
| PR #6 Brand `brand-static` run 38               | `f1a23f2951505d9bc03222dcaae527bedf973d6a` | PASS                                                       |
| PR #6 Vercel Preview and HTTP fetch             | `f1a23f2951505d9bc03222dcaae527bedf973d6a` | PASS; READY / HTTP 200                                     |
| PR #5 Engineering `verify` run 20               | `1062be2c14cdd732619a6c0bcbeb98ada46f4999` | PASS                                                       |
| PR #5 Brand `brand-static` run 24               | `1062be2c14cdd732619a6c0bcbeb98ada46f4999` | PASS                                                       |
| PR #5 Vercel Preview check                      | `1062be2c14cdd732619a6c0bcbeb98ada46f4999` | PASS                                                       |
| `npm run security:secrets`                      | `f1a23f2951505d9bc03222dcaae527bedf973d6a` | PASS; heuristic/current-tree only                          |
| GitHub main ruleset                             | id `27314327`                              | FAIL as enforced protection: disabled; no required checks  |
| Classic branch protection endpoint              | `main`                                     | BLOCKED; 403 from GitHub integration                       |
| Private repo CI/Vercel behavior                 | N/A                                        | NOT TESTED; repo intentionally stays Public                |
| Production Branch, manual release permissions   | N/A                                        | NOT TESTED; project response does not expose settings      |
| Production deployment test                      | N/A                                        | NOT TESTED; no production event created                    |
| Full history secret audit / credential rotation | N/A                                        | NOT TESTED                                                 |
| Independent reviewer                            | N/A                                        | NOT TESTED; this review was performed by the primary agent |

The exact P3/P4/P4.7 SHA checks above predate this documentation change and do not attest to this new commit. Browser/responsive suites were not rerun because no application/UI code changed. No claim of live API/database integration is made.

Additional read-only Preview route checks on the same P4 deployment returned HTTP 200 for `/`, `/solutions`, `/demo`, `/demo/guest`, `/demo/operations`, `/demo/service`, `/demo/pos`, `/demo/workspace`, `/dashboard/menu`, `/dashboard/pos`, `/dashboard/waiter`, `/dashboard/kitchen`, `/dashboard/shifts`, and `/dashboard/payments`. An exploratory `/dashboard/transactions` request returned 404; that path is not an implemented route (payment/transaction history is under `/dashboard/payments`). These HTTP requests do not test interactive or responsive browser behavior.

The documentation branch was pushed as `e8e3c7a1cb007272a0e23dd8a8e41b7674acc10d`. Vercel created Preview `dpl_EwhZs5jbiTdiBmLTJWgUFqqgrsAQ` at https://unibos-jbxwsa8vb-ruslanjurakulov9-1482.vercel.app/ with `target: null`, exact matching branch/SHA, and READY status. HTTP route checks on this exact documentation Preview returned 200 for `/`, `/solutions`, `/demo`, `/demo/operations`, `/demo/pos`, `/dashboard/menu`, `/dashboard/pos`, `/dashboard/waiter`, `/dashboard/kitchen`, `/dashboard/shifts`, and `/dashboard/payments`. No production-target deployment was created. GitHub Actions returned no run for this documentation-branch push because the workflows trigger on pull requests or `main` pushes; no PR was opened.

This task's fresh full local regression was **BLOCKED** by disk exhaustion before tests could start: `df -h` reported the 7.9 GB overlay at 100%, 0 bytes available; inode use was 25%. Docker rejected creation of a new disposable PostgreSQL container with `no space left on device`. No test container was created and the existing `unibos-local-postgres-1` / `unibos-local-redis-1` containers and volumes were left untouched. A later Playwright launch for the seven-width browser matrix also stopped before the browser opened because creation of its temporary directory failed with `ENOSPC`. The isolated database/API/security tests, typecheck, unit tests, build, smoke test, dependency audit, and interactive/responsive browser matrix were therefore not run for this documentation branch. Existing P3/P4 CI results remain evidence only for their exact older application SHAs. Local `git diff --check`, application-source Prettier check, ESLint, and the heuristic secret scanner passed on the current source/docs working tree; Prettier reported formatting differences in `AGENTS.md`, `CONFIDENTIALITY.md`, and this new report. I did not rewrite these files while the filesystem was full. A separate attempt to free the ignored 280 MB Next.js build cache was rejected by the execution tool; no files were deleted.

## 10. Supplemental verification — 2026-11-18

This section supersedes the disk/formatting status above where newer evidence is available. After checking that `apps/website/.next` was ignored, generated, and confined to the P4 worktree, I removed that cache only. It freed 290,543,160 bytes; the overlay now has 151 MB free. The repository, `.git`, staged work, `.env*`, database volumes, screenshots, design references, and the separate dirty menu-catalog worktree were preserved. Docker-backed tests remain unavailable because `/var/run/docker.sock` is absent; this is a daemon-access blocker, not the former ENOSPC failure.

On the unchanged P4 application SHA `f1a23f2951505d9bc03222dcaae527bedf973d6a`, local format, lint, typecheck, unit/API tests (24 total), dependency audit (0 vulnerabilities), and heuristic current-tree secret scan passed. `npm run test:security` and `npm run test:smoke` could not run without Docker/PostgreSQL/Redis. These local results do not attest to later commits; GitHub checks below do.

The previous screenshot/responsive review found `/demo/operations` overflow at 320px. Fix `4d8320d309ca1d1680714796fdf65ba2efc18c53` wraps its header below 360px; that exact commit had Engineering run 35 and Brand Audit run 39 pass, and a READY Preview at `https://unibos-fqjr04don-ruslanjurakulov9-1482.vercel.app/`. A subsequent 84-case check across 12 routes and seven widths found the demo POS `/demo/pos` header still overflowed at 320px. Commit `92b0c71ce6da6f6607819d00152bab26d3c4dc71` fixes that narrow-screen layout. Local Chromium verified that POS route at 320, 390, 700, 768, 1024, 1440 and 1920px with HTTP 200 and no horizontal overflow; the 320px screenshot is `/workspace/work/p4.4-qa/pos-mobile-header-fixed.png`. On this final commit, Engineering run 36 and Brand Audit run 40 both passed. Vercel Preview `dpl_9Dz3foWhKuDsjvnAehoGHoaQ29Ze` is READY at `https://unibos-k32n1114h-ruslanjurakulov9-1482.vercel.app/`. Chromium then passed all 84 route/viewport checks (12 routes × 7 widths), with no horizontal overflow or uncaught page errors. The final 320px screenshot is `/workspace/work/p4.4-qa/pos-mobile-preview-final.png`.

The owner asked to carry out the recommended release-safety steps. An attempt to activate ruleset `27314327` with required checks `verify` and `brand-static` was rejected by GitHub (`403 Resource not accessible by integration`). A read-back confirmed enforcement remains `disabled`; no ruleset change was applied. The connected account can read the ruleset but its API integration cannot update it. The Vercel project settings tool does not expose the Production Branch field, so that setting was not modified. Existing `main` Git-deployment exclusion remains in PR #4 and is not active on `main` until that PR is approved and merged. No PR was merged, and no production deployment was created.

Prettier was run on the release-safety documentation after freeing space; the changed Markdown files pass formatting. The prior blocked disk and formatting observations above are retained as historical context, not as the current status.

## 8. Exact next approvals and actions

1. **Gate A:** owner approves activation of ruleset `main` with exact required check names `verify` and `brand-static`, one review, no bypass actors, deletion and non-fast-forward protections. No settings change before approval.
2. **Gate B:** owner approves changing Vercel Production Branch to a protected release branch and the accompanying access restrictions. Preview branches stay enabled; no production deployment is created for verification.
3. **PR #4:** owner approves exact head `0a7528a45d4ee85ff2ef624c3a4baf8051d3752a` separately.
4. **PR #6:** after #4, update its base, rerun all relevant CI/database/browser gates on the exact resulting SHA, then request separate approval.
5. **PR #5:** keep draft until reviewed and marked ready; then obtain separate approval for exact SHA `1062be2c14cdd732619a6c0bcbeb98ada46f4999`.
6. Before launch, perform the historical-public-exposure and credential-rotation review, and schedule the separately approved Private transition before customer onboarding or final commercial launch.

## 9. Actions not taken

Repository visibility remained Public. No ruleset or branch protection was edited. No Vercel production settings, domains, aliases, environment variables, or deployment targets were changed. No PR was retargeted or merged; no push to `main`, production deployment/promotion, production database migration, paid plan purchase, branch/worktree deletion, or Nightshift change occurred. The separate dirty `feat/p4-menu-catalog` worktree and persistent PostgreSQL volume were preserved.
