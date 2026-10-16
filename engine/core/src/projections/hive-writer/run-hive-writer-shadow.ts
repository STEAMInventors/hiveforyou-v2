import type { CanonicalStudyArtifact } from "@hiveforyou/shared/canonical-study-artifact";
import type { CanonicalStudyReportProjection } from "@hiveforyou/shared/canonical-study-report-projection";
import {
  HIVE_WRITER_SHADOW_RECORD_SCHEMA_VERSION,
  parseHiveWriterProposal,
  type HiveWriterProposal,
  type HiveWriterShadowRecord,
  type HiveWriterShadowStatus,
} from "@hiveforyou/shared/hive-writer-proposal";
import type { HiveUiTree } from "@hiveforyou/shared/hive-ui-tree";

import { HiveUiTreeValidationError, assertHiveUiTree } from "../validate-hive-ui-tree.js";
import {
  buildHiveWriterModelInput,
  buildHiveWriterPresentationBinding,
} from "./build-hive-writer-model-input.js";
import { buildHiveWriterShadowIdempotencyKey } from "./hive-writer-idempotency.js";
import type { HiveWriterHttpClient } from "./create-writer-http-client.js";
import { isHiveWriterShadowTerminalStatus } from "./plan-writer-shadow-dispatch.js";
import {
  HiveWriterDomainBindingError,
  resolveHiveWriterDomainBinding,
} from "./resolve-hive-writer-domain-binding.js";
import {
  HiveWriterProposalValidationError,
  assertWriterProposalEnvelope,
} from "./validate-hive-writer-proposal.js";
import {
  normalizeWriterModelProposalBeforeValidation,
  WriterModelProposalNormalizationError,
} from "./normalize-writer-model-proposal.js";

export type HiveWriterShadowPersistence = {
  load: (writerRunId: string) => Promise<HiveWriterShadowRecord | null>;
  save: (record: HiveWriterShadowRecord) => Promise<void>;
};

export type RunHiveWriterShadowInput = {
  writerRunId: string;
  artifact: CanonicalStudyArtifact;
  projection: CanonicalStudyReportProjection;
  presentationInstructions?: string | null;
  invokeWriter: HiveWriterHttpClient;
  persistence: HiveWriterShadowPersistence;
  now?: () => number;
};

function writerHttpErrorCode(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return null;
  }
  const match = error.message.match(/^WRITER_HTTP_(\d{3}):/);
  if (!match) {
    return null;
  }
  const status = Number(match[1]);
  const payload = error.message.slice(match[0].length);
  let detailCode: string | null = null;
  try {
    const parsed = JSON.parse(payload) as { detail?: { error?: { code?: string } } };
    detailCode = parsed.detail?.error?.code ?? null;
  } catch {
    detailCode = null;
  }
  if (detailCode) {
    return detailCode;
  }
  if (status === 422) {
    return "WRITER_MODEL_JSON_INVALID";
  }
  if (status >= 500) {
    return "WRITER_PROVIDER_HTTP_5XX";
  }
  if (status >= 400) {
    return "WRITER_PROVIDER_HTTP_4XX";
  }
  return "WRITER_VALIDATION_FAILED";
}

function validationErrorCode(error: unknown): string {
  if (error instanceof HiveUiTreeValidationError) {
    return "HIVE_UI_TREE_INVALID";
  }
  if (error instanceof HiveWriterProposalValidationError) {
    return error.code;
  }
  if (error instanceof HiveWriterDomainBindingError) {
    return error.code;
  }
  if (error instanceof WriterModelProposalNormalizationError) {
    return error.code;
  }
  if (error instanceof Error && error.name === "ZodError") {
    return "WRITER_PROPOSAL_SCHEMA_INVALID";
  }
  const httpCode = writerHttpErrorCode(error);
  if (httpCode) {
    return httpCode;
  }
  return "WRITER_VALIDATION_FAILED";
}

function validationMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }
  return "Writer validation failed.";
}

function isTerminalReuseRecord(record: HiveWriterShadowRecord): boolean {
  return isHiveWriterShadowTerminalStatus(record.status);
}

