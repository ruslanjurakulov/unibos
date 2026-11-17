# P4.4.6 Release Safety and Merge Plan

Review date: 2026-11-17 (Asia/Tashkent)

## Executive decision

**Overall: NO-GO for merging.** The PRs are open and currently reported mergeable, but repository visibility conflicts with the confidentiality policy, Vercel's production branch and direct production controls are not verifiable through the available project response, and GitHub's `main` ruleset is disabled. This review made no account or deployment changes.

The active P4 worktree was clean at `f1a23f2951505d9bc03222dcaae527bedf973d6a`. This report is being prepared on the isolated local branch `docs/p4-4-6-release-safety`. The separate dirty `feat/p4-menu-catalog` worktree was not changed.

## 1. GitHub baseline

Repository: `ruslanjurakulov/unibos`; default branch: `main`.

| PR  | Purpose               | State                      | Base (SHA)                                                             | Head (SHA)                                                                         | Current checks                                                |
| --- | --------------------- | -------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| #4  | P3 website            | Open, not draft, mergeable | `main` (`b1e6a75c9beec77ab2ab744a3367caceae409b1f`)                    | `feat/p3-website-preview` (`0a7528a45d4ee85ff2ef624c3a4baf8051d3752a`)             | Engineering run 29 PASS; Brand Audit run 33 PASS; Vercel PASS |
| #6  | P4 operations         | Open, not draft, mergeable | `feat/p3-website-preview` (`80257b46ebec29c9501473c2e8aac86ce0549838`) | `feat/p4-restaurant-operations` (`f1a23f2951505d9bc03222dcaae527bedf973d6a`)       | Engineering run 34 PASS; Brand Audit run 38 PASS; Vercel PASS |
| #5  | P4.7 roadmap document | Open, **draft**, mergeable | `feat/p3-website-preview` (`80257b46ebec29c9501473c2e8aac86ce0549838`) | `docs/p47-restaurant-storefront-plan` (`1062be2c14cdd732619a6c0bcbeb98ada46f4999`) | Engineering run 20 PASS; Brand Audit run 24 PASS; Vercel PASS |

The connected GitHub identity reports repository `admin` permission. This is not an authorization to change settings or merge. The ruleset API reports a `main` ruleset with enforcement **disabled**. Its configuration specifies one approving review and pull-request use, but disabled enforcement means those controls are not active. The ruleset has no required status-check entries. The branch-protection endpoint returned HTTP 403 (`Resource not accessible by integration`), so classic branch protection is **BLOCKED / NOT TESTED**.

The repository has two workflows: `Engineering foundation` and `Brand audit`. Both run for pull requests and pushes to `main`; neither contains a deployment step. Vercel Git integration is separate. Workflow runs passed at the exact PR head SHAs above, but these checks are not currently enforced by an active `main` ruleset.

The local graph shows 17 P3 commits ahead of `main`; PR #6 is based on an older P3 head and contains 20 commits not in the latest P3 branch. A read-only `git merge-tree --write-tree` simulation of current P3 and P4 produced tree `dc4d71ac77267965124f9c900108de6e33995963` without conflicts. This is a tree hash, not a commit SHA or a substitute for updating PR #6 and rerunning checks after PR #4. The eventual merge commit SHA depends on merge method and cannot be known in advance.

## 2. Repository privacy findings

**PASS — current state verified:** GitHub reports visibility `public`; the connected GitHub identity has admin permission. `CONFIDENTIALITY.md` says the repository must be private and limits temporary public exceptions to earlier phases. The repository is therefore in a policy-mismatched state.

**NOT TESTED — private transition effects:** No visibility change was made. Existing PR retention/access, GitHub Actions execution on a private repository, Vercel GitHub App access after privatization, and any required reauthorization must be verified after a separately approved transition. GitHub Actions are configured with ordinary repository checkout and `contents: read`; no Vercel credential or deployment step is present. Private-repository Actions availability and usage still depend on the owner's GitHub plan and quota.

