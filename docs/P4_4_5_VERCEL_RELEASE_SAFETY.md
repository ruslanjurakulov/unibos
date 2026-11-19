# P4.4.5 Vercel Release Safety

## Current project state

- Project: `unibos` (`prj_PvQoV4lu1LILIBB88iBvK9JmoNLB`), linked to GitHub `ruslanjurakulov/unibos`.
- Team plan: Hobby. Project `live` is false.
- Production domain remains registered on the project; no aliases or DNS settings were changed.
- No Vercel project environment variables were listed (including zero hidden production variables).
- The current repository workflows run Engineering and Brand Audit CI. They do not perform a production deployment; Vercel Git integration acts separately.
- The only recorded production deployment was from `main` SHA `b1e6a75c9beec77ab2ab744a3367caceae409b1f`; it is `ERROR`. This does not prove future production attempts will fail.

## Controls

| Control                                                   | Status                         | Evidence / limitation                                                                                                                                                                                                                                                |
| --------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preview branch deployment                                 | VERIFIED                       | Existing P4 deployments use `target: null`; the new Preview result is recorded in the integration QA report.                                                                                                                                                         |
| Preview environment has no configured backend credentials | VERIFIED                       | Vercel project environment listing returned no visible variables and zero hidden production variables.                                                                                                                                                               |
| `vercel.json` branch exclusion for `main`                 | DOCUMENTED BUT NOT LIVE-TESTED | PR #4 contains `git.deploymentEnabled.main = false`; Vercel documentation says an exact false rule disables deployments from that branch and unspecified branches remain enabled. The rule has not been exercised on `main`.                                         |
| Production branch setting                                 | BLOCKED                        | Project detail response did not expose a verifiable production-branch value in the available integration response. No setting was changed.                                                                                                                           |
| Protection of direct/other production deploy paths        | BLOCKED                        | No main push, production deploy, or promotion test is permitted. Branch-protection endpoint was unavailable (GitHub API 403).                                                                                                                                        |
| Workflow separation                                       | VERIFIED                       | GitHub workflow inventory contains CI checks, not a production deployment job; native Vercel Git integration is separate.                                                                                                                                            |
| Rollback procedure                                        | DOCUMENTED                     | Disable the `main` rule only through reviewed Vercel/project configuration after owner approval; if an accidental production deployment appears, stop further merges and use Vercel's reviewed rollback controls with owner authorization. No rollback was executed. |

Official reference: [Vercel Git Configuration](https://vercel.com/docs/project-configuration/git-configuration). Vercel documents exact branch mapping and says unspecified branches are enabled by default.

## Merge gate

Production isolation is not live-verified. **NO-GO** for merging PR #4 or any dependent PR while `main` deployment behavior remains unverified. Do not test by pushing unfinished code to `main`, creating production deployment, promoting Preview, or altering domains. Owner must separately approve a safe production-control verification plan.
