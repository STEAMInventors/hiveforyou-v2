import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { CallModel } from "@hiveforyou/shared/model/call-model";
import { parseModelUsage } from "./usage.js";
import type { GoldenCase } from "../../../engine/eval/src/index.js";
import type { GradeCorpusContext } from "../../../engine/eval/src/index.js";
import type { ReaderExperimentCandidateFact } from "../../../engine/eval/src/reader-experiment/fact-match.js";

import type { InitialIepFactCatalog } from "./catalog-types.js";
import type { L001DocumentBundle } from "./corpus.js";
import { conservativeDeduplicateCandidateFacts } from "./dedup.js";
import { createLocalReaderVerifier } from "./local-verifier.js";
import { parseExtractionResponse } from "./parse-proposals.js";
import {
  buildAtomicExtractionUserPrompt,
  buildCaseWideCatalogUserPrompt,
  buildRelationshipExtractionUserPrompt,
  buildStableSystemPrompt,
  ONTOLOGY_EXPERIMENT_BUDGET,
} from "./prompt.js";
import { mapWithConcurrency } from "./run-pool.js";
import type { ModeRunMetrics } from "./metrics.js";
import { summarizeModeMetrics } from "./metrics.js";

export type ExtractionMode = "A" | "B" | "C";

export type CallTrace = {
  callId: string;
  mode: ExtractionMode;
  scope: "document" | "case" | "relationship";
  sourceDocumentId?: string;
  filename?: string;
  phase: "atomic" | "relationship";
  elapsedMs: number;
  proposed: number;
  droppedParse: number;
  inputTokens: number;
  outputTokens: number;
};

export type ModeRunResult = {
  mode: ExtractionMode;
  metrics: ModeRunMetrics;
  accepted: ReaderExperimentCandidateFact[];
  traces: CallTrace[];
  dedup: { preMergeCount: number; postMergeCount: number; removedCount: number };
};

const OUTPUT_SCHEMA = {
  type: "json_schema" as const,
  name: "ontology_extraction",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      proposals: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
    required: ["proposals"],
  },
};

function estimateCostUsd(inputTokens: number, outputTokens: number, provider: string): number {
  if (provider === "anthropic") {
    return (inputTokens / 1_000_000) * 15 + (outputTokens / 1_000_000) * 75;
  }
  return (inputTokens / 1_000_000) * 2.5 + (outputTokens / 1_000_000) * 10;
}

async function invokeExtractionCall(input: {
  callModel: CallModel;
  modelName: string;
  provider: string;
  catalog: InitialIepFactCatalog;
  userPrompt: string;
  meta: Omit<CallTrace, "elapsedMs" | "proposed" | "droppedParse" | "inputTokens" | "outputTokens">;
}): Promise<{ candidates: ReaderExperimentCandidateFact[]; trace: CallTrace }> {
  const started = performance.now();
  const response = await input.callModel({
    model: input.modelName,
    temperature: ONTOLOGY_EXPERIMENT_BUDGET.temperature,
    maxOutputTokens: ONTOLOGY_EXPERIMENT_BUDGET.maxOutputTokens,
    systemPrompt: buildStableSystemPrompt(input.catalog),
    userContent: input.userPrompt,
    textFormat: OUTPUT_SCHEMA,
    logLabel: "t3-9-ontology",
  });
  const usage = parseModelUsage(response.usage);
  const parsed = parseExtractionResponse(response.outputText, input.catalog);
  return {
    candidates: parsed.candidates,
    trace: {
      ...input.meta,
      elapsedMs: Math.round(performance.now() - started),
      proposed: parsed.proposals.length,
      droppedParse: parsed.dropped,
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
    },
  };
}

