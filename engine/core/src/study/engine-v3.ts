import {
  CANONICAL_STUDY_PROPOSAL_SCHEMA_V3,
  type CanonicalStudyProposal,
} from "@hiveforyou/shared/case-intelligence/3";
import {
  CANONICAL_STUDY_PROPOSAL_SCHEMA_V4,
  type CanonicalStudyProposalV4,
} from "@hiveforyou/shared/case-intelligence/4";
import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";

import type { RecognitionVocabularyPromptRow } from "@hiveforyou/domain-packs";

import type { ExtractionLocatorCatalog } from "../provenance/serialize-extraction-locator-catalog";
import type { ExtractionReadiness } from "@hiveforyou/shared/intake/extraction-readiness";
import type { CanonicalStudyPromptInputs } from "../prompts/compose-canonical-study-inputs";
import { createOpenAICallModel } from "../discover/openai-engine";
import type { CallModel } from "../model/call-model";
import { OpenAICanonicalStudyEngineV3 } from "./openai-engine-v3";
import { OpenAICanonicalStudyEngineV4 } from "./openai-engine-v4";

export type CanonicalStudyEngineV3Runtime = {
  composed: CanonicalStudyPromptInputs;
  sourceDocumentBytes?: Map<string, Uint8Array>;
  extractionLocatorCatalog?: ExtractionLocatorCatalog | null;
  extractionReadiness?: ExtractionReadiness | null;
  recognitionVocabulary?: RecognitionVocabularyPromptRow[] | null;
};

export type CanonicalStudyEngineProposal = CanonicalStudyProposal | CanonicalStudyProposalV4;

export interface CanonicalStudyEngineV3 {
  study(
    context: CanonicalStudyContext,
    runtime?: CanonicalStudyEngineV3Runtime,
  ): Promise<CanonicalStudyEngineProposal>;
}

export class UnconfiguredProductionStudyEngineV3 implements CanonicalStudyEngineV3 {
  async study(): Promise<CanonicalStudyProposal> {
    throw new Error("ENGINE_UNAVAILABLE");
  }
}

/** Deterministic /3 fixture for tests and explicit dev configuration. */
export class FixtureCanonicalStudyEngineV3 implements CanonicalStudyEngineV3 {
  constructor(
    private readonly options: {
      includeChiplessClaim?: boolean;
      invalidSourceDocument?: boolean;
    } = {},
  ) {}

  async study(context: CanonicalStudyContext): Promise<CanonicalStudyProposal> {
    const firstDoc = context.sourceDocuments[0];
    const docId =
      firstDoc?.discoveryDocumentId ?? firstDoc?.stagedDocumentId ?? "missing-doc";
    const logical = context.logicalDocuments[0];
    const strictLogical = context.logicalDocuments.length > 0;

    const entityStudent = "fixture-v3-entity-student";
    const entityDistrict = "fixture-v3-entity-district";
    const claimServices = "fixture-v3-claim-services";
    const claimRelation = "fixture-v3-claim-relation";
    const claimChipless = "fixture-v3-claim-chipless";

    const evidenceRef =
      strictLogical && logical
        ? {
            id: "fixture-v3-evidence-1",
            logicalDocumentId: logical.id,
            sourceDocumentId: this.options.invalidSourceDocument
              ? "unknown-source-id"
              : logical.sourceDocumentId,
            sourceType: "document" as const,
            snippet: "FIXTURE v3 snippet",
            page: logical.pageStart,
          }
        : {
            id: "fixture-v3-evidence-1",
            sourceDocumentId: this.options.invalidSourceDocument ? "unknown-source-id" : docId,
            sourceType: "document" as const,
            snippet: "FIXTURE v3 snippet",
            page: 1,
          };

    const claims: CanonicalStudyProposal["claims"] = [
      {
        id: claimServices,
        subjectEntityId: entityStudent,
        construct: "weekly_specialized_instruction_minutes",
        value: { kind: "quantity", amount: 300 },
        unit: "minutes",
        role: "current",
        evidenceRefs: [evidenceRef],
      },
      {
        id: claimRelation,
        subjectEntityId: entityStudent,
        construct: "enrolled_with",
        value: { kind: "entity_ref", entityId: entityDistrict },
        role: "observed",
        evidenceRefs: [evidenceRef],
      },
    ];

    if (this.options.includeChiplessClaim) {
      claims.push({
        id: claimChipless,
        subjectEntityId: entityStudent,
        construct: "unsupported_fact",
        value: { kind: "text", text: "No chip" },
        role: "unknown",
        evidenceRefs: [],
      });
    }

    return {
      schemaVersion: CANONICAL_STUDY_PROPOSAL_SCHEMA_V3,
      domainId: context.domainId,
      entities: [
        {
          id: entityStudent,
          entityType: "student",
          label: "FIXTURE Student",
          evidenceRefs: [evidenceRef],
        },
        {
          id: entityDistrict,
          entityType: "school_district",
          label: "FIXTURE District",
          evidenceRefs: [evidenceRef],
        },
      ],
      claims,
      conflicts: [
        {
          id: "fixture-v3-conflict-1",
          claimIds: [claimServices, claimRelation],
          kind: "other",
        },
      ],
      missingInformation: [
        {
          id: "fixture-v3-missing-1",
          description: "FIXTURE: prior evaluation report not in supplied set",
          proposalLineage: {
            proposalItemId: "fixture-v3-missing-1",
            studyRunId: context.studyRunId,
          },
        },
      ],
      modelMetadata: {
        providerId: "fixture-canonical-study-engine-v3",
        modelId: "fixture-v3",
        proposalMode: "fixture",
      },
      proposedAt: new Date().toISOString(),
    };
  }
}

