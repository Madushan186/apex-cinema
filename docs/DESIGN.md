# Design — Apex Cinema customer UI

Status: customer-facing UI phase (local fixtures only). This documents the dark theme tokens, the two deliberate departures from the originally proposed palette (with the actual contrast numbers that justified them), and the localisation approach. See `docs/PROGRESS.md` for what phase this belongs to.

## 1. Brand asset

The supplied logo is `public/brand/Logo (1).png` (1536×1024, transparent background, confirmed via pixel inspection — corners are alpha `0`; the pale halo visible in some viewers is a rendering artifact of compositing transparency onto white, not real pixel content). It is referenced as-is (`/brand/Logo%20(1).png`, URL-encoded for the space) and never redrawn, recoloured, or filtered — see `src/components/brand/Logo.tsx`. Its built-in transparent padding (from the glow effect) is preserved by sizing the `<img>` by height only (`h-10`/`h-12`/etc., width auto) inside a flex wrapper, never `object-fit: cover` or cropping.

**Open item carried over from the foundation phase:** the docs originally assumed a filename `apex-logo.png`; the actual supplied file is named differently. Not renamed automatically — flagged for the owner in `docs/PROGRESS.md`.

## 2. Design tokens (dark-only, no toggle)

All customer-facing surfaces — marketing pages, the booking wizard, forms, the confirmation screen — use the same dark tokens, defined once in `app/src/index.css`:

| Token | Value | Role |
|---|---|---|
| `--background` | `#050505` | Page background |
| `--section` | `#0b0b0d` | Alternating section background |
| `--card` | `#121215` | Card surfaces |
| `--elevated` | `#1a1a1f` | Popovers, the mobile menu, hover surfaces |
| `--foreground` | `#f5f4f0` | Primary text |
| `--muted-foreground` | `#b8b8c2` | Secondary text |
| `--primary` | `#c91825` | Primary action red |
| `--primary-hover` | `#ad1420` | Red hover state |
| `--gold` | `#d6b66a` | Eyebrow text, fine rules, focus ring, small premium accents |
| `--status-positive` / `--status-warning` / `--status-negative` | `#3fae63` / `#d6b66a` / `#e2515e` | Always paired with an icon + text label (`components/ui/notice.tsx`, `components/ui/badge.tsx`) — never colour alone |

These match the brief exactly, **except** the two rows below, which were adjusted after measuring real contrast (not eyeballed) — see §3.

## 3. Contrast validation (measured, not assumed)

Computed with the actual WCAG relative-luminance formula against the rendered tokens (verified live in Chrome via `getComputedStyle`, not just calculated on paper):

| Pair | Ratio | Bar | Result |
|---|---|---|---|
| Foreground on background | 18.5:1 | 4.5:1 (AA text) | Pass (AAA) |
| Muted foreground on background/card/section | 9.5–10.4:1 | 4.5:1 | Pass (AAA) |
| Foreground on primary red button | 5.24:1 | 4.5:1 | Pass (AA) |
| Foreground on primary-hover red | 6.58:1 | 4.5:1 | Pass (AA) |
| Gold on background/card | 9.6–10.4:1 | 4.5:1 | Pass (AAA) |
| Status green/red on background | 5.4–7.2:1 | 4.5:1 | Pass |
| **Proposed border `#2b2b31` vs. card** | **1.33:1** | 3:1 (WCAG 1.4.11, UI-component boundaries) | **Fail** |
| **Adjusted border `#63636b` vs. card** | **3.14:1** | 3:1 | **Pass** |
| Adjusted border `#63636b` vs. background | 3.42:1 | 3:1 | Pass |

**What changed and why:** the brief's `#2b2b31` "subtle border" measures **1.33:1** against card surfaces — far below the ~3:1 guideline for a border that's doing real structural work (an input outline, a selectable card, a table row divider). Rather than lighten the whole palette, `#2b2b31` was kept as `--border-subtle` for genuinely decorative hairlines (e.g. under an eyebrow label, footer dividers) where invisibility is fine, and a new `--border` (`#63636b`, ~3.1–3.4:1) was introduced for anything load-bearing: input fields, selectable package/slot cards, dividers inside data tables. Interactive elements never rely on the border alone regardless — selection also changes the fill (`bg-primary/10`) and, where applicable, an icon/checkmark.

