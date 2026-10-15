import { randomUUID } from "node:crypto";

import {
  buildObservedReaderIdentitySummary,
  loadAgenticReaderQualificationPromptMetadata,
  resolveStudyReaderProposalPackBinding,
} from "@hiveforyou/core/study";
import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import {
  buildReaderDocumentExtractionEnvelope,
  type ReaderDocumentExtractionEnvelope,
} from "@hiveforyou/shared/reader-document-extraction";

import { buildStudyReaderRequestFromTrustedPages } from "./document-pages-to-reader-request.js";
import {
  resolveEngine1ReaderContext,
  serializeEngine1ReaderContext,
} from "./engine1-reader-context.js";
import { loadTrustedDocumentPageBundle } from "./load-trusted-document-pages.js";
import type { ReaderHttpClient } from "./run-agentic-reader-qualification.js";
import { ReaderDocumentExtractionStorage } from "./reader-document-extraction-storage.js";
import {
  evaluatePackDrivenRawExtractionOutcome,
  PackDrivenReaderProductionError,
} from "./pack-driven-reader-document-outcomes.js";
import type { HiveGateway } from "../persistence/hive-gateway.js";

export type RunProductionPackDrivenReaderInput = {
  gateway: HiveGateway;
  documentPagesBucket: string;
  context: CanonicalStudyContext;
  userId: string;
  registeredDocuments: ReadonlyArray<{ id: string; sha256: string; filename?: string }>;
  env?: Record<string, string | undefined>;
  readerClient: ReaderHttpClient;
  now?: () => string;
  attemptId?: string;
};

export type PackDrivenReaderAuditSnapshot = {
  persisted: boolean;
  status: string;
  errorCode?: string;
  studyRunId: string;
  attemptId: string;
};

export type RunProductionPackDrivenReaderResult = {
  attemptId: string;
  documentExtractionAttemptManifestPath: string;
  documentExtractionStudyRunManifestPath: string;
  rawExtractionOutcome: "succeeded" | "partial_failure" | "failed";
  succeededDocumentIds: string[];
  failedDocumentIds: string[];
  promptSha256: string;
  audit: PackDrivenReaderAuditSnapshot;
  acceptedVerifierFactCount: number;
  observedReaderIdentity: ReturnType<typeof buildObservedReaderIdentitySummary>;
  readerPreflight?: CanonicalStudyContext["processingPolicy"]["readerPreflight"];
};

export class PackDrivenReaderAuditNotPersistedError extends Error {
  readonly errorCode = "READER_AUDIT_NOT_PERSISTED" as const;

  constructor(readonly audit: PackDrivenReaderAuditSnapshot) {
    super("READER_AUDIT_NOT_PERSISTED");
    this.name = "PackDrivenReaderAuditNotPersistedError";
  }
}

function auditSnapshotFromResponse(
  audit: { persisted?: boolean; status?: string; errorCode?: string; studyRunId?: string; attemptId?: string } | null | undefined,
  correlation: { studyRunId: string; attemptId: string },
): PackDrivenReaderAuditSnapshot {
  return {
    persisted: audit?.persisted === true && audit.status === "persisted",
    status: typeof audit?.status === "string" ? audit.status : "unknown",
    errorCode: typeof audit?.errorCode === "string" ? audit.errorCode : undefined,
    studyRunId: typeof audit?.studyRunId === "string" ? audit.studyRunId : correlation.studyRunId,
    attemptId: typeof audit?.attemptId === "string" ? audit.attemptId : correlation.attemptId,
  };
}

