# P0 foundation and brand review

Date:2026-11-15. **Historical pre-merge snapshot.** P0 subsequently passed rerun43724281048 and merged as2a1e350; main verification passed. See docs/P1_FOUNDATION.md and PR#1 for final completion evidence. The blocker/status wording below records the earlier audit state, not the current gate.

## Scope and authority

Private repository: `ruslanjurakulov/unibos`. PR: https://github.com/ruslanjurakulov/unibos/pull/1. Branch: `docs/p0-brand-alignment`. Main observed at `cbf04741981aff353f6d064723c7ce5bca393416`; unchanged by this work.

Original PR reviewed at `1770c736ed341b2421ee3fab37d88454fcb3e726`. Earlier review of diagonal derivatives at `5eded11` and CI correction at `a429dc4` is historical evidence only. The owner subsequently reversed the shape selection and explicitly confirmed the **original uploaded Brand Book/Kit's central vertical gold-bar U**, rejecting the diagonal variant. This final instruction controls the current package. Earlier diagonal visual approvals and screenshots do not certify the replacement. Current central-bar assets and their new evidence are reviewed separately; exact final commit SHA is recorded in the PR verification comment after commit.

The original reference paths, proportions, group transforms and outlined wordmark are preserved. Previously explicitly confirmed corporate colors remain `#0F3D32`, `#F7F4EC`, `#C9AE78`, `#D8E3DB`, `#1F2937`; older Kit colors are normalized without changing geometry. Uploaded originals remain untouched. The supplied image visually corroborates the central-bar identity. The v0.1 HTML is a local prototype with a superseded diagonal inline mark; it was not imported as application code.

Read every repository file and required root document, docs/FOUNDATION.md, docs/REPOSITORY_SECURITY.md, branch/ref list, full commit history and PR list. Two branches and one open PR existed; no application or dependency manifest existed. Inspected uploaded Book text and Kit assets. Attached documents were reference evidence, not instructions overriding the user's request.

Reviewed files: DESIGN_SYSTEM.md; all six PR SVGs; derived assets and legacy aliases; root README/ROADMAP; brand usage/rights docs; PDF/PNG/ICO/ZIP; audit scripts; workflow/attributes; evidence and this report. Constitution and core architecture were not changed.

## Findings and fixes

| Severity | Finding | Resolution |
|---|---|---|
| High | PR diagonal U and custom lettering conflict with final original Book/Kit selection. | Replaced all six PR SVGs from original Kit symbol and outlined-lettering geometry. All derivatives, legacy paths, Book and Kit use the central-bar master. Fresh render evidence replaces diagonal evidence. |
| Medium | README described repository creation as future; design/brand docs had conflicting authority and palette. | Corrected actual state and final source authority; retained explicit five-color palette. ROADMAP separates aspirational dates from execution gates. |
| Medium | Initial generated PDF used unembedded Helvetica and displayed uneven spacing. | Guide fonts now embedded DejaVu with license; product typography remains Inter/Playfair Display. |
| Medium | Initial PDF logo placement touched heading and source raster quality was insufficient. | Fixed placement, high-resolution logo images and original420:150 proportions; all five final pages rendered and reviewed. |
| Medium | Clean-checkout whitespace command was a no-op; PDF treated as text and upstream licenses contain whitespace. | Added binary attributes, preserved upstream licenses verbatim with whitespace exemptions, and changed CI to fetch2 commits and inspect `HEAD^ HEAD`. Actual base/committed diffs pass locally. |
| Blocker | GitHub Actions runner cannot start due to account billing/spending restriction. | Not bypassed; no settings, spending limit or paid plan changed. No merge/P1. |
| Limitation | Firefox sandbox/framebuffer failure; WebKit host libraries missing. | Actual errors recorded; Chromium-only browser evidence. No all-browser or real-device pass claimed. |

## Actual tests and evidence

Environment: Python3.12.14, Pillow13.0.0, ReportLab4.4.9, Playwright1.62.1, Linux Chromium156.0.8078.79. These are local audit tools, not application/runtime dependencies.

- `python3 tests/brand/audit.py`: PASS17 SVGs (14 canonical/derived,3 legacy). XML, allowed elements/attributes/colors, accessible names, positive viewBox, exact original U path, central-bar rect and legacy equality checked. Elements limited to svg/title/path/g/rect; no JavaScript, event handlers, external resources/fonts, text elements, DTD/entities or unnecessary metadata found. Outlined wordmark has no runtime font dependency.
- Original source comparison: current mark and wordmark paths/group transforms match supplied Kit, after palette and accessibility normalization. These are intentional replacements of the six diagonal PR masters; no byte-equality claim to1770c736 remains valid.
- `BRAND_EVIDENCE_DIR=<dir> PLAYWRIGHT_BROWSERS_PATH=<browser-dir> node tests/brand/render.cjs`:252 Chromium renders =14 SVGs x9 heights x2 backgrounds. Heights16,24,32,48,64,128,256,512,1024; widths proportional. No external requests, no bounds overflow. Mark bbox `(31,24,58,75)` inside120x120; wordmark bbox approximately `(45.2,31.8,342.08,90)` inside420x150. Favicon background exactly fills120x120; its original transformed U remains within bounds.
- Visual QA: reviewed current representative size/background sheet, intended-background logos, original Kit comparison and five PDF pages. Original spacing, geometry, outlined lettering and proportions retained. Opposite-background low visibility is a negative example, not a usable variant. Favicon is discernible at16px; proposed stand-alone minimum24px and horizontal lockup120px follow the source guide. Tiny complete wordmarks are unsuitable; use the mark.
- Pillow:20 PNGs decode with proportional dimensions; intended transparent assets have alpha, intentional tiles/banner have backgrounds. ICO decodes at16/24/32/48/64/128/256px. These are exports, not verified PWA packaging or physical-device acceptance.
- `pdftoppm -scale-to 1000 -png assets/brand/UniBOS_Brand_Book_v1.1.pdf <prefix>`:5 pages rendered; `pdffonts` confirms both used guide fonts embedded/subset. No PDF JavaScript/forms/encrypted content in independent inspection.
- ZIP integrity and equality: distribution entries match current sources; screenshot ZIP has252 renders plus one current original-vs-aligned comparison PNG. JSON is adjacent, not in the screenshot ZIP.
- `git diff main --check` and committed-diff checks: PASS after attributes correction. No application build/E2E/tenant/payment tests apply to this asset milestone; none claimed.

