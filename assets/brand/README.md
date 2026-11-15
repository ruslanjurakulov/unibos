# UniBOS brand assets v1.1

## Authority and provenance

On 2026-11-15 the owner explicitly confirmed PR #1's diagonal gold-accent U as the final concept, and required the uploaded v1.0 Book/Kit to be aligned. The six original SVG masters at `1770c736ed341b2421ee3fab37d88454fcb3e726` are preserved byte-for-byte. The older central-bar kit, its lettering and palette are superseded references, not alternate approved identities. The v0.1 HTML is a local prototype, not a production asset master; its approximate inline logo is superseded by these masters. It has not been added as application code.

Palette: Forest Green `#0F3D32`, Ivory `#F7F4EC`, Gold Sand `#C9AE78`, Mint Gray `#D8E3DB`, Deep Slate `#1F2937`.

## Files and use

- `mark-light.svg`, `wordmark-light.svg`: forest lettering on light backgrounds, gold accent.
- `mark-dark.svg`, `wordmark-dark.svg`: ivory lettering on dark backgrounds, gold accent.
- `mark-monochrome.svg`: slate single-color mark. Black/white variants are explicit single-ink reproduction exceptions to the brand palette.
- `wordmark-primary.svg`: forest background with ivory lettering and gold accent.
- `favicon.svg`, `favicon.ico`: intentional forest tile; ICO includes 16/24/32/48/64/128/256 px.
- `app-icon.svg`, `social-avatar.svg`, `social-banner.svg`: derivatives of unchanged original paths; no external fonts or resources.
- `png/`: deterministic browser exports. Transparent variants retain alpha; primary/banner/icon variants intentionally have backgrounds.
- `UniBOS_Brand_Book_v1.1.pdf`: aligned guide; lettering in the guide is rendered from the SVG masters.
- `UniBOS_Brand_Kit_v1.1.zip`: the versioned distribution package, including all assets and guide.

Names dark/light describe the intended background, not the ink. For an HTML image supply `alt="UniBOS"`; use empty alt when adjacent text already names the brand. Decorative inline SVGs should be hidden from assistive technology. Inline masters already include a title and accessible name.

Use the mark at small sizes; the complete wordmark is not readable at a 16 px total width. Proposed minimum mark height: 24 px. Keep at least 8 master units of additional clear space, especially above the gold accent which touches viewBox y=0. Never crop, stretch, redraw, rotate or add effects. Favicon background is intentionally opaque; other master marks and horizontal lockups are transparent unless explicitly labeled primary.

## Typography and rights

Inter for operational UI/body; Playfair Display for premium marketing headings. Upstream license texts were retrieved on 2026-11-15:

- https://github.com/rsms/inter/blob/master/LICENSE.txt
- https://github.com/google/fonts/blob/main/ofl/playfairdisplay/OFL.txt

Both specify SIL OFL 1.1; retain the attached license/copyright notices and observe reserved font names when modifying fonts. No standalone Inter/Playfair font binaries are included. P1/P3 must select pinned WOFF2 builds, preserve notices, self-host language-appropriate subsets, use `font-display: swap`, and measure loading/layout shift. Those runtime results are not claimed here. The existing custom outlined logo paths have no runtime font dependency; font license verification alone is not trademark or logo IP clearance. No registered-trademark symbol; trademark clearance remains pending.

Evidence and remaining gates: `../../docs/P0_REVIEW.md`. No public deployment or paid operation is authorized.

The PDF guide embeds DejaVu Sans solely for portable document text; this is not a change to product typography. Its license is included in `Guide-Font-LICENSE.txt`. The logo itself is rendered from the canonical outlines.
