# UniBOS Dual Design System

## Founder-approved visual direction (2026-11-15)
Original U symbol with central vertical gold bar, UniBOS wordmark, forest/ivory/gold identity. The approved concept is a visual reference, not a production asset or trademark clearance. Do not use the registered trademark symbol before registration. Slogan: One platform. Your entire business.

| Brand token | Hex |
|---|---|
| Forest Green | #0F3D32 |
| Ivory | #F7F4EC |
| Gold Sand | #C9AE78 |
| Mint Gray | #D8E3DB |
| Deep Slate | #1F2937 |

Modern Luxury: marketing, pricing, public guest menu/cart/checkout. Playfair Display for editorial headings, Inter for body and controls, quality food imagery, whitespace, subtle motion and reduced-motion fallback. Guest menu customizable within accessible tokens. Marketing hero: restaurant-context product imagery, laptop dashboard, mobile menu and QR/NFC stand; clear demo and onboarding CTAs. Mobile must use responsive layouts, not a flattened screenshot.

Global Corporate: workspace, admin, cashier, kitchen, stock, finance and staff. Inter typography, white #FFFFFF, cloud #F4F6FA, cobalt #3157D5, navy #152238, emerald #16966A remain proposed operational semantic colors, subject to contrast validation; shared brand identity remains forest/ivory/gold. Clear typography, dense but readable tables, touch targets, light/dark, keyboard navigation, predictable feedback. Kitchen large controls with text status not color alone.

Shared original UniBOS wordmark, semantic tokens, responsive components, error/loading/empty/success states. WCAG 2.2 AA target; test keyboard, contrast, mobile widths and reduced motion. No copying competitors or representing sample dashboards as live. No fabricated partners, customer counts, testimonials or non-functional controls represented as working. Demo data explicitly labeled. UZ/RU/EN localization architecture; exact launch language coverage subject to testing. Powered by UniBOS branding on guest menus is a proposed marketing pattern, subject to tenant settings and plan policy.

## Acceptance and outstanding assets
- Preserve the approved brand direction; changes require founder agreement.
- Owner finally confirmed the original central-bar logo from the uploaded Brand Book/Kit on 2026-11-15; the diagonal variant is superseded. Canonical outlined SVG masters and aligned v1.1 Book/Kit are in `assets/brand/`; the uploaded v1.0 geometry, proportions and outlined lettering are the visual authority; older color values are normalized to the explicitly approved palette. See its README for provenance, fonts, accessibility and usage. Trademark/IP clearance remains pending.
- Compare actual responsive screenshots to approved concepts, and validate accessibility, keyboard interaction and functional states.
- No public deployment or disclosure beyond the owner-approved Vercel website preview without explicit owner approval. No custom domain or production backend is included. Follow CONFIDENTIALITY.md.

## P3 implementation notes
- The marketing page and guest menu default to Uzbek Latin and also support English and Russian. They share the selected language through browser-local storage. Authentication and the workspace are currently English-only; they are not represented as fully localized.
- Inter and Playfair Display subsets are self-hosted under `apps/website/public/fonts/` with their OFL notices. No Google Fonts request is made at runtime.
- Marketing, sign-in/MFA, organization/branch dashboard, and labeled workspace/guest previews are implemented in the local Next.js application. The dashboard talks to the verified P2 API through a same-origin `/api/*` rewrite.
- Guest demo cart is browser-local and does not send orders or payments. Workspace preview metrics are explicitly fictional. The authenticated dashboard contains real organization and branch names for its account; no other live business operations are present.
- CSS primitives currently live in the website app. Move them into the planned `packages/design-system` only when another app consumes shared components.
- Static contrast checks improved small marketing text and keyboard focus indicators; a full WCAG audit and browser/device matrix remain pending.
