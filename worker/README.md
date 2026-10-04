# Hive worker (Inngest)

Long-running Inngest worker for Hive pipeline jobs. Phase 1 registers `hive-ping` only.

## Local setup (three terminals)

1. **Inngest dev server** (UI at [http://localhost:8288](http://localhost:8288)):

   ```bash
   npx inngest-cli@latest dev
   ```

2. **Worker** (from repo root):

   ```bash
   pnpm --filter @hiveforyou/worker dev
   ```

   Copy `.env.local` into `worker/` (same Supabase vars as the app). Set `INNGEST_DEV=1` so the worker talks to the local dev server. Default mode is WebSocket **connect** (`HIVE_WORKER_MODE=connect`). Use `HIVE_WORKER_MODE=serve` to expose `http://localhost:3001/api/inngest` instead.

3. **Next.js app**:

   ```bash
   pnpm --filter @hiveforyou/app dev
   ```

   Copy `.env.local` into `app/` as today.

## Ping smoke test

Sign in (or use dev auto-auth), then:

```bash
curl -X POST http://localhost:3000/api/hive/ping -H "Cookie: <session>"
```

The response includes an `eventId`. In the Inngest dev dashboard you should see a completed `hive-ping` run with steps `ack` and `count-user-cases`.