**NOT TESTED — Hobby compatibility:** The project is linked to the GitHub repository and the team plan reported by prior project audit is Hobby. The current integration response does not expose the GitHub App installation's private-repository grant or prove that this exact Hobby project will continue fetching builds after the repository becomes private. Do not promise uninterrupted Preview builds until this is tested after Gate A. If access fails, reauthorize the existing Vercel GitHub integration for this repository; do not make the repository public again and do not upgrade or purchase anything without separate approval.

### Private transition procedure (owner action after Gate A)

1. In GitHub repository **Settings → General → Danger Zone → Change repository visibility**, select **Make private** and confirm as the owner.
2. Verify the repository API/UI reports `private`; verify all three PRs and authorized collaborators remain accessible.
3. Verify the GitHub App installation still grants Vercel access to this repository. Reauthorize only the existing Vercel Git integration if GitHub requests it.
4. Verify PR checks execute on a fresh authorized PR commit. If a Preview rebuild is needed, first confirm it is a Preview target and tied to the intended SHA; inspect it for READY and HTTP 200.
5. Verify no production deployment, domain change, or production database connection occurred.

There is no safe automatic rollback to Public. If integrations fail, retain Private, stop release actions, and repair the narrow integration permission. Returning to Public requires a new explicit owner approval; it cannot retract copies or caches made while the source was public.

## 3. Secret and exposure findings

**PASS — scoped current-tree scan:** `npm run security:secrets` on P4 SHA `f1a23f2951505d9bc03222dcaae527bedf973d6a` passed. The scanner checks tracked/candidate text for known credential formats and values available from local `.env` / `.env.runtime`, and redacts matches. No secret values were printed. The Vercel project environment listing returned zero visible variables and zero hidden production variables.

**LIMITATION:** this scanner explicitly is not a comprehensive history audit. No full Git-history secret scanner or credential-rotation inventory was run. No credential exposure was confirmed in this audit, but prior public source/history means exposure cannot be ruled out. If any credential was ever committed or otherwise public, rotate it at its provider and review its use; do not paste it into issues, PRs, or this report. A zero count of configured Vercel variables does not cover local machines or external providers.

The current Preview response includes `noindex, nofollow`, which is an indexing hint, not access control. Project password, SSO, and trusted-IP protection are reported disabled. Therefore source privacy does not make already-built deployment URLs private.

## 4. Vercel state and production deployment risk

Project: `unibos` (`prj_PvQoV4lu1LILIBB88iBvK9JmoNLB`), connected to `ruslanjurakulov/unibos`. Current project response: `live: false`; latest deployment is READY, Preview target (`target: null`), branch `feat/p4-restaurant-operations`, SHA `f1a23f2951505d9bc03222dcaae527bedf973d6a`, deployment `dpl_9Bhm2jJNqRXREyVFhms3iPW7zHBf`. URL: https://unibos-9d7kzyz49-ruslanjurakulov9-1482.vercel.app/ . A read-only fetch returned HTTP 200. This is a frontend Preview without the NestJS API or PostgreSQL backend.

The project domain list contains verified `unibos.vercel.app`. The latest project response does not expose the Production Branch value, automatic custom-domain assignment setting, or manual deployment permissions: **NOT TESTED**. Production deployment history contains one record: `dpl_55kL3G3scCgZvF8iLuHXTRyWcSei`, target `production`, from `main` SHA `b1e6a75c9beec77ab2ab744a3367caceae409b1f`, state `ERROR`. This proves a main-branch event previously initiated a production-target deployment; the error does not guarantee future production builds will fail. No READY production deployment was found in the reviewed list.

### `git.deploymentEnabled` behavior and scope

Official Vercel reference: https://vercel.com/docs/project-configuration/git-configuration . A branch-to-boolean map controls which branches trigger automatic **Git deployments**; unspecified branches default to enabled. A matching `false` disables Git deployment for that branch. PR #4 carries:

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

The rule has passed Preview validation on PR #4 while a Preview remained READY. It has **not** been exercised by a push/merge to `main`, and it only becomes part of `main` after PR #4 is merged. It controls automatic Vercel Git deployments for `main`; it does not establish a universal block on Vercel CLI/API deployments or promotion of an existing Preview. It also does not remove domains or protect public deployment URLs. Unspecified feature branches remain eligible for Preview deployments.

