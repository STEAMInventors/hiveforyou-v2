import {
  CANONICAL_STUDY_PROPOSAL_SCHEMA_V3,
  CANONICAL_STUDY_PROPOSAL_V3_OPENAI_JSON_SCHEMA,
  type CanonicalStudyProposal,
} from "@hiveforyou/shared/case-intelligence/3";
import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import { readStatedWorkPurpose } from "@hiveforyou/shared/canonical-study";

import type { CanonicalStudyPromptInputs } from "../prompts/compose-canonical-study-inputs";
import { ModelCallError, type CallModel } from "../model/call-model";
import {
  CanonicalStudyEngineUnavailableError,
  MalformedCanonicalStudyProposalError,
} from "./study-engine-errors";
import type { RecognitionVocabularyPromptRow } from "@hiveforyou/domain-packs";

import type { ExtractionLocatorCatalog } from "../provenance/serialize-extraction-locator-catalog";
import { serializeEngine2StructureContext } from "./serialize-engine2-structure-context";
import type { CanonicalStudyEngineV3Runtime } from "./engine-v3";
import { normalizeOpenAIClaimValue } from "./normalize-openai-claim-value-v3";
import { engine2RuntimeProposalBindingLines } from "./engine2-proposal-binding";

export type OpenAICanonicalStudyEngineV3Options = {
  model: string;
  reasoningEffort: string;
  maxOutputTokens?: number;
  callModel: CallModel;
};

function normalizeProposal(
  parsed: CanonicalStudyProposal,
  context: CanonicalStudyContext,
  modelId: string,
): CanonicalStudyProposal {
  return {
    ...parsed,
    domainId: context.domainId,
    entities: parsed.entities.map((entity) => ({
      ...entity,
      evidenceRefs: entity.evidenceRefs.map((ref) => ({
        ...ref,
        logicalDocumentId: ref.logicalDocumentId ?? undefined,
        page: ref.page ?? undefined,
        pageEnd: ref.pageEnd ?? undefined,
        spanStart: ref.spanStart ?? undefined,
        spanEnd: ref.spanEnd ?? undefined,
        snippet: ref.snippet ?? undefined,
        extractionId: ref.extractionId ?? undefined,
      })),
    })),
    claims: parsed.claims.map((claim, index) => {
      const normalizedValue = normalizeOpenAIClaimValue(claim.value, {
        claimUnit: claim.unit ?? null,
        path: `claims[${index}].value`,
      });
      return {
        ...claim,
        value: normalizedValue.value,
        unit: normalizedValue.unit,
        effectivePeriod:
          claim.effectivePeriod == null
            ? undefined
            : {
                start: claim.effectivePeriod.start ?? undefined,
                end: claim.effectivePeriod.end ?? undefined,
                precision: claim.effectivePeriod.precision ?? undefined,
              },
        occurredOn: claim.occurredOn ?? undefined,
        evidenceRefs: claim.evidenceRefs.map((ref) => ({
          ...ref,
          logicalDocumentId: ref.logicalDocumentId ?? undefined,
          page: ref.page ?? undefined,
          pageEnd: ref.pageEnd ?? undefined,
          spanStart: ref.spanStart ?? undefined,
          spanEnd: ref.spanEnd ?? undefined,
          snippet: ref.snippet ?? undefined,
          extractionId: ref.extractionId ?? undefined,
        })),
      };
    }),
    missingInformation: parsed.missingInformation.map((item) => ({
      ...item,
      subjectEntityId: item.subjectEntityId ?? undefined,
      relatedConstruct: item.relatedConstruct ?? undefined,
      evidenceRefs:
        item.evidenceRefs == null
          ? undefined
          : item.evidenceRefs.map((ref) => ({
        ...ref,
        logicalDocumentId: ref.logicalDocumentId ?? undefined,
        page: ref.page ?? undefined,
        pageEnd: ref.pageEnd ?? undefined,
        spanStart: ref.spanStart ?? undefined,
        spanEnd: ref.spanEnd ?? undefined,
        snippet: ref.snippet ?? undefined,
        extractionId: ref.extractionId ?? undefined,
      })),
      proposalLineage: {
        proposalItemId: item.proposalLineage.proposalItemId,
        studyRunId: context.studyRunId,
      },
    })),
    modelMetadata: {
      providerId: "openai-canonical-study-engine-v3",
      modelId,
      proposalMode: "production",
    },
    proposedAt: parsed.proposedAt || new Date().toISOString(),
  };
}

