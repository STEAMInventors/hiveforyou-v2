/**
 * Real OpenAI L001 corpus discover smoke (Engine 1).
 *
 * Requires:
 * - OPENAI_API_KEY
 * - HIVE_DISCOVER_ENGINE=openai
 * - HIVE_DISCOVER_PROMPT_VERSION=discover-v2 (adaptive) or discover-v1 (legacy)
 * - Local L001 PDF paths in L001_CORPUS_PATHS (comma-separated)
 *
 * Example (PowerShell):
 *   $env:OPENAI_API_KEY="sk-..."
 *   $env:HIVE_DISCOVER_ENGINE="openai"
 *   $env:HIVE_DISCOVER_PROMPT_VERSION="discover-v2"
 *   $env:L001_CORPUS_PATHS="C:\path\iep.pdf,C:\path\eval.pdf"
 *   node packages/core/scripts/openai-l001-discover.mjs
 */

import { readFileSync } from "node:fs";

import {
  createDiscoverEngineFromEnv,
  createDiscoverResolutionEngineFromEnv,
  loadDiscoverPrompt,
  loadDiscoverResolutionPrompt,
  runDiscover,
} from "@hiveforyou/core";
import {
  InMemoryDiscoverArtifactRepository,
  InMemoryDiscoverRunRepository,
  InMemorySourceDocumentRepository,
  InMemorySourceDocumentStorage,
} from "@hiveforyou/core";
import {
  InMemoryDiscoverCustomerAnswerRepository,
  InMemoryDiscoverQuestionRepository,
} from "@hiveforyou/core";

const paths = (process.env.L001_CORPUS_PATHS ?? "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

if (!paths.length) {
  console.error("Set L001_CORPUS_PATHS to comma-separated local PDF paths.");
  process.exit(1);
}

const promptVersion = process.env.HIVE_DISCOVER_PROMPT_VERSION ?? "discover-v2";
const adaptive = promptVersion.includes("v2");

const caseId = "l001-openai-case";
const userId = "l001-openai-user";
const documents = new InMemorySourceDocumentRepository();
const storage = new InMemorySourceDocumentStorage(userId);
const sourceDocumentIds = [];

for (const [index, filePath] of paths.entries()) {
  const id = `l001-src-${index + 1}`;
  sourceDocumentIds.push(id);
  const bytes = readFileSync(filePath);
  const filename = filePath.split(/[/\\]/).pop() ?? `doc-${index + 1}.pdf`;
  await documents.insert({
    id,
    userId,
    caseId,
    intakeRunId: null,
    studyRunId: null,
    clientStagedId: id,
    originalFilename: filename,
    mimeType: "application/pdf",
    sizeBytes: bytes.byteLength,
    storageBucket: "case-documents",
    storagePath: `l001/${id}/${filename}`,
    sha256: undefined,
    status: "stored",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await storage.upload({
    userId,
    caseId,
    sourceDocumentId: id,
    originalFilename: filename,
    bytes: new Uint8Array(bytes),
    bucket: "case-documents",
  });
}

const outcome = await runDiscover(
  { caseId, sourceDocumentIds },
  {
    sessionUserId: userId,
    engineConfig: createDiscoverEngineFromEnv(
      {
        engine: process.env.HIVE_DISCOVER_ENGINE ?? "openai",
        openaiApiKey: process.env.OPENAI_API_KEY,
        model: process.env.HIVE_DISCOVER_MODEL,
        reasoningEffort: process.env.HIVE_DISCOVER_REASONING_EFFORT,
      },
      { adaptiveV2: adaptive },
    ),
    prompt: loadDiscoverPrompt(promptVersion),
    documents,
    storage,
    runRepo: new InMemoryDiscoverRunRepository(),
    artifactRepo: new InMemoryDiscoverArtifactRepository(),
    adaptive: adaptive
      ? {
          resolutionEngine: createDiscoverResolutionEngineFromEnv({
            engine: process.env.HIVE_DISCOVER_ENGINE ?? "openai",
            openaiApiKey: process.env.OPENAI_API_KEY,
            model: process.env.HIVE_DISCOVER_MODEL,
            reasoningEffort: process.env.HIVE_DISCOVER_REASONING_EFFORT,
          }).engine,
          resolutionPrompt: loadDiscoverResolutionPrompt(),
          questionRepo: new InMemoryDiscoverQuestionRepository(),
          answerRepo: new InMemoryDiscoverCustomerAnswerRepository(),
        }
      : undefined,
  },
);

console.log(JSON.stringify({ status: outcome.run.status, runId: outcome.run.discoverRunId }, null, 2));
