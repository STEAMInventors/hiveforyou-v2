import type {
  CanonicalStudyReasoner,
  CanonicalStudyReasonerRequest,
} from "@hiveforyou/shared/canonical-study-graph";
import {
  CANONICAL_STUDY_REASONER_PROPOSAL_SCHEMA_VERSION,
  type CanonicalStudyReasonerProposal,
} from "@hiveforyou/shared/canonical-study-graph";
import type { CallModel } from "@hiveforyou/shared/model/call-model";
import { ModelCallError } from "@hiveforyou/shared/model/call-model";

import {
  buildCanonicalReasonerUserContext,
  buildCanonicalReasonerUserMessage,
  type BuildReasonerContextOptions,
} from "./build-reasoner-context.js";
import { CANONICAL_REASONER_MODEL_TEXT_FORMAT } from "./model-output-schema.js";
import { buildCanonicalReasonerModelUsage, type CanonicalReasonerModelUsage } from "./model-usage.js";
import {
  CANONICAL_REASONER_PROMPT_ID,
  CANONICAL_REASONER_PROMPT_VERSION,
  canonicalReasonerPromptSha256,
  loadCanonicalReasonerSystemPrompt,
} from "./prompt-metadata.js";
import {
  CanonicalReasonerUnavailableError,
  MalformedCanonicalReasonerProposalError,
} from "./reasoner-errors.js";
import { validateReasonerProposalStructure } from "./validate-proposal-references.js";
import {
  hashCompiledCanonicalReasonerContext,
  type CompiledCanonicalReasonerContext,
} from "@hiveforyou/domain-packs/declarative";

export type ProductionCanonicalReasonerOptions = {
  providerId: string;
  modelId: string;
  callModel: CallModel;
  reasoningEffort?: string;
  maxOutputTokens?: number;
  packContext: CompiledCanonicalReasonerContext;
  contextOptions?: BuildReasonerContextOptions;
  onModelUsage?: (usage: CanonicalReasonerModelUsage) => void;
};

type ModelGraphBody = Omit<
  CanonicalStudyReasonerProposal,
  "schemaVersion" | "studyRunId" | "attemptId" | "packPin" | "modelPin"
>;

function mapModelCallError(error: ModelCallError): never {
  if (error.kind === "upload_failed") {
    throw new CanonicalReasonerUnavailableError("MODEL_UPLOAD_FAILED");
  }
  if (error.kind === "response_failed" || error.kind === "refused" || error.kind === "truncated") {
    throw new CanonicalReasonerUnavailableError(error.message);
  }
  throw new CanonicalReasonerUnavailableError("MODEL_RESPONSE_FAILED");
}

function parseModelGraphBody(text: string): ModelGraphBody {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new MalformedCanonicalReasonerProposalError("MALFORMED_REASONER_PROPOSAL:invalid_json");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new MalformedCanonicalReasonerProposalError("MALFORMED_REASONER_PROPOSAL:not_object");
  }
  return parsed as ModelGraphBody;
}

export class ProductionCanonicalReasoner implements CanonicalStudyReasoner {
  constructor(private readonly options: ProductionCanonicalReasonerOptions) {}

  async propose(request: CanonicalStudyReasonerRequest): Promise<CanonicalStudyReasonerProposal> {
    const expectedPackSha = hashCompiledCanonicalReasonerContext(this.options.packContext);
    if (request.compiledPackContextSha256 !== expectedPackSha) {
      throw new CanonicalReasonerUnavailableError("PACK_CONTEXT_SHA_MISMATCH");
    }
    if (
      request.packPin.packId !== this.options.packContext.packId ||
      request.packPin.packVersion !== this.options.packContext.packVersion
    ) {
      throw new CanonicalReasonerUnavailableError("PACK_PIN_MISMATCH");
    }
    const userContext = buildCanonicalReasonerUserContext(
      {
        studyRunId: request.studyRunId,
        attemptId: request.attemptId,
        caseId: request.caseId,
        domainId: request.domainId,
        packPin: request.packPin,
        compiledPackContextSha256: request.compiledPackContextSha256,
        observationSnapshot: request.observationSnapshot,
        customerObjective: request.customerObjective,
      },
      this.options.contextOptions,
    );

    const userMessage = buildCanonicalReasonerUserMessage({
      packContext: this.options.packContext,
      userContext,
    });

    const started = Date.now();
    let response;
    try {
      response = await this.options.callModel({
        model: this.options.modelId,
        reasoningEffort: this.options.reasoningEffort,
        maxOutputTokens: this.options.maxOutputTokens,
        systemPrompt: loadCanonicalReasonerSystemPrompt(),
        userContent: userMessage,
        textFormat: CANONICAL_REASONER_MODEL_TEXT_FORMAT,
        logLabel: "hive-canonical-reasoner",
      });
    } catch (error) {
      if (error instanceof CanonicalReasonerUnavailableError) {
        throw error;
      }
      if (error instanceof ModelCallError) {
        mapModelCallError(error);
      }
      throw new CanonicalReasonerUnavailableError("REASONER_MODEL_CALL_FAILED");
    }

    const latencyMs = Date.now() - started;
    const usage = buildCanonicalReasonerModelUsage({
      providerId: this.options.providerId,
      modelId: this.options.modelId,
      usage: response.usage,
      latencyMs,
    });
    this.options.onModelUsage?.(usage);

    if (!response.outputText?.trim()) {
      throw new MalformedCanonicalReasonerProposalError("MALFORMED_REASONER_PROPOSAL:missing_output_text");
    }

    const body = parseModelGraphBody(response.outputText);
    const assembled: CanonicalStudyReasonerProposal = {
      schemaVersion: CANONICAL_STUDY_REASONER_PROPOSAL_SCHEMA_VERSION,
      studyRunId: request.studyRunId,
      attemptId: request.attemptId,
      packPin: request.packPin,
      modelPin: {
        providerId: this.options.providerId,
        modelId: this.options.modelId,
        promptId: CANONICAL_REASONER_PROMPT_ID,
        promptVersion: CANONICAL_REASONER_PROMPT_VERSION,
        promptSha256: canonicalReasonerPromptSha256(),
      },
      ...body,
    };

    const validated = validateReasonerProposalStructure(assembled, request.observationSnapshot);
    if (!validated.ok) {
      throw new MalformedCanonicalReasonerProposalError(
        "MALFORMED_REASONER_PROPOSAL:reference_or_schema",
        assembled,
        validated.violations,
      );
    }
    return validated.proposal;
  }
}
