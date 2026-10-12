import type { ReaderDocumentExtractionEnvelope } from "@hiveforyou/shared/reader-document-extraction";
import { PACK_DRIVEN_READER_PROMPT_VERSION } from "@hiveforyou/domain-pack/pack-driven-reader";

import type { StudyEngineFingerprint } from "./fingerprint";
import { loadPackDrivenProposalPackContentSha256 } from "./agentic-reader-qualification.js";

/** Stable orchestration id for pack-driven Reader runs (not a model vendor). */
export const PACK_DRIVEN_READER_ORCHESTRATION_ID = "pack-driven-reader" as const;

/** Run-level provider mode when Worker delegates extraction to hive-agents Reader. */
export const READER_DELEGATED_PROVIDER_MODE = "reader_delegated" as const;

export type ReaderDelegatedProviderMode = typeof READER_DELEGATED_PROVIDER_MODE;

export type ReaderPreflightSnapshot = {
  modelProvider: string;
  modelName: string;
  observedAt: string;
  source: "hive-agents/health";
};

export type ObservedReaderIdentitySummary = {
  attemptId: string;
  distinctModelProviders: string[];
  distinctModelIds: string[];
  documentCount: number;
  succeededDocumentCount: number;
  failedDocumentCount: number;
  source: "hive.reader-document-extraction/1";
};

export type AgentsHealthResponse = {
  status?: string;
  modelProvider?: string;
  modelName?: string;
};

export function parseReaderPreflightFromAgentsHealth(
  raw: AgentsHealthResponse,
  observedAt: string = new Date().toISOString(),
): ReaderPreflightSnapshot | null {
  const modelProvider = raw.modelProvider?.trim();
  const modelName = raw.modelName?.trim();
  if (!modelProvider || !modelName) {
    return null;
  }
  return {
    modelProvider,
    modelName,
    observedAt,
    source: "hive-agents/health",
  };
}

export async function fetchReaderPreflightFromAgentsHealth(
  baseUrl: string,
): Promise<ReaderPreflightSnapshot | null> {
  const url = baseUrl.replace(/\/$/, "") + "/health";
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }
  const payload = (await response.json()) as AgentsHealthResponse;
  if (payload.status !== "ok") {
    return null;
  }
  return parseReaderPreflightFromAgentsHealth(payload);
}

export function buildPackDrivenReaderIntentFingerprint(input?: {
  env?: Record<string, string | undefined>;
  proposalPackContentSha256?: string;
}): StudyEngineFingerprint {
  const env = input?.env ?? (typeof process !== "undefined" ? process.env : {});
  const proposalSha =
    input?.proposalPackContentSha256?.trim() ||
    loadPackDrivenProposalPackContentSha256(env as Record<string, string | undefined>);
  return {
    providerMode: READER_DELEGATED_PROVIDER_MODE,
    providerId: PACK_DRIVEN_READER_ORCHESTRATION_ID,
    promptVersion: "pack_driven_v1",
    promptSha256: proposalSha,
    readerCompilerVersion: PACK_DRIVEN_READER_PROMPT_VERSION,
  };
}

export function buildObservedReaderIdentitySummary(input: {
  attemptId: string;
  envelopes: readonly Pick<
    ReaderDocumentExtractionEnvelope,
    "modelProvider" | "modelId" | "status"
  >[];
}): ObservedReaderIdentitySummary {
  const providers = new Set<string>();
  const modelIds = new Set<string>();
  let succeededDocumentCount = 0;
  let failedDocumentCount = 0;

  for (const envelope of input.envelopes) {
    if (envelope.modelProvider?.trim()) {
      providers.add(envelope.modelProvider.trim());
    }
    if (envelope.modelId?.trim()) {
      modelIds.add(envelope.modelId.trim());
    }
    if (envelope.status === "SUCCEEDED") {
      succeededDocumentCount += 1;
    } else {
      failedDocumentCount += 1;
    }
  }

  return {
    attemptId: input.attemptId,
    distinctModelProviders: [...providers].sort(),
    distinctModelIds: [...modelIds].sort(),
    documentCount: input.envelopes.length,
    succeededDocumentCount,
    failedDocumentCount,
    source: "hive.reader-document-extraction/1",
  };
}

export function displayModelIdentityFromSummary(
  summary: ObservedReaderIdentitySummary | null | undefined,
  envelopes: readonly Pick<ReaderDocumentExtractionEnvelope, "modelProvider" | "modelId">[],
): { modelProvider: string | null; modelId: string | null } {
  if (summary) {
    if (summary.distinctModelProviders.length === 1 && summary.distinctModelIds.length === 1) {
      return {
        modelProvider: summary.distinctModelProviders[0] ?? null,
        modelId: summary.distinctModelIds[0] ?? null,
      };
    }
    if (summary.distinctModelProviders.length > 1 || summary.distinctModelIds.length > 1) {
      return {
        modelProvider:
          summary.distinctModelProviders.length > 0
            ? summary.distinctModelProviders.join(", ")
            : null,
        modelId:
          summary.distinctModelIds.length > 0 ? summary.distinctModelIds.join(", ") : null,
      };
    }
  }

  const providers = new Set(envelopes.map((row) => row.modelProvider).filter(Boolean));
  const modelIds = new Set(envelopes.map((row) => row.modelId).filter(Boolean));
  if (providers.size === 1 && modelIds.size === 1) {
    return {
      modelProvider: [...providers][0] ?? null,
      modelId: [...modelIds][0] ?? null,
    };
  }
  if (providers.size > 1 || modelIds.size > 1) {
    return {
      modelProvider: [...providers].sort().join(", ") || null,
      modelId: [...modelIds].sort().join(", ") || null,
    };
  }
  const first = envelopes[0];
  return {
    modelProvider: first?.modelProvider ?? null,
    modelId: first?.modelId ?? null,
  };
}