async function verifyAll(
  bundles: L001DocumentBundle[],
  candidates: ReaderExperimentCandidateFact[],
): Promise<{ accepted: ReaderExperimentCandidateFact[]; rejected: number }> {
  const verifier = createLocalReaderVerifier(bundles);
  const accepted: ReaderExperimentCandidateFact[] = [];
  let rejected = 0;
  for (const candidate of candidates) {
    const result = await verifier.verifyCandidate(candidate);
    if (result.accepted) {
      accepted.push(candidate);
    } else {
      rejected += 1;
    }
  }
  return { accepted, rejected };
}

export async function runOntologyMode(input: {
  mode: ExtractionMode;
  catalog: InitialIepFactCatalog;
  golden: GoldenCase;
  corpus: GradeCorpusContext;
  bundles: L001DocumentBundle[];
  callModel: CallModel;
  modelName: string;
  provider: string;
  resultsDir: string;
}): Promise<ModeRunResult> {
  const runStarted = performance.now();
  const traces: CallTrace[] = [];
  let proposed = 0;
  let droppedParse = 0;
  let tokenInput = 0;
  let tokenOutput = 0;
  let candidates: ReaderExperimentCandidateFact[] = [];

  if (input.mode === "A" || input.mode === "C") {
    const perDoc = await mapWithConcurrency(
      input.bundles,
      ONTOLOGY_EXPERIMENT_BUDGET.concurrency,
      async (bundle) => {
        const userPrompt = buildAtomicExtractionUserPrompt({
          catalog: input.catalog,
          scope: "document",
          bundles: [bundle],
          phase: "atomic",
        });
        return invokeExtractionCall({
          callModel: input.callModel,
          modelName: input.modelName,
          provider: input.provider,
          catalog: input.catalog,
          userPrompt,
          meta: {
            callId: `A-doc-${bundle.filename}`,
            mode: input.mode,
            scope: "document",
            sourceDocumentId: bundle.sourceDocumentId,
            filename: bundle.filename,
            phase: "atomic",
          },
        });
      },
    );
    for (const result of perDoc) {
      traces.push(result.trace);
      proposed += result.trace.proposed;
      droppedParse += result.trace.droppedParse;
      tokenInput += result.trace.inputTokens;
      tokenOutput += result.trace.outputTokens;
      candidates.push(...result.candidates);
    }
  }

  if (input.mode === "B") {
    const userPrompt = buildCaseWideCatalogUserPrompt({
      catalog: input.catalog,
      bundles: input.bundles,
    });
    const caseWide = await invokeExtractionCall({
      callModel: input.callModel,
      modelName: input.modelName,
      provider: input.provider,
      catalog: input.catalog,
      userPrompt,
      meta: {
        callId: "B-case-wide",
        mode: "B",
        scope: "case",
        phase: "atomic",
      },
    });
    traces.push(caseWide.trace);
    proposed += caseWide.trace.proposed;
    droppedParse += caseWide.trace.droppedParse;
    tokenInput += caseWide.trace.inputTokens;
    tokenOutput += caseWide.trace.outputTokens;
    candidates = caseWide.candidates;
  }

  const atomicVerified =
    input.mode === "A" || input.mode === "C"
      ? await verifyAll(input.bundles, candidates)
      : { accepted: [] as ReaderExperimentCandidateFact[], rejected: 0 };

  if (input.mode === "A") {
    const deduped = conservativeDeduplicateCandidateFacts(atomicVerified.accepted);
    const modeDir = join(input.resultsDir, "mode-A");
    mkdirSync(modeDir, { recursive: true });
    writeFileSync(join(modeDir, "trace.json"), JSON.stringify({ traces, dedup: deduped.stats }, null, 2));
    for (const trace of traces) {
      if (trace.filename) {
        writeFileSync(
          join(modeDir, `trace-${trace.filename.replace(/\.pdf$/i, "")}.json`),
          JSON.stringify(trace, null, 2),
        );
      }
    }
    const metrics = summarizeModeMetrics({
      golden: input.golden,
      corpus: input.corpus,
      proposed: proposed,
      accepted: deduped.facts,
      rejected: atomicVerified.rejected + droppedParse,
      tokenUse: { inputTokens: tokenInput, outputTokens: tokenOutput },
      estimatedCostUsd: estimateCostUsd(tokenInput, tokenOutput, input.provider),
      elapsedMs: Math.round(performance.now() - runStarted),
    });
    return {
      mode: "A",
      metrics,
      accepted: deduped.facts,
      traces,
      dedup: deduped.stats,
    };
  }

  if (input.mode === "B") {
    const verified = await verifyAll(input.bundles, candidates);
    const deduped = conservativeDeduplicateCandidateFacts(verified.accepted);
    const modeDir = join(input.resultsDir, "mode-B");
    mkdirSync(modeDir, { recursive: true });
    writeFileSync(join(modeDir, "trace.json"), JSON.stringify({ traces, dedup: deduped.stats }, null, 2));
    const metrics = summarizeModeMetrics({
      golden: input.golden,
      corpus: input.corpus,
      proposed,
      accepted: deduped.facts,
      rejected: verified.rejected + droppedParse,
      tokenUse: { inputTokens: tokenInput, outputTokens: tokenOutput },
      estimatedCostUsd: estimateCostUsd(tokenInput, tokenOutput, input.provider),
      elapsedMs: Math.round(performance.now() - runStarted),
    });
    return { mode: "B", metrics, accepted: deduped.facts, traces, dedup: deduped.stats };
  }

  // Mode C: validated atomics from A + case-wide relationship extraction
  const dedupAtomics = conservativeDeduplicateCandidateFacts(atomicVerified.accepted);
  const relationshipPrompt = buildRelationshipExtractionUserPrompt({
    catalog: input.catalog,
    bundles: input.bundles,
    acceptedAtomicsJson: JSON.stringify(dedupAtomics.facts),
  });
  const rel = await invokeExtractionCall({
    callModel: input.callModel,
    modelName: input.modelName,
    provider: input.provider,
    catalog: input.catalog,
    userPrompt: relationshipPrompt,
    meta: {
      callId: "C-case-relationship",
      mode: "C",
      scope: "relationship",
      phase: "relationship",
    },
  });
  traces.push(rel.trace);
  proposed += rel.trace.proposed;
  droppedParse += rel.trace.droppedParse;
  tokenInput += rel.trace.inputTokens;
  tokenOutput += rel.trace.outputTokens;

  const mergedCandidates = [...dedupAtomics.facts, ...rel.candidates];
  const relVerified = await verifyAll(input.bundles, rel.candidates);
  const accepted = [...dedupAtomics.facts, ...relVerified.accepted];
  const finalDedup = conservativeDeduplicateCandidateFacts(accepted);

  const modeDir = join(input.resultsDir, "mode-C");
  mkdirSync(modeDir, { recursive: true });
  writeFileSync(
    join(modeDir, "trace.json"),
    JSON.stringify({ traces, dedupAtomics: dedupAtomics.stats, dedupFinal: finalDedup.stats }, null, 2),
  );
  for (const trace of traces) {
    if (trace.filename) {
      writeFileSync(
        join(modeDir, `trace-${trace.filename.replace(/\.pdf$/i, "")}.json`),
        JSON.stringify(trace, null, 2),
      );
    }
  }

  const metrics = summarizeModeMetrics({
    golden: input.golden,
    corpus: input.corpus,
    proposed,
    accepted: finalDedup.facts,
    rejected: atomicVerified.rejected + relVerified.rejected + droppedParse,
    tokenUse: { inputTokens: tokenInput, outputTokens: tokenOutput },
    estimatedCostUsd: estimateCostUsd(tokenInput, tokenOutput, input.provider),
    elapsedMs: Math.round(performance.now() - runStarted),
  });

  return {
    mode: "C",
    metrics,
    accepted: finalDedup.facts,
    traces,
    dedup: finalDedup.stats,
  };
}