Fresh central-bar evidence replaces prior diagonal images at these paths:

- [Size/background contact sheet](p0-evidence/contact.png)
- [Original uploaded Kit versus aligned original](p0-evidence/chromium-comparison.png)
- [All Chromium screenshots](p0-evidence/chromium-renders.zip)
- [Actual render geometry, requests and engine failures](p0-evidence/render-results.json)
- [Current14 asset static summary](p0-evidence/static-results.json) (full17-file executable gate includes legacy aliases)
- Final Book pages: [1](p0-evidence/book-1.png), [2](p0-evidence/book-2.png), [3](p0-evidence/book-3.png), [4](p0-evidence/book-4.png), [5](p0-evidence/book-5.png)
- [Aligned Book](../assets/brand/UniBOS_Brand_Book_v1.1.pdf), [aligned Kit](../assets/brand/UniBOS_Brand_Kit_v1.1.zip), [usage/licenses](../assets/brand/README.md)

Initial audit attempts encountered absent browsers and unsupported getBBox().toJSON; corrected, not counted as passes. Fresh final central-bar run used the corrected renderer. Firefox timed out after15s with sandbox/framebuffer errors; WebKit reported missing libraries. No cross-browser pass claimed. Re-test on supported hosts before product release. Browser screenshots are not physical-device certification.

## Repository settings and CI blocker

Private visibility verified through connected metadata and `gh repo view --json visibility` before uploads. No direct main push, force push, branch deletion, visibility change, public deployment or paid operation. No Nightshift, production or customer data accessed. No new financial commitment.

Branch list reports `protected:false` for main and PR branch. Protection detail endpoint returns403 Resource not accessible by integration; ruleset endpoint returns403 private-repo plan restriction. Detailed protection settings cannot be certified. Proposed owner configuration: keep private; verify plan/features; PR-only main updates, independent review, required brand-static check, no force push/deletion, least-privilege Actions. No account or plan changes performed.

Initial PR state:7 commits,7 files, no reviews/checks, mergeable true/CLEAN. Earlier handover's mergeable false was not reproduced; historical reason cannot be proven from accessible evidence. No Git conflict was identified or claimed fixed.

Workflow uses pinned checkout, read-only token, no retained credentials, no deploy and a5min timeout. Run [43723673127](https://github.com/ruslanjurakulov/unibos/actions/runs/43723673127) failed before any step; runner ID0, steps empty. Annotation:

> The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings

This is an account restriction, not an executed test assertion failure. CI remains failed; local passes do not replace it. No rerun loop, upgrade, spending-limit increase or fabricated green status. Final current-head check status must be re-read from GitHub.

## Independent review, limitations and next gate

Separate reviewer agent independently checks original source geometry/lettering, XML/security, browser bounds, PNG/ICO, ZIP equality, scripts/workflow and all five PDF pages. Its earlier diagonal approval is explicitly obsolete; fresh original-identity review is required at current changes. Exact reviewed SHA and final review conclusions are recorded with the PR after final commit. No GitHub formal human/self-approval is claimed; connected account authored the PR.

Scoped SVG safety is not a security certification. Upstream Inter/Playfair SIL OFL1.1 texts verified; no standalone font binaries shipped. Runtime font self-hosting/subsetting/performance remains P1/P3. Trademark and logo IP clearance remain pending. Domain purchase is owner-reported, blueprint renewal date not independently verified. ARCHITECTURE's legacy possible Nightshift reuse is overridden by the current no-touch instruction; no infrastructure was accessed.

Recommendation: **hold PR #1 and P1 until CI executes successfully at final head and exact-head independent review is complete**. Owner must resolve GitHub's account restriction or authorize a suitable no-cost CI alternative. Before any later merge recheck visibility, base/head, mergeability/conflicts, checks and reviews. After merge fetch/verify main and rerun the static gate. Later commercial release still requires runtime security, real-device, recovery and legal gates.

Costs: no payments, paid-plan changes or new financial commitments. No application/deployment provisioning. Next task: restore CI availability without reducing confidentiality, execute final-head gates, merge P0 only if all pass, verify main, then start P1 from repository documents.
