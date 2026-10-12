import { randomUUID } from "node:crypto";

import {
  loadAgenticReaderQualificationPromptMetadata,
  loadProposalDomainPack,
} from "@hiveforyou/core/study";
import { buildReaderAcceptedFactsArtifact } from "@hiveforyou/shared/reader-accepted-facts";
import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";

import { buildStudyReaderRequestFromTrustedPages } from "./document-pages-to-reader-request.js";
import {
  resolveEngine1ReaderContext,
  serializeEngine1ReaderContext,
} from "./engine1-reader-context.js";
import { loadTrustedDocumentPageBundle } from "./load-trusted-document-pages.js";
import type { ReaderHttpClient } from "./run-agentic-reader-qualification.js";
import {
  readCompletedDiagnostics,
  resolveReaderQualificationFailureCode,
} from "./reader-qualification-diagnostics.js";
import { ReaderAcceptedFactsStorage } from "./reader-accepted-facts-storage.js";
import {
  evaluatePackDrivenReaderDocumentOutcomes,
  PackDrivenReaderNeedsReviewError,
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
};

export type RunProductionPackDrivenReaderResult = {
  attemptId: string;
  acceptedFactsArtifactPath: string;
  acceptedFactsAttemptArtifactPath: string;
  acceptedCount: number;
  rejectedCount: number;
  promptSha256: string;
  readerDisposition: "ok" | "needs_review";
  affectedDocumentIds?: string[];
};

async function loadTraceEvents(
  gateway: HiveGateway,
  input: { studyRunId: string; attemptId: string },
) {
  return gateway.selectWhere("agent_run_trace_events", {
    study_run_id: input.studyRunId,
    attempt_id: input.attemptId,
  });
}

function countAcceptedEvidence(events: Array<Record<string, unknown>>): number {
  return events.filter((row) => String(row.event_type) === "EVIDENCE_ACCEPTED").length;
}

function traceAttemptCorrelated(
  events: Array<Record<string, unknown>>,
  input: { studyRunId: string; attemptId: string; caseId: string; userId: string },
): boolean {
  if (events.length === 0) {
    return false;
  }
  const eventTypes = new Set(events.map((row) => String(row.event_type)));
  if (!eventTypes.has("STARTED") || !eventTypes.has("COMPLETED")) {
    return false;
  }
  return events.every(
    (row) =>
      String(row.study_run_id) === input.studyRunId &&
      String(row.attempt_id) === input.attemptId &&
      String(row.case_id) === input.caseId &&
      String(row.user_id) === input.userId,
  );
}

export async function runProductionPackDrivenReader(
  input: RunProductionPackDrivenReaderInput,
): Promise<RunProductionPackDrivenReaderResult> {
  const env = { ...(input.env ?? process.env), HIVE_READER_MODE: "pack_driven" };
  const now = input.now ?? (() => new Date().toISOString());
  const attemptId = randomUUID();
  const { pack: proposalPack } = loadProposalDomainPack(env);
  const prompt = loadAgenticReaderQualificationPromptMetadata({ env });
  const registeredDocuments = input.registeredDocuments.map((doc) => ({ ...doc }));

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
    proposalPack,
    requirePersistedDiscover: true,
  });

  const request = buildStudyReaderRequestFromTrustedPages({
    caseId: input.context.caseId,
    userId: input.userId,
    domainId: input.context.domainId,
    studyRunId: input.context.studyRunId,
    attemptId,
    bundles,
    engine1ReaderContextJson: serializeEngine1ReaderContext(engine1Context),
    readerMode: "pack_driven",
  });

  const readerResponse = await input.readerClient(request);
  const audit = readerResponse.audit;
  if (!audit?.persisted || audit.status !== "persisted") {
    throw new Error("READER_AUDIT_NOT_PERSISTED");
  }
  if (audit.attemptId !== attemptId || audit.studyRunId !== input.context.studyRunId) {
    throw new Error("READER_AUDIT_CORRELATION_MISMATCH");
  }

  const documentOutcome = evaluatePackDrivenReaderDocumentOutcomes({
    expectedSourceDocumentIds: registeredDocuments.map((doc) => doc.id),
    perDocumentResults: readerResponse.perDocumentResults,
  });
  if (documentOutcome.kind === "failed") {
    throw new PackDrivenReaderProductionError({
      errorCode: documentOutcome.code,
      message: `Pack-driven Reader document failure for: ${documentOutcome.affectedDocumentIds.join(", ")}`,
      affectedDocumentIds: documentOutcome.affectedDocumentIds,
    });
  }

  const traceEvents = await loadTraceEvents(input.gateway, {
    studyRunId: input.context.studyRunId,
    attemptId,
  });
  const correlated = traceAttemptCorrelated(traceEvents, {
    studyRunId: input.context.studyRunId,
    attemptId,
    caseId: input.context.caseId,
    userId: input.userId,
  });
  const diagnostics = readCompletedDiagnostics(traceEvents);
  const acceptedFromResponse = readerResponse.acceptedCandidateFacts?.length ?? 0;
  const acceptedEvidenceEvents = countAcceptedEvidence(traceEvents);
  const acceptedFacts = Math.max(diagnostics?.acceptedFactCount ?? 0, acceptedEvidenceEvents);
  if (!correlated || acceptedFacts < 1 || acceptedFromResponse < 1) {
    const code = resolveReaderQualificationFailureCode({
      correlated,
      diagnostics,
      acceptedEvidenceEvents,
    });
    throw new Error(code);
  }

  const storage = new ReaderAcceptedFactsStorage(input.gateway, input.documentPagesBucket);
  const artifact = buildReaderAcceptedFactsArtifact({
    studyRunId: input.context.studyRunId,
    attemptId,
    caseId: input.context.caseId,
    readerArchitectureVariant: null,
    promptSha256: prompt.promptSha256,
    createdAt: now(),
    facts: readerResponse.acceptedCandidateFacts ?? [],
  });
  await storage.save(input.userId, artifact);

  if (documentOutcome.kind === "needs_review") {
    throw new PackDrivenReaderNeedsReviewError(documentOutcome.affectedDocumentIds);
  }

  return {
    attemptId,
    acceptedFactsArtifactPath: storage.pathFor(input.userId, input.context.studyRunId),
    acceptedFactsAttemptArtifactPath: storage.pathForAttempt(
      input.userId,
      input.context.studyRunId,
      attemptId,
    ),
    acceptedCount: acceptedFromResponse,
    rejectedCount: diagnostics?.rejectedFactCount ?? 0,
    promptSha256: prompt.promptSha256,
    readerDisposition: "ok",
  };
}

export {
  PackDrivenReaderNeedsReviewError,
  PackDrivenReaderProductionError,
} from "./pack-driven-reader-document-outcomes.js";
