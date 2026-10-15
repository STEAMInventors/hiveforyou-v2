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
import {
  HiveWriterDomainBindingError,
  resolveHiveWriterDomainBinding,
} from "./resolve-hive-writer-domain-binding.js";
import {
  HiveWriterProposalValidationError,
  assertWriterProposalEnvelope,
} from "./validate-hive-writer-proposal.js";

export class HiveWriterShadowDisabledError extends Error {
  readonly code = "HIVE_WRITER_SHADOW_DISABLED" as const;

  constructor() {
    super("Hive Writer shadow mode is disabled.");
    this.name = "HiveWriterShadowDisabledError";
  }
}

export type HiveWriterShadowPersistence = {
  load: (idempotencyKey: string) => Promise<HiveWriterShadowRecord | null>;
  save: (record: HiveWriterShadowRecord) => Promise<void>;
};

export type RunHiveWriterShadowInput = {
  artifact: CanonicalStudyArtifact;
  projection: CanonicalStudyReportProjection;
  shadowModeEnabled: boolean;
  presentationInstructions?: string | null;
  invokeWriter: HiveWriterHttpClient;
  persistence: HiveWriterShadowPersistence;
  now?: () => number;
};

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
  if (error instanceof Error && error.name === "ZodError") {
    return "WRITER_PROPOSAL_SCHEMA_INVALID";
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
  return record.status === "accepted" || record.status === "rejected" || record.status === "failed";
}

function skippedRecord(input: {
  idempotencyKey: string;
  projection: CanonicalStudyReportProjection;
}): HiveWriterShadowRecord {
  return {
    schemaVersion: HIVE_WRITER_SHADOW_RECORD_SCHEMA_VERSION,
    idempotencyKey: input.idempotencyKey,
    caseId: input.projection.caseId,
    studyRunId: input.projection.studyRunId,
    audience: input.projection.audience,
    status: "skipped",
    observability: {
      studyRunId: input.projection.studyRunId,
      audience: input.projection.audience,
      projectionHash: input.projection.sourceArtifactContentSha256,
      catalogVersion: "1",
      writerImplementationVersion: "1",
      proposalSchemaVersion: "hive-writer-proposal/1",
      modelIdentifier: null,
      durationMs: 0,
      tokenUsage: null,
    },
    validation: { ok: false, errorCodes: ["SHADOW_DISABLED"], message: "Shadow mode disabled." },
    proposal: null,
    hiveUiTree: null,
  };
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

  if (!input.shadowModeEnabled) {
    return skippedRecord({ idempotencyKey, projection: input.projection });
  }

  const existing = await input.persistence.load(idempotencyKey);
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
    proposal = parseHiveWriterProposal(response.proposal);
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

  await input.persistence.save(record);
  return record;
}

export function readHiveWriterShadowModeEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env.HIVE_WRITER_SHADOW_MODE?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}