export async function runHiveWriterShadow(
  input: RunHiveWriterShadowInput,
): Promise<HiveWriterShadowRecord> {
  const now = input.now ?? (() => Date.now());

  let domainBinding;
  try {
    domainBinding = resolveHiveWriterDomainBinding({
      artifact: input.artifact,
      projection: input.projection,
    });
  } catch (error) {
    const fallbackProjectionHash = input.projection.sourceArtifactContentSha256;
    const idempotencyKey = buildHiveWriterShadowIdempotencyKey({
      caseId: input.projection.caseId,
      studyRunId: input.projection.studyRunId,
      audience: input.projection.audience,
      packContentSha256: input.artifact.packContentSha256,
      reportProjectionContentSha256: fallbackProjectionHash,
    });
    return {
      schemaVersion: HIVE_WRITER_SHADOW_RECORD_SCHEMA_VERSION,
      writerRunId: input.writerRunId,
      idempotencyKey,
      caseId: input.projection.caseId,
      studyRunId: input.projection.studyRunId,
      audience: input.projection.audience,
      status: "failed",
      observability: {
        studyRunId: input.projection.studyRunId,
        audience: input.projection.audience,
        projectionHash: fallbackProjectionHash,
        catalogVersion: "1",
        writerImplementationVersion: "1",
        proposalSchemaVersion: "hive-writer-proposal/1",
        modelIdentifier: null,
        durationMs: 0,
        tokenUsage: null,
      },
      validation: {
        ok: false,
        errorCodes: [validationErrorCode(error)],
        message: validationMessage(error),
      },
      proposal: null,
      hiveUiTree: null,
    };
  }

  const idempotencyKey = buildHiveWriterShadowIdempotencyKey({
    caseId: input.projection.caseId,
    studyRunId: input.projection.studyRunId,
    audience: input.projection.audience,
    packContentSha256: domainBinding.packContentSha256,
    reportProjectionContentSha256: domainBinding.reportProjectionContentSha256,
  });

  const existing = await input.persistence.load(input.writerRunId);
  if (existing && isTerminalReuseRecord(existing)) {
    return existing;
  }

  const started = now();
  let status: HiveWriterShadowStatus = "failed";
  let proposal: HiveWriterProposal | null = null;
  let hiveUiTree: HiveUiTree | null = null;
  let validation = {
    ok: false,
    errorCodes: [] as string[],
    message: null as string | null,
  };
  let modelIdentifier: string | null = null;
  let tokenUsage: HiveWriterShadowRecord["observability"]["tokenUsage"] = null;

  const presentationBinding = buildHiveWriterPresentationBinding(input.projection);

  try {
    const modelInput = buildHiveWriterModelInput({
      projection: input.projection,
      domainBinding,
      publicationRestrictions: {
        presentationMode: input.projection.presentationMode,
        customerProReportsPermitted: input.projection.customerProReportsPermitted,
      },
      presentationInstructions: input.presentationInstructions,
    });
    const response = await input.invokeWriter(modelInput);
    modelIdentifier = response.modelIdentifier;
    tokenUsage = response.tokenUsage;
    proposal = parseHiveWriterProposal(
      normalizeWriterModelProposalBeforeValidation(response.proposal),
    );
    assertWriterProposalEnvelope({
      proposal,
      domainBinding,
      presentationBinding,
    });
    try {
      hiveUiTree = assertHiveUiTree(input.artifact, input.projection, proposal.hiveUiTree);
      status = "accepted";
      validation = { ok: true, errorCodes: [], message: null };
    } catch (validationError) {
      hiveUiTree = null;
      status = "rejected";
      validation = {
        ok: false,
        errorCodes: [validationErrorCode(validationError)],
        message: validationMessage(validationError),
      };
    }
  } catch (error) {
    proposal = null;
    hiveUiTree = null;
    status = "failed";
    validation = {
      ok: false,
      errorCodes: [validationErrorCode(error)],
      message: validationMessage(error),
    };
  }

  const record: HiveWriterShadowRecord = {
    schemaVersion: HIVE_WRITER_SHADOW_RECORD_SCHEMA_VERSION,
    writerRunId: input.writerRunId,
    idempotencyKey,
    caseId: input.projection.caseId,
    studyRunId: input.projection.studyRunId,
    audience: input.projection.audience,
    status,
    observability: {
      studyRunId: input.projection.studyRunId,
      audience: input.projection.audience,
      projectionHash: domainBinding.reportProjectionContentSha256,
      catalogVersion: "1",
      writerImplementationVersion: "1",
      proposalSchemaVersion: "hive-writer-proposal/1",
      modelIdentifier,
      durationMs: Math.max(0, now() - started),
      tokenUsage,
    },
    validation,
    proposal,
    hiveUiTree,
  };

  const existingBeforeSave = await input.persistence.load(input.writerRunId);
  if (existingBeforeSave && isTerminalReuseRecord(existingBeforeSave)) {
    return existingBeforeSave;
  }
  await input.persistence.save(record);
  return record;
}

export function buildHiveWriterShadowMarkerRecord(input: {
  writerRunId: string;
  status: "queued" | "processing" | "skipped" | "failed";
  idempotencyKey: string;
  projection: CanonicalStudyReportProjection;
  projectionHash: string;
  errorCodes: string[];
  message: string | null;
}): HiveWriterShadowRecord {
  return {
    schemaVersion: HIVE_WRITER_SHADOW_RECORD_SCHEMA_VERSION,
    writerRunId: input.writerRunId,
    idempotencyKey: input.idempotencyKey,
    caseId: input.projection.caseId,
    studyRunId: input.projection.studyRunId,
    audience: input.projection.audience,
    status: input.status,
    observability: {
      studyRunId: input.projection.studyRunId,
      audience: input.projection.audience,
      projectionHash: input.projectionHash,
      catalogVersion: "1",
      writerImplementationVersion: "1",
      proposalSchemaVersion: "hive-writer-proposal/1",
      modelIdentifier: null,
      durationMs: 0,
      tokenUsage: null,
    },
    validation: {
      ok: false,
      errorCodes: input.errorCodes,
      message: input.message,
    },
    proposal: null,
    hiveUiTree: null,
  };
}
