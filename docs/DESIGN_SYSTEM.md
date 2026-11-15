# UniBOS design system

This document records how the approved top-level `DESIGN_SYSTEM.md` is applied in the current P3 website increment.

## Brand source of truth

The approved UniBOS Brand Book v1.1 and Brand Kit v1.1 define the identity. The approved mark is the geometric U with the central vertical gold bar. Keep its SVG geometry and proportions unchanged; use the canonical files in `assets/brand/`. Do not redraw the mark or introduce the earlier diagonal accent concept. Do not use the registered trademark symbol.

| Token | Value | Use |
|---|---|---|
| Forest Green | `#0F3D32` | Primary brand surface, navigation and primary actions |
| Ivory | `#F7F4EC` | Warm brand canvas and inverse text |
| Gold Sand | `#C9AE78` | Focus accent, highlights and restrained detail |
| Mint Gray | `#D8E3DB` | Supporting surface and quiet separation |
| Deep Slate | `#1F2937` | Main operational text |

Never shift the approved core palette. Use neutral tints as supporting interface colors; reserve gold for small accents and accessible focus indicators rather than long text.

## Two interface directions

**Modern Luxury** is for the public site and guest experience. Use editorial hierarchy, spacious layouts, warm ivory, forest green, measured gold accents, Playfair Display headings and Inter text. The home, solutions, QR menu, pricing, about and contact surfaces follow the owner's supplied JPG references. Cropped local visual assets are derived from those references and remain illustrative demo artwork, not customer photography.

**Global Corporate** is for the business workspace and later operations modules. Prioritize dense but legible business information, compact tables, clear states, low-friction actions, responsive layouts and both light and dark themes. The dashboard and Super Admin screens are clearly labeled sample demos; the authenticated workspace supports organization and branch setup from the P2 API. Menus, orders, staff scheduling, analytics and billing remain outside the P3 production API scope.

## Typography and assets

- Inter variable face, weights 400–700, for body copy, forms and the operational workspace.
- Playfair Display variable face, weights 500–600, for marketing and product headings.
- Font subsets are self-hosted under `apps/website/public/fonts/` for Latin, Latin Extended, Cyrillic, Vietnamese and supporting Greek ranges. Google Fonts is not requested at runtime. OFL terms are included in `assets/brand/Inter-OFL.txt` and `assets/brand/Playfair-Display-OFL.txt`.
- Logo use comes from the canonical P0 brand assets copied into the website. Preserve the central-bar U, clear-space and supplied wordmark paths.

## Component primitives

Website primitives live in `apps/website/app/globals.css` while the site is still one Next.js application: `.ui-button`, `.ui-card`, `.ui-badge`, `.ui-input`, and shared focus-visible styles. Keep semantics in the consuming React component; CSS classes alone do not provide an accessible name or role. Split into `packages/design-system` when a second application consumes the same components.

Use visible focus, associated labels, descriptive control names, status announcements, reduced-motion support, minimum target sizes and responsive layout changes. Avoid color-only status communication. Design at narrow phone widths first, then tablet and desktop. Marketing, guest and corporate demo screens include a manually switchable light/dark mode. Preserve the distinct Modern Luxury and Global Corporate directions while sharing brand tokens.

## Localization

Uzbek Latin is the default public-site language. English and Russian are available on all marketing and demo pages; selection persists through browser-local storage. Do not infer translated business, legal, plan, security or performance claims. Authentication and the authenticated business workspace remain English-only preview screens; do not represent those as fully localized.

## Demo and product claims

Every demonstration uses clearly marked fictional data and must not send an order, payment or customer record. Pricing remains unlisted until approved. Avoid invented customer names presented as real, integrations, user counts, revenue, availability or security certifications. Calls to unavailable actions should say so or remain visibly demonstrative.

## Accessibility and privacy boundary

The current website sends no analytics or marketing data and loads no remote fonts, images or scripts. Self-hosted type and same-origin API proxy routes respect the CSP's `font-src 'self'` and `connect-src 'self'` boundaries. The sign-in proxy requires `UNIBOS_API_ORIGIN`; local development defaults to the API on loopback port 3001. Production hosting, HTTPS configuration, email verification/delivery, legal review, accessibility audit and browser/device verification remain release gates.
