import type { CanonicalStudyArtifact } from "@hiveforyou/shared/canonical-study-artifact";
import type { CanonicalStudyReportProjection } from "@hiveforyou/shared/canonical-study-report-projection";
import type { HiveUiTree } from "@hiveforyou/shared/hive-ui-tree";
import type {
  HiveWriterShadowRecord,
  HiveWriterShadowStatus,
} from "@hiveforyou/shared/hive-writer-proposal";

import { HiveUiTreeValidationError, assertHiveUiTree } from "../validate-hive-ui-tree.js";
import { buildHiveWriterPresentationBinding } from "./build-hive-writer-model-input.js";
import { buildHiveWriterShadowIdempotencyKey } from "./hive-writer-idempotency.js";
import { resolveHiveWriterDomainBinding } from "./resolve-hive-writer-domain-binding.js";
import {
  HiveWriterProposalValidationError,
  assertWriterProposalEnvelope,
} from "./validate-hive-writer-proposal.js";

export type WriterHiveUiPreviewFallbackReason = {
  code: string;
  message: string;
  errorCodes: string[];
};

export type WriterHiveUiPreviewResolution = {
  layout: "writer" | "deterministic_fallback";
  hiveUiTree: HiveUiTree | null;
  fallbackReason: WriterHiveUiPreviewFallbackReason | null;
  shadowStatus: HiveWriterShadowStatus | "missing" | "unavailable";
  idempotencyKey: string;
  validation: HiveWriterShadowRecord["validation"] | null;
};

function toFallback(input: {
  code: string;
  message: string;
  errorCodes?: string[];
  shadowStatus: WriterHiveUiPreviewResolution["shadowStatus"];
  idempotencyKey: string;
  validation: WriterHiveUiPreviewResolution["validation"];
}): WriterHiveUiPreviewResolution {
  return {
    layout: "deterministic_fallback",
    hiveUiTree: null,
    fallbackReason: {
      code: input.code,
      message: input.message,
      errorCodes: input.errorCodes ?? [input.code],
    },
    shadowStatus: input.shadowStatus,
    idempotencyKey: input.idempotencyKey,
    validation: input.validation,
  };
}

export function resolveWriterHiveUiTreeForPreview(input: {
  artifact: CanonicalStudyArtifact;
  projection: CanonicalStudyReportProjection;
  record: HiveWriterShadowRecord | null;
  shadowModeEnabled: boolean;
}): WriterHiveUiPreviewResolution {
  let domainBinding;
  try {
    domainBinding = resolveHiveWriterDomainBinding({
      artifact: input.artifact,
      projection: input.projection,
    });
  } catch (error) {
    const idempotencyKey = buildHiveWriterShadowIdempotencyKey({
      caseId: input.projection.caseId,
      studyRunId: input.projection.studyRunId,
      audience: input.projection.audience,
      packContentSha256: input.artifact.packContentSha256,
      reportProjectionContentSha256: input.projection.sourceArtifactContentSha256,
    });
    return toFallback({
      code: "WRITER_DOMAIN_BINDING_FAILED",
      message:
        error instanceof Error ? error.message : "Could not resolve Writer domain binding.",
      shadowStatus: "unavailable",
      idempotencyKey,
      validation: null,
    });
  }

  const idempotencyKey = buildHiveWriterShadowIdempotencyKey({
    caseId: input.projection.caseId,
    studyRunId: input.projection.studyRunId,
    audience: input.projection.audience,
    packContentSha256: domainBinding.packContentSha256,
    reportProjectionContentSha256: domainBinding.reportProjectionContentSha256,
  });

  if (!input.shadowModeEnabled) {
    return toFallback({
      code: "SHADOW_DISABLED",
      message: "Hive Writer shadow mode is disabled.",
      shadowStatus: "unavailable",
      idempotencyKey,
      validation: { ok: false, errorCodes: ["SHADOW_DISABLED"], message: null },
    });
  }

  const record = input.record;
  if (!record) {
    return toFallback({
      code: "WRITER_RECORD_MISSING",
      message: "No Writer layout has been generated for this report projection yet.",
      shadowStatus: "missing",
      idempotencyKey,
      validation: null,
    });
  }

  if (
    record.caseId !== input.projection.caseId ||
    record.studyRunId !== input.projection.studyRunId ||
    record.audience !== input.projection.audience
  ) {
    return toFallback({
      code: "WRITER_RECORD_SCOPE_MISMATCH",
      message: "Stored Writer proposal does not match this case, study run, or audience.",
      shadowStatus: record.status,
      idempotencyKey,
      validation: record.validation,
    });
  }

  if (record.idempotencyKey !== idempotencyKey) {
    return toFallback({
      code: "WRITER_BINDING_STALE",
      message:
        "Stored Writer proposal was produced for a different pack version or report projection.",
      shadowStatus: record.status,
      idempotencyKey,
      validation: record.validation,
      errorCodes: ["WRITER_BINDING_STALE"],
    });
  }

  if (record.observability.projectionHash !== domainBinding.reportProjectionContentSha256) {
    return toFallback({
      code: "WRITER_PROJECTION_STALE",
      message: "Stored Writer proposal is stale relative to the current report projection.",
      shadowStatus: record.status,
      idempotencyKey,
      validation: record.validation,
      errorCodes: ["WRITER_PROJECTION_STALE"],
    });
  }

  if (record.status !== "accepted" || !record.hiveUiTree || !record.proposal) {
    return toFallback({
      code: "WRITER_RECORD_NOT_ACCEPTED",
      message:
        record.validation.message ?? `Writer layout is not available (status: ${record.status}).`,
      shadowStatus: record.status,
      idempotencyKey,
      validation: record.validation,
      errorCodes: record.validation.errorCodes.length
        ? record.validation.errorCodes
        : ["WRITER_RECORD_NOT_ACCEPTED"],
    });
  }

  const presentationBinding = buildHiveWriterPresentationBinding(input.projection);

  try {
    assertWriterProposalEnvelope({
      proposal: record.proposal,
      domainBinding,
      presentationBinding,
    });
  } catch (error) {
    const code =
      error instanceof HiveWriterProposalValidationError
        ? error.code
        : "WRITER_PROPOSAL_INVALID";
    return toFallback({
      code,
      message: error instanceof Error ? error.message : "Writer proposal validation failed.",
      shadowStatus: record.status,
      idempotencyKey,
      validation: record.validation,
      errorCodes: [code],
    });
  }

  try {
    const tree = assertHiveUiTree(input.artifact, input.projection, record.hiveUiTree);
    return {
      layout: "writer",
      hiveUiTree: tree,
      fallbackReason: null,
      shadowStatus: record.status,
      idempotencyKey,
      validation: record.validation,
    };
  } catch (error) {
    return toFallback({
      code: "HIVE_UI_TREE_INVALID",
      message: error instanceof Error ? error.message : "Writer UI tree validation failed.",
      shadowStatus: record.status,
      idempotencyKey,
      validation: record.validation,
      errorCodes: [
        error instanceof HiveUiTreeValidationError ? "HIVE_UI_TREE_INVALID" : "HIVE_UI_TREE_INVALID",
      ],
    });
  }
}
