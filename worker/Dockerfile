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
COPY engine/eval/reports/reader-experiment/prompt-hashes.json ./pack/reader-experiment-prompt-hashes.json
COPY engine/intake/fixtures/l001/manifest.json ./pack/l001-qualification-manifest.json

ENV HIVE_READER_EXPERIMENT_PROMPT_HASHES_JSON=/app/pack/reader-experiment-prompt-hashes.json
ENV HIVE_L001_QUALIFICATION_MANIFEST_JSON=/app/pack/l001-qualification-manifest.json

RUN node --input-type=module -e "\
import { readFileSync } from 'node:fs';\
const path = process.env.HIVE_READER_EXPERIMENT_PROMPT_HASHES_JSON;\
if (!path) throw new Error('HIVE_READER_EXPERIMENT_PROMPT_HASHES_JSON missing');\
const parsed = JSON.parse(readFileSync(path, 'utf8'));\
for (const key of ['promptVersion', 'sharedPromptSha256']) {\
  if (typeof parsed[key] !== 'string' || !parsed[key].trim()) {\
    throw new Error('READER_EXPERIMENT_PROMPT_HASHES_INVALID:' + key);\
  }\
}\
"

RUN node --input-type=module -e "\
import { readFileSync } from 'node:fs';\
const path = process.env.HIVE_L001_QUALIFICATION_MANIFEST_JSON;\
if (!path) throw new Error('HIVE_L001_QUALIFICATION_MANIFEST_JSON missing');\
const expected = new Set([\
  '8ae4ac0ce3009151dea07f9751e65fab11d9147a67f2eec2f5f1ecd09be4629d',\
  'ffd4ebe21c06d6e365d9d581b996e17a79a7f81207722e83b1c1005dc70935c6',\
  '864013b7e57a576ce6587589c67baa03003cf56c7cf0fb4fc01c2f6b43aded9c',\
  '7496e950f951b666a7d532ad8c8d782946b60688650084c84b5ebebf9b17ef7d',\
  '5fde3e11eaeb224daa7df5a61e72dd9d351dc6c02ee634e5ee51ee478449ec3f',\
  '8adc5107634a1be4ab7d9b4f0817b0f254331ce1598de4ac5a859d1257e810fd',\
  '35b0594bbbbc68239a3dad3a657290b1ea08093e2290a0d093ef716ca1c72ba2',\
  '1e6b380e4a348029a97d1648228530b8cb060609c1ec30404cc43545d9833e2c',\
]);\
let parsed;\
try { parsed = JSON.parse(readFileSync(path, 'utf8')); } catch { throw new Error('L001_QUALIFICATION_MANIFEST_INVALID:' + path + ':json'); }\
const files = parsed?.files;\
if (!Array.isArray(files) || files.length !== expected.size) throw new Error('L001_QUALIFICATION_MANIFEST_INVALID:' + path + ':files');\
const seen = new Set();\
for (const entry of files) {\
  const sha = typeof entry?.sha256 === 'string' ? entry.sha256.toLowerCase() : '';\
  const filename = typeof entry?.filename === 'string' ? entry.filename.trim() : '';\
  if (!filename || !/^[a-f0-9]{64}$/.test(sha)) throw new Error('L001_QUALIFICATION_MANIFEST_INVALID:' + path + ':file_entry');\
  seen.add(sha);\
}\
if (seen.size !== expected.size) throw new Error('L001_QUALIFICATION_MANIFEST_PIN_MISMATCH:' + path);\
for (const hash of expected) { if (!seen.has(hash)) throw new Error('L001_QUALIFICATION_MANIFEST_PIN_MISMATCH:' + path); }\
"

RUN npm install --omit=dev \
  && npm cache clean --force \
  && chown -R hive:hive /app

USER hive
ENV NODE_ENV=production
ENV HIVE_WORKER_HEARTBEAT_PATH=/tmp/hive-worker-heartbeat

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node --input-type=module -e "import{readFileSync}from'node:fs';const p=process.env.HIVE_WORKER_HEARTBEAT_PATH??'/tmp/hive-worker-heartbeat';const ts=Number(readFileSync(p,'utf8').trim());if(!Number.isFinite(ts)||Date.now()-ts>120_000)process.exit(1);"

CMD ["node", "dist/main.js"]
