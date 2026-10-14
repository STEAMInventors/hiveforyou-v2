# Vercel deployment

## Config sources

- **Committed (Git):** `app/.env.production` — non-secret production defaults (Supabase URL/anon key, engine modes, `HIVE_PIPELINE`, model ids, prompt pins, etc.).
- **Platform secrets:** set in the Vercel project from `app/.env.vercel.example` (`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `HIVE_ANTHROPIC_API_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `JEV_API_KEY`). Temporary preview gate (optional): `HIVE_PREVIEW_PASSWORD` only — HTTP Basic. Do not set `HIVE_PREVIEW_AUTH_EMAIL` or `HIVE_PREVIEW_AUTH_PASSWORD`; the app does not read them and must not sign in a shared Supabase user.

## Precedence

On Vercel, **project Environment Variables override** values from `app/.env.production` for the same key. That is intentional (secrets and per-environment overrides), but a **stale Vercel value can shadow a change you committed** to `.env.production`. After merging config changes, update or remove conflicting Vercel vars so production matches Git.

## Smoke check

Deploy a **Preview** and hit a route that calls `readServerEnv()` (e.g. authenticated `POST /api/hive/ping` when `HIVE_PIPELINE=inngest`). Confirm no `SERVER_MISCONFIGURED` in logs. On **Vercel production** (`VERCEL_ENV=production`), API `503` bodies are generic; missing variable **names** appear in logs only. **Previews** (`VERCEL_ENV=preview`) may include a `missing` array in the JSON to speed debugging.

## Supabase Google sign-in

Document upload requires a real Supabase user session. The app starts Google OAuth in the browser and finishes it at `/auth/callback`.

In the Supabase project:

- Authentication → Providers → Google: enable the provider and set the Google OAuth client id and secret.
- Authentication → URL configuration:
  - Site URL: the app origin in use (local, preview, or production).
  - Redirect URLs: `http://localhost:3000/auth/callback` and `https://<deployed-host>/auth/callback` for each preview and production origin.

In Google Cloud, the OAuth client's authorized redirect URI is the Supabase callback `https://<project-ref>.supabase.co/auth/v1/callback`.

Remove `HIVE_PREVIEW_AUTH_EMAIL` and `HIVE_PREVIEW_AUTH_PASSWORD` from the Vercel project if they are still set. `HIVE_DEV_AUTO_AUTH` must stay unset when `VERCEL_ENV=production`.