function parseProposal(text: string, context: CanonicalStudyContext, modelId: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new MalformedCanonicalStudyProposalError("MALFORMED_PROPOSAL:invalid_json");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new MalformedCanonicalStudyProposalError("MALFORMED_PROPOSAL:not_object");
  }
  const schemaVersion = (parsed as { schemaVersion?: string }).schemaVersion;
  if (schemaVersion !== CANONICAL_STUDY_PROPOSAL_SCHEMA_V3) {
    throw new MalformedCanonicalStudyProposalError(
      "MALFORMED_PROPOSAL:schema_version",
      parsed as CanonicalStudyProposal,
    );
  }
  return normalizeProposal(parsed as CanonicalStudyProposal, context, modelId);
}

/** Engine 2 user-message text (excludes attached file payloads). */
export function buildCanonicalStudyUserMessage(
  composed: CanonicalStudyPromptInputs,
  context: CanonicalStudyContext,
  options?: {
    extractionLocatorCatalog?: ExtractionLocatorCatalog | null;
    extractionReadiness?: import("@hiveforyou/shared/intake/extraction-readiness").ExtractionReadiness | null;
    recognitionVocabulary?: RecognitionVocabularyPromptRow[] | null;
  },
): string {
  const extractionLocatorCatalog = options?.extractionLocatorCatalog;
  const recognitionVocabulary = options?.recognitionVocabulary;
  const statedWorkPurpose = readStatedWorkPurpose(composed.answerSnapshot.userContext);
  const statedPurposeBlock = statedWorkPurpose
    ? [
        "Stated work purpose (user intent — emphasis only, not evidence):",
        statedWorkPurpose,
        "",
      ]
    : [];

  const objectiveBlock = composed.customerContext?.objective
    ? [
        "Customer objective (CUSTOMER_ASSERTION — context only, not evidence):",
        composed.customerContext.objective,
        "",
      ]
    : [];

  const domainPackBlock = [
    "Domain pack (JSON — naming vocabulary and routing context, not evidence):",
    JSON.stringify(
      {
        domainId: context.domainId,
        domainLabel: context.domainLabel,
        domainPackId: context.domainPackId,
        domainPackVersion: context.domainPackVersion,
        recognitionVocabularySupplied: Boolean(
          recognitionVocabulary && recognitionVocabulary.length > 0,
        ),
      },
      null,
      2,
    ),
    "",
  ];

  const logicalManifest = context.logicalDocuments.length
    ? [
        "Logical document manifest (JSON — cite these ids only):",
        JSON.stringify(
          context.logicalDocuments.map((doc) => ({
            logicalDocumentId: doc.id,
            sourceDocumentId: doc.sourceDocumentId,
            pageStart: doc.pageStart,
            pageEnd: doc.pageEnd ?? doc.pageStart,
            documentType: doc.documentType,
            title: doc.title,
            documentDate: doc.documentDate ?? null,
            groupId: doc.groupId,
            familyRole: doc.familyRole,
          })),
          null,
          2,
        ),
        "",
      ]
    : [];

  const structureContext = serializeEngine2StructureContext(context);

  const bindingLines =
    composed.prompt.version === "v4"
      ? []
      : engine2RuntimeProposalBindingLines(composed.prompt.version);
  const returnSchema =
    composed.prompt.version === "v4"
      ? "canonical-study-proposal/4"
      : `canonical-study-proposal/3 for domainId=${context.domainId}`;

  return [
    `Domain workstream: ${context.domainId}`,
    `Study run id (use in proposalLineage.studyRunId): ${context.studyRunId}`,
    "",
    ...statedPurposeBlock,
    ...objectiveBlock,
    ...domainPackBlock,
    "Engine 1 discovery + Structure Map (JSON — context for study, not a semantic allowlist):",
    JSON.stringify(structureContext, null, 2),
    "",
    ...logicalManifest,
    ...(extractionLocatorCatalog
      ? [
          "Persisted extraction locators (JSON — prefer extractionId on evidence refs when citing text):",
          JSON.stringify(extractionLocatorCatalog, null, 2),
          "",
        ]
      : []),
    ...(options?.extractionReadiness
      ? [
          "Unreadable pages (deterministic — do not claim something is absent from a document that has unreadable pages; say it may be on those pages instead):",
          JSON.stringify(options.extractionReadiness, null, 2),
          "",
        ]
      : []),
    ...(recognitionVocabulary && recognitionVocabulary.length > 0
      ? [
          "Domain recognition vocabulary (JSON — abbreviation expansion and surface-form normalization only; not constructs or established facts):",
          JSON.stringify(recognitionVocabulary, null, 2),
          "",
        ]
      : []),
    "Source document metadata (JSON):",
    JSON.stringify(composed.evidenceReferences, null, 2),
    "",
    "Question and answer snapshot (JSON — context only, not documentary evidence):",
    JSON.stringify(composed.answerSnapshot, null, 2),
    "",
    "Attached files are the in-scope source documents for this workstream.",
    "",
    ...bindingLines,
    `Return ${returnSchema}.`,
  ].join("\n");
}