**Focus ring, found and fixed during browser testing:** shadcn's default `Button` used `focus-visible:ring-ring/50` (translucent, 50% opacity). Live-testing the real page under keyboard navigation showed a nearly invisible ring on the red primary button. Since the ring is a box-shadow drawn outside the border-box (against the page background, not the button fill), a fully opaque gold ring (`focus-visible:ring-ring` — dropped the `/50`) gives a crisp, high-contrast indicator on every surface. Fixed in `components/ui/button.tsx`; the same translucent-ring issue on the `destructive` variant (`ring-destructive/20`) was fixed the same way.

## 4. Layout & interaction choices

- **Date picker**: a native `<input type="date">` (with `color-scheme: dark` so Chromium/WebKit render their own picker UI in dark mode for free) plus quick-pick chips for Today/Tomorrow/+2/+3/+4 days. Chosen over a hand-built calendar grid — native date inputs carry their own keyboard/screen-reader semantics that are hard to beat, and this avoids a calendar-widget dependency.
- **FAQ accordion**: native `<details>/<summary>`, zero JS, fully keyboard-accessible by default.
- **Mobile menu**: a controlled full-screen overlay (not a UI-library dialog), Escape-to-close and initial focus on the close button. Full roving focus-trap cycling is not implemented — a known, minor limitation (see docs/PROGRESS.md).
- **Package/slot selection**: native `<input type="radio">` styled as cards (`sr-only` input + a styled `<label>`), so screen readers get real radio-group semantics for free.
- **Mobile booking bar**: shown only on marketing routes (`Root.tsx` checks the pathname), never on `/book` — it would otherwise sit on top of the wizard's own primary button and the mobile keyboard.

## 5. Localisation approach

- **Central dictionaries**: `src/i18n/translations.ts` exports `en` and `si`, both typed as the same `TranslationDictionary` shape (`typeof en`, not `as const` — so a missing/extra key in `si` is a compile error, not just a shape mismatch). A runtime test (`i18n/parity.test.ts`) double-checks the same leaf-key set and that no value is empty.
- **Type-safe lookup**: `t(key, vars?)` takes a generated union of every valid dot-path (`i18n/paths.ts`'s `TranslationPath<T>`), so `t("boking.hootle")` (a typo) fails to compile.
- **No inline strings, no runtime translation API** — every piece of UI text is a dictionary key.
- **Persistence**: only the explicit locale choice (`"en"` or `"si"`) is written to `localStorage` under `apex-cinema:locale` — never any personal/booking data, per the phase brief.
- **Switching**: `LocaleProvider` (`i18n/LocaleProvider.tsx`) holds locale in React context; switching updates `document.documentElement.lang` and re-renders in place — no navigation, no remount of the current route, so in-progress wizard state (package/date/slot/name/phone/email/people) survives untouched. Verified live in Chrome mid-wizard.
- **Sinhala font**: Noto Sans Sinhala is loaded from Google Fonts **on demand** — only the first time the locale actually becomes `"si"` (`ensureSinhalaFontLoaded()` injects one `<link>`, guarded so it's never added twice). English visitors never download it. Scoped via the CSS `:lang(si)` pseudo-class (which inherits from `<html lang="si">`), not a manually-toggled class, with a slightly taller `line-height: 1.65` to avoid clipping Sinhala's taller glyphs/matras — no fixed-height headings anywhere.
- **Natural, not mechanical, Sinhala**: written to read as a Sri Lankan tech/service business would actually write it — brand/technical terms (PS4, AC, 4K, WhatsApp, LKR) are kept in Latin script rather than force-translated, matching real usage.

## 6. What's deliberately not decided here

- Visual direction beyond the given tokens (no additional palette/typography exploration) — the brief specified the palette directly.
- Room photography — placeholders only (`components/RoomPlaceholder.tsx`), clearly labelled, never presented as real photos.
- Contact details (WhatsApp/phone/email/address) — all `null` in `data/fixtures/contact.ts` until real values are supplied; the UI renders an honest "not available yet" state instead of inventing anything.
