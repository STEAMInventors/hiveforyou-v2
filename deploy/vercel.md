# Vercel deployment

## Config sources

- **Committed (Git):** `app/.env.production` — non-secret production defaults (Supabase URL/anon key, engine modes, `HIVE_PIPELINE`, model ids, prompt pins, etc.).
- **Platform secrets:** set in the Vercel project from `app/.env.vercel.example` (`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `HIVE_ANTHROPIC_API_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `JEV_API_KEY`). Temporary preview gate (optional): `HIVE_PREVIEW_PASSWORD`, `HIVE_PREVIEW_AUTH_EMAIL`, `HIVE_PREVIEW_AUTH_PASSWORD` — set only in Vercel, never commit them.

## Precedence

On Vercel, **project Environment Variables override** values from `app/.env.production` for the same key. That is intentional (secrets and per-environment overrides), but a **stale Vercel value can shadow a change you committed** to `.env.production`. After merging config changes, update or remove conflicting Vercel vars so production matches Git.

## Smoke check

Deploy a **Preview** and hit a route that calls `readServerEnv()` (e.g. authenticated `POST /api/hive/ping` when `HIVE_PIPELINE=inngest`). Confirm no `SERVER_MISCONFIGURED` in logs. On **Vercel production** (`VERCEL_ENV=production`), API `503` bodies are generic; missing variable **names** appear in logs only. **Previews** (`VERCEL_ENV=preview`) may include a `missing` array in the JSON to speed debugging.