export type StudyEngineV3Mode = "fixture" | "openai" | "unconfigured";

export type CanonicalStudyEngineV3Env = {
  engine?: string;
  openaiApiKey?: string;
  model?: string;
  reasoningEffort?: string;
  maxOutputTokens?: number;
};

function normalizeEngineEnv(
  input: string | CanonicalStudyEngineV3Env | undefined,
): CanonicalStudyEngineV3Env {
  if (typeof input === "string" || input === undefined) {
    return { engine: input };
  }
  return input;
}

/** Fixture engine for canonical-study-proposal/4. */
export class FixtureCanonicalStudyEngineV4 implements CanonicalStudyEngineV3 {
  async study(context: CanonicalStudyContext): Promise<CanonicalStudyProposalV4> {
    const firstDoc = context.sourceDocuments[0];
    const docId =
      firstDoc?.discoveryDocumentId ?? firstDoc?.stagedDocumentId ?? "missing-doc";
    const logical = context.logicalDocuments[0];
    const evidenceRef = {
      id: "fixture-v4-evidence-1",
      sourceDocumentId: logical?.sourceDocumentId ?? docId,
      logicalDocumentId: logical?.id,
      sourceType: "document" as const,
      quote: "FIXTURE v4 quote",
      page: logical?.pageStart ?? 1,
    };
    const entityStudent = "fixture-v4-entity-student";
    const claimServices = "fixture-v4-claim-services";
    return {
      schemaVersion: CANONICAL_STUDY_PROPOSAL_SCHEMA_V4,
      domainId: context.domainId,
      entities: [
        {
          id: entityStudent,
          entityType: "student",
          label: "FIXTURE Student",
          aliases: [],
          evidenceRefs: [evidenceRef],
        },
      ],
      claims: [
        {
          id: claimServices,
          subjectEntityId: entityStudent,
          construct: {
            measure: "weekly_specialized_instruction_minutes",
            task: null,
            administration: null,
          },
          value: { kind: "quantity", numberValue: 300, unit: "minutes" },
          unit: "minutes",
          modality: "required",
          evidenceRefs: [evidenceRef],
        },
      ],
      conflicts: [],
      missingInformation: [],
      modelMetadata: {
        providerId: "fixture-canonical-study-engine-v4",
        modelId: "fixture-v4",
        proposalMode: "fixture",
      },
      proposedAt: new Date().toISOString(),
    };
  }
}

export type CreateCanonicalStudyEngineOptions = {
  promptVersion?: "v3" | "v4";
  callModel?: CallModel;
};

export function createCanonicalStudyEngineV3FromEnv(
  input: string | CanonicalStudyEngineV3Env | undefined,
  options?: CreateCanonicalStudyEngineOptions,
): {
  engine: CanonicalStudyEngineV3;
  mode: StudyEngineV3Mode;
  providerId: string;
  modelId?: string;
} {
  const env = normalizeEngineEnv(input);
  const normalized = env.engine?.trim().toLowerCase();
  const promptVersion = options?.promptVersion ?? "v3";

  if (normalized === "fixture") {
    if (promptVersion === "v4") {
      return {
        engine: new FixtureCanonicalStudyEngineV4(),
        mode: "fixture",
        providerId: "fixture-canonical-study-engine-v4",
        modelId: "fixture-v4",
      };
    }
    return {
      engine: new FixtureCanonicalStudyEngineV3(),
      mode: "fixture",
      providerId: "fixture-canonical-study-engine-v3",
      modelId: "fixture-v3",
    };
  }

  if (normalized === "openai") {
    const apiKey = env.openaiApiKey?.trim();
    const model = env.model?.trim() || "gpt-5.6-sol";
    const reasoningEffort = env.reasoningEffort?.trim() || "medium";
    const maxOutputTokens = env.maxOutputTokens;
    if (!apiKey) {
      return {
        engine: new UnconfiguredProductionStudyEngineV3(),
        mode: "openai",
        providerId:
          promptVersion === "v4"
            ? "openai-canonical-study-engine-v4"
            : "openai-canonical-study-engine-v3",
        modelId: model,
      };
    }
    const callModel = options?.callModel ?? createOpenAICallModel({ apiKey });
    if (promptVersion === "v4") {
      return {
        engine: new OpenAICanonicalStudyEngineV4({
          model,
          reasoningEffort,
          maxOutputTokens,
          callModel,
        }),
        mode: "openai",
        providerId: "openai-canonical-study-engine-v4",
        modelId: model,
      };
    }
    return {
      engine: new OpenAICanonicalStudyEngineV3({
        model,
        reasoningEffort,
        maxOutputTokens,
        callModel,
      }),
      mode: "openai",
      providerId: "openai-canonical-study-engine-v3",
      modelId: model,
    };
  }

  return {
    engine: new UnconfiguredProductionStudyEngineV3(),
    mode: "unconfigured",
    providerId: "unconfigured",
  };
}

