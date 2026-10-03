# Legacy artifact CSS

Stitch/HTML-aligned styles kept until each surface migrates to **HiveForYou CSS v1** (`../hiveforyou.css`, `.hfy-*` classes).

Artifact rules load **after** Tailwind from `app/layout.tsx` via `./index.css`.

`:root` `--hive-color-*` and Tailwind `@layer base` (html/body/focus) live only in **`app/globals.css`** (same PostCSS entry as `@tailwind`). `upload-tokens.css` is a reference duplicate — **do not @import** it.

## Files and migration targets

| File | Scope in the app | Migrate to |
|------|------------------|------------|
| `upload-tokens.css` | `:root` `--hive-color-*` (imported from `globals.css`) | Map `tailwind.config.ts` → `--hfy-*` |
| `marketing-start.css` | Horizon landing (`.hz-*`), Start composer, hive-fly modal (`.hf-*`), case-map grid | `.hfy-*` layout/marketing; keep feature CSS co-located until removed |
| `intake-docs.css` | Intake Evidence Workspace (`.intake-docs`) | `.hfy-composer`, `.hfy-table`, tokens |
| `case-summary.css` | Parent Hive case (`.case-summary` — chips, asks, cards, status bar) | `.hfy-chip`, `.hfy-badge`, `.hfy-statebar`, Hive case components |
| `evidence-viewer.css` | Evidence drawer + in-app PDF (`.case-summary .viewer`, `.drawer`, `.scrim`) | `.hfy-drawer`, `.hfy-scrim` + viewer-specific module |
| `case-summary-pro-legacy.css` | Legacy `.case-summary-pro` table/signal layout | Already superseded by `pro-workspace.css` for shell; delete when legacy Pro path removed |

## Also loaded outside this bundle

- `components/case-summary/pro-workspace.css` — Pro desk (imported from `CaseSummaryProView`)
- `components/hive-lifecycle/hive-lifecycle.css`
- `components/hive-case/hive-document-explainer.css`

## Deleting this folder

Safe only when:

1. No JSX uses legacy class names (`.case-summary`, `.chip`, `.drawer`, …).
2. Tailwind theme no longer depends on `--hive-color-*` (or aliases them to `--hfy-*`).
3. Visual QA on Start, intake, discover, study map, parent case, Pro, evidence viewer.
