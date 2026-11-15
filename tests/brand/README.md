# Brand verification tools

`python3 tests/brand/audit.py` is the stdlib-only CI gate: safe SVG elements/attributes/colors, accessible names, canonical mark geometry and legacy aliases. It does not prove trademark clearance, visual quality or complete wordmark path identity.

`node tests/brand/render.cjs` uses Playwright to render every SVG at heights 16/24/32/48/64/128/256/512/1024 px and proportional width on ivory/forest backgrounds. Set `BRAND_EVIDENCE_DIR` to an output directory. System Chromium is configured at `/usr/bin/chromium`; Firefox/WebKit require installed Playwright browsers and host libraries. Missing engines are reported as errors, never passes. The JSON includes actual path bounds and external request counts. If no engine renders, the output contains errors; inspect results rather than treating script completion as an all-browser pass.

`node tests/brand/export.cjs` creates deterministic proportional PNG derivatives and legacy SVG aliases from the six canonical masters. `python3 tests/brand/book.py` creates the PDF and ICO with Pillow/ReportLab and embedded system DejaVu fonts. Audit environment: Python 3, Playwright 1.62.1, system Chromium; library versions recorded in docs/P0_REVIEW.md. These scripts do not install software, contact services or deploy anything. Portable production font selection is deferred; the guide uses DejaVu for document text only.

Screenshots from this audit are archived in docs/p0-evidence/chromium-renders.zip. Compare images visually; a raster file existing is not by itself proof of correct branding. The favicon deliberately uses a solid tile; dark ink on dark backgrounds and light ink on ivory are negative visibility examples.
