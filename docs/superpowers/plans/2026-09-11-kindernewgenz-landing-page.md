# KinderNewGenz Landing Page Implementation Plan

## Goal

Create an independent Vite + React 19 + TypeScript landing page in `frontend/` for KinderNewGenz. The page uses Persuade mode, a Navy/Gold visual system, Plus Jakarta Sans, `motion/react`, and Phosphor icons. It must work cleanly on desktop and mobile.

## Design direction

- Surface mode: Persuade.
- Canvas: cool slate-tinted white with Navy `#023664` as the trust anchor and Gold `#FAD105` as the only saturated accent.
- Typography: Plus Jakarta Sans loaded from Google Fonts with system fallbacks.
- Layout: editorial hero with a CSS/SVG product mockup, role tabs, dense bento feature grid, social proof, CTA, and a practical footer.
- Motion: transform/opacity only, restrained spring-like easing, `layoutId="activeTab"`, reduced-motion fallback, and one low-frequency floating illustration.
- Responsive: mobile-first, stacked sections below `768px`, touch targets at least `44px`, mobile navigation drawer, and no `h-screen`.

## Implementation steps

1. Scaffold `frontend/` with Vite React TypeScript and install `tailwindcss`, `@tailwindcss/vite`, `motion`, `@phosphor-icons/react`, `clsx`, and `tailwind-merge`.
2. Configure Vite, TypeScript, Tailwind tokens, global typography, focus styles, reduced motion, and root document metadata.
3. Build the page in focused components:
   - `Navigation`: sticky frosted shell, desktop links, mobile menu drawer.
   - `Hero`: compact two-line headline, short copy, two CTAs, CSS dashboard mockup and floating backpack illustration.
   - `RoleTabs`: role data, keyboard-friendly tab buttons, `layoutId` highlight, animated content panel.
   - `FeatureBento`: dense responsive grid with four feature narratives and accessible labels.
   - `SocialProof`, `FinalCta`, and `Footer`.
4. Add small reusable primitives for buttons, section labels, and icons without introducing a UI framework.
5. Verify with `bun run build`, `bun x tsc --noEmit`, Prettier, and the Impeccable detector. Inspect the responsive layout at desktop and mobile viewport sizes and correct any findings.

## Acceptance checks

- No em dash character in frontend source or visible copy.
- No `h-screen`, pure black, dead gray, generic purple gradients, or default Inter/Roboto/Arial typography.
- Hero heading is at most two lines, subtext is under 20 words, and CTA labels stay on one line.
- Role tab highlight uses `layoutId="activeTab"`.
- Mobile menu works without horizontal overflow and respects reduced motion.
- Frontend builds and type-checks independently from the backend.
