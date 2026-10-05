import {
  CANONICAL_STUDY_PROPOSAL_SCHEMA_V4,
  CANONICAL_STUDY_PROPOSAL_V4_OPENAI_JSON_SCHEMA,
  type CanonicalStudyProposalV4,
} from "@hiveforyou/shared/case-intelligence/4";
import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";

import type { CallModel } from "../model/call-model";
import type { CanonicalStudyEngineV3Runtime } from "./engine-v3";
import { buildCanonicalStudyUserMessage } from "./openai-engine-v3";
import { normalizeOpenAIClaimValue } from "./normalize-openai-claim-value-v3";
import {
  CanonicalStudyEngineUnavailableError,
  MalformedCanonicalStudyProposalError,
} from "./study-engine-errors";

export type OpenAICanonicalStudyEngineV4Options = {
  model: string;
  reasoningEffort: string;
  maxOutputTokens?: number;
  callModel: CallModel;
};

function normalizeProposalV4(
  parsed: CanonicalStudyProposalV4,
  context: CanonicalStudyContext,
  modelId: string,
): CanonicalStudyProposalV4 {
  return {
    ...parsed,
    domainId: context.domainId,
    entities: parsed.entities.map((entity) => ({
      ...entity,
      aliases: entity.aliases ?? [],
      evidenceRefs: entity.evidenceRefs.map((ref) => ({
        ...ref,
        logicalDocumentId: ref.logicalDocumentId ?? undefined,
        page: ref.page ?? undefined,
        pageEnd: ref.pageEnd ?? undefined,
        spanStart: ref.spanStart ?? undefined,
        spanEnd: ref.spanEnd ?? undefined,
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
        construct: {
          measure: claim.construct.measure,
          task: claim.construct.task ?? null,
          administration: claim.construct.administration ?? null,
        },
        value: {
          kind: normalizedValue.value.kind,
          numberValue:
            normalizedValue.value.kind === "quantity" ? normalizedValue.value.amount : null,
          textValue: normalizedValue.value.kind === "text" ? normalizedValue.value.text : null,
          codeValue: normalizedValue.value.kind === "code" ? normalizedValue.value.code : null,
          booleanValue:
            normalizedValue.value.kind === "boolean" ? normalizedValue.value.value : null,
          entityId:
            normalizedValue.value.kind === "entity_ref" ? normalizedValue.value.entityId : null,
          dateValue: normalizedValue.value.kind === "date" ? normalizedValue.value.value : null,
          periodStart:
            normalizedValue.value.kind === "period" ? (normalizedValue.value.start ?? null) : null,
          periodEnd:
            normalizedValue.value.kind === "period" ? (normalizedValue.value.end ?? null) : null,
          unit: normalizedValue.unit,
        },
        unit: normalizedValue.unit,
        evidenceRefs: claim.evidenceRefs.map((ref) => ({
          ...ref,
          logicalDocumentId: ref.logicalDocumentId ?? undefined,
          page: ref.page ?? undefined,
          pageEnd: ref.pageEnd ?? undefined,
          spanStart: ref.spanStart ?? undefined,
          spanEnd: ref.spanEnd ?? undefined,
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
              extractionId: ref.extractionId ?? undefined,
            })),
      proposalLineage: {
        proposalItemId: item.proposalLineage.proposalItemId,
        studyRunId: context.studyRunId,
      },
    })),
    modelMetadata: {
      providerId: "openai-canonical-study-engine-v4",
      modelId,
      proposalMode: "production",
    },
    proposedAt: parsed.proposedAt || new Date().toISOString(),
  };
}

function parseProposalV4(text: string, context: CanonicalStudyContext, modelId: string) {
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
  if (schemaVersion !== CANONICAL_STUDY_PROPOSAL_SCHEMA_V4) {
    throw new MalformedCanonicalStudyProposalError(
      "MALFORMED_PROPOSAL:schema_version",
      parsed as CanonicalStudyProposalV4,
    );
  }
  return normalizeProposalV4(parsed as CanonicalStudyProposalV4, context, modelId);
}

export class OpenAICanonicalStudyEngineV4 {
  constructor(private readonly options: OpenAICanonicalStudyEngineV4Options) {}

  async study(
    context: CanonicalStudyContext,
    runtime?: CanonicalStudyEngineV3Runtime,
  ): Promise<CanonicalStudyProposalV4> {
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
          name: "canonical_study_proposal_v4",
          strict: true,
          schema: CANONICAL_STUDY_PROPOSAL_V4_OPENAI_JSON_SCHEMA,
        },
      });
    } catch (error) {
      if (error instanceof CanonicalStudyEngineUnavailableError) {
        throw error;
      }
      if (error instanceof Error && error.message.startsWith("OPENAI_FILE_UPLOAD_FAILED:")) {
        throw new CanonicalStudyEngineUnavailableError("OPENAI_FILE_UPLOAD_FAILED");
      }
      if (error instanceof Error && error.message.startsWith("OPENAI_RESPONSE_FAILED:")) {
        throw new CanonicalStudyEngineUnavailableError(error.message);
      }
      throw new CanonicalStudyEngineUnavailableError("OPENAI_RESPONSE_FAILED");
    }

    const outputText = response.outputText;
    if (!outputText) {
      throw new MalformedCanonicalStudyProposalError("MALFORMED_PROPOSAL:missing_output_text");
    }
    return parseProposalV4(outputText, context, this.options.model);
  }
}
