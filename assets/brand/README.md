# UniBOS brand assets v1.1

## Authority and provenance

The owner's latest instruction on 2026-11-15 makes the original uploaded v1.0 Brand Book/Kit the visual authority: the U has a **central vertical gold bar**, not a diagonal accent. The owner explicitly rejected the diagonal variant after an earlier provisional selection. That latest decision supersedes the earlier selection; previous diagonal render/review evidence does not certify this package.

The six PR SVGs now derive from the original Kit's symbol and outlined wordmark paths, retaining geometry, transforms, proportions and lettering. The uploaded references remain untouched. The v0.1 HTML's diagonal inline logo is superseded; it is not imported as application code. All derivatives and legacy paths use the central-bar master.

Previously explicitly confirmed corporate palette remains: Forest Green `#0F3D32`, Ivory `#F7F4EC`, Gold Sand `#C9AE78`, Mint Gray `#D8E3DB`, Deep Slate `#1F2937`. Original Kit colors `#12382E`, `#F7F4ED` and inconsistent `#B99A65` are normalized to that palette, without changing shapes. Black/white variants are single-ink reproduction exceptions.

## Files and use

- `mark-light.svg`, `wordmark-light.svg`: forest ink on light backgrounds; gold bar.
- `mark-dark.svg`, `wordmark-dark.svg`: ivory ink on dark backgrounds; gold bar.
- `mark-monochrome.svg`: slate single-color mark; black/white variants for single-ink use.
- `wordmark-primary.svg`: forest tile with ivory lettering and gold bar.
- `favicon.svg`, `favicon.ico`: intentional forest tile; ICO includes16/24/32/48/64/128/256px.
- `app-icon.svg`, `social-avatar.svg`, `social-banner.svg`: unchanged original paths composed in their intended formats.
- `png/`: proportional browser exports; transparent variants retain alpha. Primary/banner/icon backgrounds are intentional.
- `UniBOS_Brand_Book_v1.1.pdf`, `UniBOS_Brand_Kit_v1.1.zip`: aligned guide and distribution package.

Dark/light names describe intended background, not ink. In HTML use `alt="UniBOS"`, or empty alt when adjacent text already names the brand. Hide purely decorative inline SVGs from assistive technology. Masters have titles and accessible names.

Proposed minimum mark height24px and horizontal lockup width120px follow the original guide. Smaller favicon exports are technical exports, not a promise of full wordmark readability. Keep clear space of at least one central-bar width around visible artwork. Never crop, stretch, rotate, redraw or add effects. Favicon and explicitly labeled tiles have backgrounds; other mark/wordmark masters are transparent.

## Typography, licenses and rights

Inter for UI/body; Playfair Display for premium marketing headings. License texts retrieved on2026-11-15:

- https://github.com/rsms/inter/blob/master/LICENSE.txt
- https://github.com/google/fonts/blob/main/ofl/playfairdisplay/OFL.txt

Both are SIL OFL1.1; retain copyright/license notices and reserved-name restrictions for modifications. No standalone Inter/Playfair binaries are included. P1/P3 must select pinned WOFF2 builds, self-host language-appropriate subsets, use `font-display: swap`, and measure loading/layout shift. No runtime font performance pass is claimed. The original Kit's supplied outlined wordmark requires no external font; font licensing is not logo/trademark IP clearance.

The PDF embeds DejaVu Sans solely for portable guide text; its license is in `Guide-Font-LICENSE.txt`. This does not change product typography. Logos in the PDF are proportional renders of canonical outlines. No registered-trademark symbol; trademark clearance is pending.

Review, evidence and blockers: `../../docs/P0_REVIEW.md`. No public deployment or paid operation authorized.