export class OpenAICanonicalStudyEngineV3 {
  constructor(private readonly options: OpenAICanonicalStudyEngineV3Options) {}

  async study(
    context: CanonicalStudyContext,
    runtime?: CanonicalStudyEngineV3Runtime,
  ): Promise<CanonicalStudyProposal> {
    if (!runtime?.composed) {
      throw new CanonicalStudyEngineUnavailableError("STUDY_RUNTIME_MISSING");
    }

    const bytesById = runtime.sourceDocumentBytes ?? new Map<string, Uint8Array>();
    const attachments = context.sourceDocuments.map((source) => {
      const keys = [
        source.sourceDocumentId,
        source.stagedDocumentId,
        source.discoveryDocumentId,
      ].filter((id): id is string => Boolean(id));
      let bytes: Uint8Array | undefined;
      for (const key of keys) {
        bytes = bytesById.get(key);
        if (bytes) {
          break;
        }
      }
      if (!bytes) {
        throw new CanonicalStudyEngineUnavailableError("MISSING_SOURCE_DOCUMENT_BYTES");
      }
      return {
        filename: source.originalFilename,
        bytes,
        mimeType: source.mimeType,
      };
    });

    const userText = buildCanonicalStudyUserMessage(runtime.composed, context, {
      extractionLocatorCatalog: runtime.extractionLocatorCatalog,
      extractionReadiness: runtime.extractionReadiness,
      recognitionVocabulary: runtime.recognitionVocabulary,
    });
    let response;
    try {
      response = await this.options.callModel({
        model: this.options.model,
        reasoningEffort: this.options.reasoningEffort,
        maxOutputTokens: this.options.maxOutputTokens,
        systemPrompt: runtime.composed.system,
        userContent: userText,
        attachments,
        textFormat: {
          type: "json_schema",
          name: "canonical_study_proposal_v3",
          strict: true,
          schema: CANONICAL_STUDY_PROPOSAL_V3_OPENAI_JSON_SCHEMA,
        },
      });
    } catch (error) {
      if (error instanceof CanonicalStudyEngineUnavailableError) {
        throw error;
      }
      if (error instanceof ModelCallError) {
        if (error.kind === "upload_failed") {
          throw new CanonicalStudyEngineUnavailableError("OPENAI_FILE_UPLOAD_FAILED");
        }
        if (
          error.kind === "response_failed" ||
          error.kind === "refused" ||
          error.kind === "truncated"
        ) {
          throw new CanonicalStudyEngineUnavailableError(error.message);
        }
      }
      throw new CanonicalStudyEngineUnavailableError("OPENAI_RESPONSE_FAILED");
    }

    const outputText = response.outputText;
    if (!outputText) {
      throw new MalformedCanonicalStudyProposalError("MALFORMED_PROPOSAL:missing_output_text");
    }
    return parseProposal(outputText, context, this.options.model);
  }
}
