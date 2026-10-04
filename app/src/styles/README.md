# HiveForYou web styles

## Design system (v1)

| File | Role |
|------|------|
| `hiveforyou.css` | Full v1.0 bundle: `@layer hfy.tokens` (incl. dark via `data-theme="dark"` or OS), `hfy.base`, `hfy.components`, `hfy.utilities`. Font tokens bridge to `next/font` (`--font-outfit`, `--font-dm-sans`, etc.). |

Canonical source: `OneDrive/HiveForYou/hiveforyou.css` — sync into this file when the spec changes.

Entry: `app/globals.css` imports `hiveforyou.css` **before** `@tailwind`.

Logo paths and React components: `src/lib/brand/paths.ts`, `@/components/HiveWordmark` (`HiveAppLogo`, `HiveProLogo`). Assets: `public/brand/` (see `brain/HiveForYou-brand-guide.md`).

Product routes may set `data-theme="light"` on `<html>` if legacy Stitch artifacts should stay light-only.

## Legacy

See [legacy/README.md](./legacy/README.md).
