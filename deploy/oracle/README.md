# Hive worker on Oracle Cloud (ARM64)

Runs the Inngest **connect** worker in Docker on Ampere (`linux/arm64`).

## Host setup

1. Install Docker Engine and Compose on the VM.
2. Copy `worker.env.example` to `/etc/hive-worker/worker.env`, fill **secrets** only. Lock down the file: `chown root:root` and `chmod 600`. Non-secret worker config ships in `worker.config.env` (loaded by Compose **before** the host secrets file; **later entries override**).
3. Set `NODE_ENV=production`, `INNGEST_SIGNING_KEY`, and **do not** set `INNGEST_DEV` or `HIVE_FAULT_INJECT`.

## Build and run

From this directory:

```bash
docker compose build
docker compose up -d
```

Build context is the repo root. **`hive-worker`** bundles `worker/dist/main.js` and installs native deps (`@napi-rs/canvas`, `pdfjs-dist`, OCR) in the runtime layer. **`hive-agents`** is the Python DSPy FastAPI service (`agents/Dockerfile`, `uv.lock` frozen install); it shares the worker container network namespace (`network_mode: service:hive-worker`) so the TypeScript verifier can stay on `127.0.0.1` while remaining reachable from Python. Neither service publishes agent or verifier HTTP ports on the host.

Non-secret agent config: `agents.config.env`. Host secrets (including `HIVE_AGENTS_SERVICE_TOKEN`, `HIVE_VERIFIER_TOKEN`, `HIVE_AGENT_TRACE_TOKEN`, `HIVE_ANTHROPIC_API_KEY`) stay in `/etc/hive-worker/worker.env`. Do **not** set `HIVE_AGENTS_ALLOW_NONPERSISTENT_AUDIT=1` in production.

## Smoke checks

Run on the **Oracle host** after `docker compose up` so env merge matches production (committed `worker.config.env` + `/etc/hive-worker/worker.env`):

```bash
docker compose exec hive-worker node dist/main.js --boot-check
docker inspect --format='{{json .State.Health}}' "$(docker compose ps -q hive-worker)"
```

See also [deploy/vercel.md](../vercel.md) and [deploy/security-ops.md](../security-ops.md).

## Local git hook (optional)

To run the committed-env Vitest guard before each commit:

```bash
git config core.hooksPath scripts/git-hooks
```

Requires `pnpm` on your PATH. CI runs `pnpm check:committed-env` on every pull request.

The container health check reads the heartbeat file written every 15s (default `/tmp/hive-worker-heartbeat`).