export async function runProductionPackDrivenReader(
  input: RunProductionPackDrivenReaderInput,
): Promise<RunProductionPackDrivenReaderResult> {
  const env = { ...(input.env ?? process.env), HIVE_READER_MODE: "pack_driven" };
  const now = input.now ?? (() => new Date().toISOString());
  const attemptId = input.attemptId ?? randomUUID();
  const prompt = loadAgenticReaderQualificationPromptMetadata({ env });
  const registeredDocuments = input.registeredDocuments.map((doc) => ({ ...doc }));
  const expectedSourceDocumentIds = registeredDocuments.map((doc) => doc.id);

  const bundles = await loadTrustedDocumentPageBundle({
    gateway: input.gateway,
    bucket: input.documentPagesBucket,
    userId: input.userId,
    documents: registeredDocuments,
  });
  const pageCountBySource = new Map(
    bundles.map((bundle) => [bundle.sourceDocumentId, bundle.documentPages.pages.length]),
  );
  const filenameBySource = new Map(
    registeredDocuments.map((doc) => [doc.id, doc.filename ?? "document"]),
  );

  const engine1Context = await resolveEngine1ReaderContext({
    gateway: input.gateway,
    userId: input.userId,
    caseId: input.context.caseId,
    domainId: input.context.domainId,
    domainPackId: input.context.domainPackId,
    domainPackVersion: input.context.domainPackVersion,
    registeredDocuments,
    filenameBySourceDocumentId: filenameBySource,
    pageCountBySourceDocumentId: pageCountBySource,
    structureMap: input.context.structureMap ?? null,
    requirePersistedDiscover: true,
  });

  const proposalPack = resolveStudyReaderProposalPackBinding({
    domainId: input.context.domainId,
    proposalPackContentSha256: input.context.processingPolicy.proposalPackContentSha256,
    env,
  });

  const request = buildStudyReaderRequestFromTrustedPages({
    caseId: input.context.caseId,
    userId: input.userId,
    domainId: input.context.domainId,
    proposalPack,
    studyRunId: input.context.studyRunId,
    attemptId,
    bundles,
    engine1ReaderContextJson: serializeEngine1ReaderContext(engine1Context),
    readerMode: "pack_driven",
  });

  const readerResponse = await input.readerClient(request);
  const audit = auditSnapshotFromResponse(readerResponse.audit, {
    studyRunId: input.context.studyRunId,
    attemptId,
  });

  const documentExtractions = readerResponse.documentExtractions;
  if (!documentExtractions?.length) {
    throw new Error("READER_DOCUMENT_EXTRACTION_MISSING");
  }

  const validatedEnvelopes = documentExtractions.map((raw) =>
    buildReaderDocumentExtractionEnvelope(raw as ReaderDocumentExtractionEnvelope),
  );

  const extractionStorage = new ReaderDocumentExtractionStorage(input.gateway, input.documentPagesBucket);
  const persisted = await extractionStorage.persistAttemptEnvelopes({
    userId: input.userId,
    envelopes: validatedEnvelopes,
    updatedAt: now(),
  });

  if (!audit.persisted) {
    throw new PackDrivenReaderAuditNotPersistedError(audit);
  }
  if (audit.attemptId !== attemptId || audit.studyRunId !== input.context.studyRunId) {
    throw new Error("READER_AUDIT_CORRELATION_MISMATCH");
  }

  const rawOutcome = evaluatePackDrivenRawExtractionOutcome({
    expectedSourceDocumentIds,
    documents: validatedEnvelopes.map((envelope) => ({
      sourceDocumentId: envelope.sourceDocumentId,
      status: envelope.status,
    })),
  });

  const acceptedVerifierFactCount = readerResponse.acceptedCandidateFacts?.length ?? 0;

  if (rawOutcome.kind === "failed") {
    throw new PackDrivenReaderProductionError({
      errorCode: rawOutcome.code,
      message: `Pack-driven raw extraction failed for: ${rawOutcome.failedDocumentIds.join(", ")}`,
      affectedDocumentIds: rawOutcome.failedDocumentIds,
    });
  }

  return {
    attemptId,
    documentExtractionAttemptManifestPath: persisted.attemptManifestPath,
    documentExtractionStudyRunManifestPath: persisted.studyRunManifestPath,
    rawExtractionOutcome: rawOutcome.kind,
    succeededDocumentIds:
      rawOutcome.kind === "succeeded" ? rawOutcome.succeededDocumentIds : rawOutcome.succeededDocumentIds,
    failedDocumentIds:
      rawOutcome.kind === "partial_failure" ? rawOutcome.failedDocumentIds : [],
    promptSha256: prompt.promptSha256,
    audit,
    acceptedVerifierFactCount,
    observedReaderIdentity: buildObservedReaderIdentitySummary({
      attemptId,
      envelopes: validatedEnvelopes,
    }),
    readerPreflight: input.context.processingPolicy?.readerPreflight,
  };
}

export { PackDrivenReaderProductionError } from "./pack-driven-reader-document-outcomes.js";