### Recommended reversible release isolation

1. Preserve the `main: false` Vercel Git rule in PR #4. Reversal is a reviewed change removing the mapping or setting it to `true`; do not test it by pushing to `main`.
2. Before a merge, have the owner inspect Vercel's Production Branch setting. Prefer a dedicated, protected release branch as the Production Branch, and keep `main` excluded from automatic Git deployment. PR feature branches should continue producing Preview deployments. This exact setting is not currently observable through the API response and must be confirmed in Vercel UI.
3. Have the owner review and enable the existing GitHub `main` ruleset with at least one approval and required checks `verify` and `brand-static`; it is currently disabled and contains no required-check rules. Verify the resulting enforcement in GitHub after approval.
4. Keep production deployment/promote credentials out of GitHub Actions. Limit who can issue direct Vercel production deployments or promotions. This is governance around direct/manual paths; the Git branch exclusion alone cannot block those paths.
5. Verify Preview behavior using an existing/authorized feature-branch Preview and inspect its deployment target. Do not create a production target or alias as a test.

**Expected effects:** `main` Git pushes should not automatically deploy while the exact `main: false` rule is active; other branches stay deployable as Previews. A protected release branch becomes the only Git branch intended to generate Production. Direct CLI/API production deployment and Preview promotion remain possible to authorized Vercel users, so the strategy depends on restricting those actors and credentials. This is reversible, but neither rule nor setting is applied or live-tested against `main` in this task.

## 5. Owner approval gates

### Gate A — repository visibility

Current state: **Public**. Required action: owner explicitly approves changing it to **Private**. Expected effects: source and future repository pages become access-controlled; authorized collaborators and PRs should remain, subject to permissions. GitHub Actions should remain configured but quota applies. Vercel private-repository access is not verified and may require reauthorization. Previously built public Preview URLs may remain publicly reachable. Rollback to Public requires separate approval and cannot undo prior copying/indexing.

**No visibility change has been made.** Stop here until explicit Gate A approval.

### Gate B — production protection

Proposed settings: preserve `git.deploymentEnabled.main=false` in PR #4; set Production Branch to a protected release branch; enable GitHub `main` ruleset with review and required checks; restrict manual production/promote access and do not store production deploy credentials in CI. Preview branches remain enabled. Rollback is a reviewed Vercel branch-setting change and/or a reviewed ruleset adjustment; do not temporarily disable protection to test it.

Limitations: project API does not show current Production Branch/auto-assignment; no `main` push or production test was made; branch-protection API returned 403; direct Vercel deployment/promotion remains an authorized-user path. Owner approval is required before changing Vercel production settings or GitHub ruleset enforcement.

### Gate C — each PR merge

Approval must identify one PR at a time and the exact current head SHA. Approval for PR #4 does not approve #6 or #5. Do not merge PR #5 while it remains draft.

## 6. Exact merge dependency plan

```text
main @ b1e6a75
  └─ PR #4 / P3 @ 0a7528a  (first; contains main Git-deployment exclusion)
       └─ update PR #6 base to the resulting main; verify P4 @ f1a23f2
            └─ PR #6 / P4 operations (second; preserve migrations 001–007)
       └─ separately review PR #5, leave draft until owner decides it is ready
            └─ update PR #5 base to resulting main; merge only with its own approval
```

Before PR #4: confirm Gate A and Gate B choices, exact head SHA, Engineering and Brand checks, Vercel Preview target, and review. Then obtain Gate C approval for #4. After merge, inspect the exact `main` SHA, CI, and Vercel behavior without assuming the branch exclusion worked. If a production-target deployment starts, stop further merges and ask the owner to use the reviewed Vercel controls.

Before PR #6: retarget/update it against the new `main`, inspect the resulting diff for P3 regressions or dropped P4 features, preserve migration lineage, rerun Engineering, Brand, and Preview checks on the exact final SHA, and obtain separate Gate C approval. Do not use the persistent PostgreSQL volume for rehearsal.

Before PR #5: separately review its single roadmap-document change, keep it a draft unless its author/owner marks it ready, retarget to the new `main`, rerun checks, and obtain separate Gate C approval. It remains independent and is not a P4 implementation dependency.

