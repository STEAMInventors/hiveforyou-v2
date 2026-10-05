# Security operations checklist

## Committed anon key and RLS

The committed `NEXT_PUBLIC_SUPABASE_ANON_KEY` is acceptable only if **RLS and storage policies** enforce tenant isolation. Hive migrations enable RLS on `hive.*` tables (see `supabase/migrations/*`) and define private `case-documents` storage policies scoped to `auth.uid()` folder prefixes in `20260927220000_hive_persistence.sql`. Re-verify after new tables or buckets.

## Secrets file on Oracle worker

`/etc/hive-worker/worker.env` must be **root-owned** and mode **600** (secrets only; non-secret config is in `deploy/oracle/worker.config.env`):

```bash
sudo chown root:root /etc/hive-worker/worker.env
sudo chmod 600 /etc/hive-worker/worker.env
```

After deploy, run boot check with the **merged** env inside the container:

```bash
docker compose exec hive-worker node dist/main.js --boot-check
```

## Git history scan

If `.env` or keys were ever committed before ignore rules, **rotate** exposed credentials; removing the file is not enough.

```bash
gitleaks detect --source . --verbose
# or: trufflehog git file://. --only-verified
```

Run once on the full repo history and after any suspected leak.

## Health data / BAAs

For medical bills or other PHI, each subprocessors (Vercel, Supabase, Inngest, model providers, etc.) needs a **BAA** where applicable. Treat that as a product/legal gate before handling covered data.