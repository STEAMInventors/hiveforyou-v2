# syntax=docker/dockerfile:1
# Build and run on linux/arm64 (Oracle Cloud Ampere).
FROM --platform=linux/arm64 node:22-bookworm-slim AS pack-bridge-build

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /repo
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY engine/domain-pack/package.json engine/domain-pack/package.json
COPY engine/shared/package.json engine/shared/package.json
COPY engine/domain-packs/_shared/package.json engine/domain-packs/_shared/package.json

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile --filter @hiveforyou/domain-pack...

COPY engine/domain-pack engine/domain-pack
COPY engine/shared engine/shared
COPY engine/domain-packs/_shared engine/domain-packs/_shared

RUN pnpm --filter @hiveforyou/domain-pack run build:pack-driven-bridge

FROM --platform=linux/arm64 python:3.12-slim-bookworm AS build

COPY --from=ghcr.io/astral-sh/uv:0.12.24 /uv /usr/local/bin/uv

ENV UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

COPY agents/pyproject.toml agents/uv.lock ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

COPY agents/src ./src

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

COPY engine/domain-packs/iep/study/agents.json ./pack/agents.json
COPY --from=pack-bridge-build /repo/engine/domain-pack/dist/pack-driven-reader-bridge.mjs ./pack/pack-driven-reader-bridge.mjs
COPY brain/domain-packs/iep/iep-pack.v0.3.proposed.json ./pack/iep-pack.v0.3.proposed.json

FROM --platform=linux/arm64 python:3.12-slim-bookworm AS runtime

COPY --from=pack-bridge-build /usr/local/bin/node /usr/local/bin/node

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 10002 hiveagents \
  && useradd --uid 10002 --gid hiveagents --home-dir /app --shell /usr/sbin/nologin hiveagents

WORKDIR /app

COPY --from=build --chown=hiveagents:hiveagents /app /app

USER hiveagents

ENV PATH="/app/.venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1 \
    HIVE_AGENTS_JSON=/app/pack/agents.json \
    HIVE_AGENTS_BIND_HOST=127.0.0.1 \
    HIVE_AGENTS_BIND_PORT=4320 \
    HIVE_PACK_DRIVEN_READER_COMPILER_JS=/app/pack/pack-driven-reader-bridge.mjs \
    HIVE_PACK_DRIVEN_READER_PROPOSAL_JSON=/app/pack/iep-pack.v0.3.proposed.json

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD python -c "import os, urllib.request; h=os.environ.get('HIVE_AGENTS_BIND_HOST','127.0.0.1'); p=os.environ.get('HIVE_AGENTS_BIND_PORT','4320'); urllib.request.urlopen(f'http://{h}:{p}/health', timeout=4).read()"

CMD ["sh", "-c", "exec uvicorn hive_agents.app:app --host \"${HIVE_AGENTS_BIND_HOST}\" --port \"${HIVE_AGENTS_BIND_PORT}\""]
