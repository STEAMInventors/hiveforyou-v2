import { randomUUID } from "node:crypto";

import {
  isTerminalIntakeDocumentStatus,
  isTerminalIntakeRunStatus,
} from "@hiveforyou/shared/intake";

import { extractDocument } from "./extract-document";
import {
  completeIntakeRunStatus,
  finalizeIntakeRunPackStep,
  loadIntakeRunForProcessing,
  runIntakeClassifyStep,
  runIntakeExtractStep,
} from "./intake-document-steps";
import { mapWithConcurrency } from "./map-with-concurrency";
import type { JevDomainDecision } from "./jev-domain-client";
import type {
  DocumentExtractionRepository,
  DocumentIdentityRepository,
  IntakeRunRepository,
} from "./repositories";
import type {
  DocumentExtractionRecord,
  DocumentIdentityRecord,
  DocumentNormalizedExtractionRecord,
  IntakeRunRecord,
  IntakeSourceDocument,
} from "./types";
import type { DocumentNormalizedExtractionRepository } from "./repositories";
import type { DocumentPages } from "@hiveforyou/core/document/page-model";

import type { JevIdentityDecision } from "./jev-client";

/** Cap parallel per-document extract/classify work to limit CPU and memory spikes. */
const INTAKE_DOCUMENT_CONCURRENCY = 3;

export type DocumentPagesPersistence = {
  saveIfAbsent(userId: string, sha256: string, documentPages: DocumentPages): Promise<void>;
};

export type IntakeExecutionDeps = {
  runs: IntakeRunRepository;
  identities: DocumentIdentityRepository;
  extractions: DocumentExtractionRepository;
  normalizedExtractions?: DocumentNormalizedExtractionRepository;
  documentPages?: DocumentPagesPersistence;
  loadDocuments: (input: {
    userId: string;
    caseId: string;
    sourceDocumentIds: string[];
  }) => Promise<IntakeSourceDocument[]>;
  decide: (sample: string) => Promise<JevIdentityDecision>;
  decideDomain?: (rawIntent: string) => Promise<JevDomainDecision>;
  sourceMetadata?: (input: {
    userId: string;
    sourceDocumentIds: string[];
  }) => Promise<Record<string, { filename: string; sourceHash: string }>>;
  extract?: typeof extractDocument;
  now?: () => string;
  createId?: () => string;
  inFlight?: Map<string, Promise<IntakeRunRecord>>;
};

function timestamp(deps: IntakeExecutionDeps): string {
  return deps.now?.() ?? new Date().toISOString();
}

export async function executeIntakeRun(
  deps: IntakeExecutionDeps,
  runId: string,
  userId: string,
): Promise<IntakeRunRecord> {
  const loaded = await loadIntakeRunForProcessing(deps, userId, runId);
  if (loaded.kind === "bail") {
    const existing = await deps.runs.getById(userId, runId);
    if (!existing) {
      throw new Error("INTAKE_RUN_NOT_FOUND");
    }
    return existing;
  }

  const { run } = loaded;
  const identities = await deps.identities.listByRun(userId, runId);
  const loadedDocs = await deps.loadDocuments({
    userId,
    caseId: run.caseId,
    sourceDocumentIds: identities.map((identity) => identity.sourceDocumentId),
  });
  const byId = new Map(loadedDocs.map((document) => [document.sourceDocumentId, document]));

  const pending = identities.filter(
    (identity) => !isTerminalIntakeDocumentStatus(identity.processingStatus),
  );

  await mapWithConcurrency(pending, INTAKE_DOCUMENT_CONCURRENCY, async (identity) => {
    try {
      const source = byId.get(identity.sourceDocumentId) ?? null;
      if (
        identity.processingStatus === "UPLOADED" ||
        identity.processingStatus === "EXTRACTING"
      ) {
        await runIntakeExtractStep(deps, run, identity.sourceDocumentId, source);
      }
      const refreshed = await deps.identities.listByRun(userId, runId);
      const current = refreshed.find((row) => row.sourceDocumentId === identity.sourceDocumentId);
      if (current?.processingStatus === "CLASSIFYING") {
        await runIntakeClassifyStep(deps, run, identity.sourceDocumentId, source);
      }
    } catch {
      identity.processingStatus = "FAILED";
      identity.proposedType = null;
      identity.confidence = null;
      identity.proposedBy = null;
      identity.classifierVersion = null;
      identity.returnedModel = null;
      identity.classifiedAt = null;
      identity.errorCode = "INTAKE_FAILED";
      identity.updatedAt = timestamp(deps);
      await deps.identities.save(identity);
    }
  });

  const latestIdentities = await deps.identities.listByRun(userId, runId);
  const stillPending = latestIdentities.some(
    (identity) => !isTerminalIntakeDocumentStatus(identity.processingStatus),
  );
  if (stillPending) {
    return (await deps.runs.getById(userId, runId)) ?? run;
  }

  let updated = await completeIntakeRunStatus(deps, run);
  if (!isTerminalIntakeRunStatus(updated.status)) {
    return updated;
  }
  await finalizeIntakeRunPackStep(deps, updated);
  return (await deps.runs.getById(userId, runId)) ?? updated;
}

export type { DocumentExtractionRecord, DocumentIdentityRecord, IntakeRunRecord };