## 7. Database migration constraints

Keep canonical P4 migrations `001`–`007` unchanged. The persistent local PostgreSQL volume has the documented `unibos-business-003` collision with the separate `feat/p4-menu-catalog` migration lineage. The volume, ledger, tables, and dirty worktree were not accessed or changed for this review. Use only new disposable databases for regression tests. A clean disposable suite does not repair or validate the persistent volume. Any reconciliation or production migration requires a separate owner-approved plan with backup and recovery rehearsal.

## 8. Verification results and exact SHAs

| Check                                              | Exact SHA                                  | Result                                                          |
| -------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------- |
| P3 Engineering Foundation run 29                   | `0a7528a45d4ee85ff2ef624c3a4baf8051d3752a` | PASS                                                            |
| P3 Brand Audit run 33                              | `0a7528a45d4ee85ff2ef624c3a4baf8051d3752a` | PASS                                                            |
| P3 Vercel Preview status                           | `0a7528a45d4ee85ff2ef624c3a4baf8051d3752a` | PASS                                                            |
| P4 Engineering Foundation run 34                   | `f1a23f2951505d9bc03222dcaae527bedf973d6a` | PASS                                                            |
| P4 Brand Audit run 38                              | `f1a23f2951505d9bc03222dcaae527bedf973d6a` | PASS                                                            |
| P4 Vercel Preview status and HTTP fetch            | `f1a23f2951505d9bc03222dcaae527bedf973d6a` | PASS; READY, HTTP 200                                           |
| Roadmap Engineering run 20                         | `1062be2c14cdd732619a6c0bcbeb98ada46f4999` | PASS                                                            |
| Roadmap Brand Audit run 24                         | `1062be2c14cdd732619a6c0bcbeb98ada46f4999` | PASS                                                            |
| Roadmap Vercel Preview status                      | `1062be2c14cdd732619a6c0bcbeb98ada46f4999` | PASS                                                            |
| `npm run security:secrets`                         | `f1a23f2951505d9bc03222dcaae527bedf973d6a` | PASS, heuristic/current tree only                               |
| GitHub `main` branch protection                    | N/A                                        | BLOCKED (403); ruleset enforcement separately observed disabled |
| Private-repo Actions/Vercel test                   | N/A                                        | NOT TESTED; repo remains Public                                 |
| Vercel Production Branch and auto-assignment       | N/A                                        | NOT TESTED; not exposed in project response                     |
| Production deployment safety test                  | N/A                                        | NOT TESTED; no production event was created                     |
| Full Git-history secret scan / credential rotation | N/A                                        | NOT TESTED                                                      |

The earlier full P4 quality-gate results apply to the exact P4 implementation SHA above; this report does not rerun code suites because it adds documentation only. CI for this new documentation commit has not run locally or remotely. No test result is attributed to the new report SHA.

## 9. Exact next actions

1. Owner reviews this audit and explicitly resolves **Gate A** (Private transition) and **Gate B** (Vercel production isolation plus GitHub ruleset enforcement). Do not perform either change before approval.
2. If Gate A is approved, owner changes visibility to Private, then the authorized operator verifies PR access, GitHub Actions, Vercel integration, Preview readiness, and absence of production deployment. Do not revert to Public to troubleshoot.
3. If Gate B is approved, apply the reviewed Vercel Production Branch and GitHub ruleset settings, verify them in their respective dashboards, and record rollback details. Do not test by pushing to `main`.
4. Obtain separate Gate C approval for PR #4; merge only the approved SHA. Verify exact resulting `main`, CI, and deployment behavior.
5. Retarget/update PR #6, rerun checks, review migration and feature preservation, and ask for separate approval. Keep PR #5 draft and separate pending roadmap review and its own approval.

## 10. Actions not taken

No repository visibility change, PR merge, push to `main`, Vercel project/production-setting change, production deployment or promotion, domain/DNS change, production database migration, paid infrastructure purchase, branch/worktree deletion, or Nightshift operation occurred. Existing worktrees and migrations were preserved.
