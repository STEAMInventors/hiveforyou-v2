# Engine / app import boundaries (refactor blocks 1–4)

Enforcement is documented here; ESLint rules will tighten in a later block.

## Engine (`engine/**`)

Forbidden imports:

- `next`, `next/*`
- `react`, `react-dom`
- Any path under `app/` or legacy `apps/web/`

## App (`app/**`)

Forbidden imports (target state; phased in later commits):

- `openai`, `@anthropic-ai/*`
- `pdfjs-dist` and server PDF/OCR stacks used for extraction
- Direct orchestration from `@hiveforyou/core` / `@hiveforyou/intake` (API → engine services)

Allowed today during migration: workspace packages for unchanged behavior.
