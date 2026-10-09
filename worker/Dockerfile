# syntax=docker/dockerfile:1
# Build and run on linux/arm64 (Oracle Cloud Ampere).
FROM --platform=linux/arm64 node:22-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /repo
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/package.json app/package.json
COPY worker/package.json worker/package.json
COPY engine/core/package.json engine/core/package.json
COPY engine/model-providers/package.json engine/model-providers/package.json
COPY engine/intake/package.json engine/intake/package.json
COPY engine/intake-node/package.json engine/intake-node/package.json
COPY engine/canonical/package.json engine/canonical/package.json
COPY engine/shared/package.json engine/shared/package.json
COPY engine/domain-pack/package.json engine/domain-pack/package.json
COPY engine/domain-packs/registry/package.json engine/domain-packs/registry/package.json
COPY engine/domain-packs/iep/package.json engine/domain-packs/iep/package.json
COPY engine/domain-packs/medicaid/package.json engine/domain-packs/medicaid/package.json
COPY engine/domain-packs/bankruptcy/package.json engine/domain-packs/bankruptcy/package.json
COPY engine/domain-packs/_shared/package.json engine/domain-packs/_shared/package.json

RUN pnpm install --frozen-lockfile --filter @hiveforyou/worker...

COPY tsconfig.base.json ./
COPY engine engine
COPY worker worker

RUN pnpm --filter @hiveforyou/worker build

FROM --platform=linux/arm64 node:22-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 10001 hive \
  && useradd --uid 10001 --gid hive --home-dir /app --shell /usr/sbin/nologin hive

WORKDIR /app

COPY --from=build /repo/worker/dist/main.js ./dist/main.js
COPY --from=build /repo/worker/dist/main.js.map ./dist/main.js.map
COPY --from=build /repo/worker/dist/l001-agentic-reader-qualification.js ./dist/l001-agentic-reader-qualification.js
COPY --from=build /repo/worker/dist/l001-agentic-reader-qualification.js.map ./dist/l001-agentic-reader-qualification.js.map
COPY --from=build /repo/worker/dist/package.json ./package.json
COPY engine/domain-packs/iep/study/agents.json ./pack/agents.json

RUN npm install --omit=dev \
  && npm cache clean --force \
  && chown -R hive:hive /app

USER hive
ENV NODE_ENV=production
ENV HIVE_WORKER_HEARTBEAT_PATH=/tmp/hive-worker-heartbeat

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node --input-type=module -e "import{readFileSync}from'node:fs';const p=process.env.HIVE_WORKER_HEARTBEAT_PATH??'/tmp/hive-worker-heartbeat';const ts=Number(readFileSync(p,'utf8').trim());if(!Number.isFinite(ts)||Date.now()-ts>120_000)process.exit(1);"

CMD ["node", "dist/main.js"]
