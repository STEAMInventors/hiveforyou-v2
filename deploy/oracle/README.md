# Hive worker on Oracle Cloud (ARM64)

Runs the Inngest **connect** worker in Docker on Ampere (`linux/arm64`).

## Host setup

1. Install Docker Engine and Compose on the VM.
2. Copy `worker.env.example` to `/etc/hive-worker/worker.env`, fill values, and restrict permissions (`chmod 600`).
3. Set `NODE_ENV=production`, `INNGEST_SIGNING_KEY`, and **do not** set `INNGEST_DEV` or `HIVE_FAULT_INJECT`.

## Build and run

From this directory:

```bash
docker compose build
docker compose up -d
```

Build context is the repo root; the image bundles `worker/dist/main.js` and installs native deps (`@napi-rs/canvas`, `pdfjs-dist`, OCR) in the runtime layer.

## Smoke checks

```bash
docker compose exec hive-worker node dist/main.js --boot-check
docker inspect --format='{{json .State.Health}}' "$(docker compose ps -q hive-worker)"
```

The container health check reads the heartbeat file written every 15s (default `/tmp/hive-worker-heartbeat`).
