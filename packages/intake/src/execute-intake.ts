import { randomUUID } from "node:crypto";

import {
  IDENTITY_REVIEW_CONFIDENCE,
  INTAKE_CLASSIFIER,
  isTerminalIntakeDocumentStatus,
} from "@hiveforyou/shared/intake";

import { assessExtraction, extractDocument, PLAIN_TEXT_METHOD } from "./extract-document";
import {
  normalizedToExtractionPages,
  primaryExtractionMethod,
} from "./extraction/map-normalized-to-intake";
import { mapWithConcurrency } from "./map-with-concurrency";
import { JevRequestError, type JevIdentityDecision } from "./jev-client";
import type {
  DocumentExtractionRepository,
  DocumentIdentityRepository,
  IntakeRunRepository,
} from "./repositories";
import { rollupIntakeRunStatus } from "./run-status";
import { hasEnoughIdentityText, identityTextSample, joinPageText } from "./sample";
import { NORMALIZED_EXTRACTION_SCHEMA_VERSION } from "@hiveforyou/shared/intake";

import { finalizeIntakeRunPack } from "./finalize-intake-pack";
import type { JevDomainDecision } from "./jev-domain-client";
import type {
  DocumentExtractionRecord,
  DocumentExtractionResult,
  DocumentIdentityRecord,
  DocumentNormalizedExtractionRecord,
  IntakeRunRecord,
  IntakeSourceDocument,
} from "./types";

/** Cap parallel per-document extract/classify work to limit CPU and memory spikes. */
const INTAKE_DOCUMENT_CONCURRENCY = 3;
import type { DocumentNormalizedExtractionRepository } from "./repositories";

export type IntakeExecutionDeps = {
  runs: IntakeRunRepository;
  identities: DocumentIdentityRepository;
  extractions: DocumentExtractionRepository;
  normalizedExtractions?: DocumentNormalizedExtractionRepository;
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

function nextId(deps: IntakeExecutionDeps): string {
  return deps.createId?.() ?? randomUUID();
}

async function persistIdentity(
  deps: IntakeExecutionDeps,
  record: DocumentIdentityRecord,
): Promise<void> {
  await deps.identities.save(record);
}

export async function executeIntakeRun(
  deps: IntakeExecutionDeps,
  runId: string,
  userId: string,
): Promise<IntakeRunRecord> {
  const run = await deps.runs.getById(userId, runId);
  if (!run) {
    throw new Error("INTAKE_RUN_NOT_FOUND");
  }
  if (run.status !== "RUNNING") {
    return run;
  }

  const identities = await deps.identities.listByRun(userId, runId);
  const loaded = await deps.loadDocuments({
    userId,
    caseId: run.caseId,
    sourceDocumentIds: identities.map((identity) => identity.sourceDocumentId),
  });
  const byId = new Map(loaded.map((document) => [document.sourceDocumentId, document]));
  const extract = deps.extract ?? extractDocument;

  const pending = identities.filter(
    (identity) => !isTerminalIntakeDocumentStatus(identity.processingStatus),
  );
  await mapWithConcurrency(pending, INTAKE_DOCUMENT_CONCURRENCY, async (identity) => {
    try {
      await processDocument(deps, run, identity, byId.get(identity.sourceDocumentId) ?? null, extract);
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
      await persistIdentity(deps, identity);
    }
  });

  const latest = await deps.identities.listByRun(userId, runId);
  const status = rollupIntakeRunStatus(latest.map((identity) => identity.processingStatus));
  const now = timestamp(deps);
  let updated: IntakeRunRecord = {
    ...run,
    status,
    completedAt: status === "RUNNING" ? null : now,
    errorCode: status === "FAILED" ? "INTAKE_UNUSABLE" : null,
    updatedAt: now,
  };

  if (status !== "RUNNING") {
    updated = await finalizeIntakeRunPack(deps, updated);
  }

  await deps.runs.save(updated);
  return updated;
}

async function processDocument(
  deps: IntakeExecutionDeps,
  run: IntakeRunRecord,
  identity: DocumentIdentityRecord,
  source: IntakeSourceDocument | null,
  extract: typeof extractDocument,
): Promise<void> {
  const now = () => timestamp(deps);
  identity.processingStatus = "EXTRACTING";
  identity.updatedAt = now();
  await persistIdentity(deps, identity);

  if (!source) {
    markFailed(identity, "SOURCE_MISSING", now());
    await persistIdentity(deps, identity);
    return;
  }

  const { extraction, normalizedAlreadyStored } = await resolveDocumentExtraction(
    deps,
    identity,
    source,
    run,
    extract,
  );

  if (extraction.normalizedExtraction && !normalizedAlreadyStored) {
    if (!deps.normalizedExtractions) {
      markFailed(identity, "NORMALIZED_EXTRACTION_UNAVAILABLE", now());
      await persistIdentity(deps, identity);
      return;
    }
    const createdAt = now();
    const record: DocumentNormalizedExtractionRecord = {
      id: nextId(deps),
      userId: identity.userId,
      sourceDocumentId: identity.sourceDocumentId,
      sourceHash: extraction.sourceHash,
      schemaVersion: NORMALIZED_EXTRACTION_SCHEMA_VERSION,
      normalizedExtraction: extraction.normalizedExtraction,
      createdAt,
    };
    try {
      await deps.normalizedExtractions.upsert(record);
      const stored = await deps.normalizedExtractions.getBySourceHash(
        identity.userId,
        identity.sourceDocumentId,
        extraction.sourceHash,
      );
      if (
        !stored ||
        stored.schemaVersion !== NORMALIZED_EXTRACTION_SCHEMA_VERSION ||
        stored.normalizedExtraction.schemaVersion !== NORMALIZED_EXTRACTION_SCHEMA_VERSION
      ) {
        throw new Error("NORMALIZED_EXTRACTION_VERIFY_FAILED");
      }
    } catch {
      markFailed(identity, "NORMALIZED_EXTRACTION_PERSISTENCE_FAILED", now());
      await persistIdentity(deps, identity);
      return;
    }
  }


  if (extraction.pages.length > 0) {
    const createdAt = now();
    const pages: DocumentExtractionRecord[] = extraction.pages.map((page) => ({
      id: nextId(deps),
      userId: identity.userId,
      sourceDocumentId: identity.sourceDocumentId,
      pageNumber: page.pageNumber,
      extractionMethod: (page.extractionMethod ?? extraction.extractionMethod ?? "NATIVE") as string,
      sourceHash: extraction.sourceHash,
      pageText: page.text,
      boundingBoxes: page.boundingBoxes ?? null,
      createdAt,
    }));
    await deps.extractions.upsertPages(pages);
  }

  const pageText = joinPageText(extraction.pages);
  if (extraction.extractionStatus === "FAILED") {
    markFailed(identity, extraction.errorCode ?? "EXTRACTION_FAILED", now());
    await persistIdentity(deps, identity);
    return;
  }

  if (
    extraction.extractionStatus !== "SUCCEEDED" ||
    extraction.pages.length === 0 ||
    !hasEnoughIdentityText(pageText)
  ) {
    identity.processingStatus = "NEEDS_OCR";
    identity.proposedType = null;
    identity.confidence = null;
    identity.proposedBy = null;
    identity.classifierVersion = null;
    identity.returnedModel = null;
    identity.classifiedAt = null;
    identity.errorCode = null;
    identity.updatedAt = now();
    await persistIdentity(deps, identity);
    return;
  }

  identity.processingStatus = "CLASSIFYING";
  identity.updatedAt = now();
  await persistIdentity(deps, identity);

  const sample = identityTextSample(pageText);
  let decision: JevIdentityDecision;
  try {
    decision = await deps.decide(sample);
  } catch (error) {
    const errorCode = error instanceof JevRequestError ? error.errorCode : "JEV_UNAVAILABLE";
    markFailed(identity, errorCode, now());
    await persistIdentity(deps, identity);
    return;
  }

  const classifiedAt = now();
  identity.proposedType = decision.choice;
  identity.confidence = decision.confidence;
  identity.proposedBy = INTAKE_CLASSIFIER;
  identity.returnedModel = decision.returnedModel;
  identity.classifierVersion = decision.classifierVersion;
  identity.classifiedAt = classifiedAt;
  identity.errorCode = null;
  identity.processingStatus =
    decision.confidence < IDENTITY_REVIEW_CONFIDENCE ? "NEEDS_REVIEW" : "CLASSIFIED";
  identity.updatedAt = classifiedAt;
  await persistIdentity(deps, identity);
}

type ExtractionResolution = {
  extraction: DocumentExtractionResult;
  normalizedAlreadyStored: boolean;
};

async function resolveDocumentExtraction(
  deps: IntakeExecutionDeps,
  identity: DocumentIdentityRecord,
  source: IntakeSourceDocument,
  run: IntakeRunRecord,
  extract: typeof extractDocument,
): Promise<ExtractionResolution> {
  if (deps.normalizedExtractions) {
    const cached = await deps.normalizedExtractions.getBySourceHash(
      identity.userId,
      identity.sourceDocumentId,
      source.sha256,
    );
    if (
      cached &&
      cached.schemaVersion === NORMALIZED_EXTRACTION_SCHEMA_VERSION &&
      cached.normalizedExtraction.schemaVersion === NORMALIZED_EXTRACTION_SCHEMA_VERSION
    ) {
      const normalized = cached.normalizedExtraction;
      const pages = normalizedToExtractionPages(normalized);
      const extractionMethod =
        normalized.detectedKind === "plain-text"
          ? PLAIN_TEXT_METHOD
          : primaryExtractionMethod(normalized);
      return {
        extraction: assessExtraction({
          documentId: source.sourceDocumentId,
          sourceHash: source.sha256,
          extractionMethod,
          pages,
          normalizedExtraction: normalized,
        }),
        normalizedAlreadyStored: true,
      };
    }
  }

  const extraction = await extract({
    documentId: source.sourceDocumentId,
    bytes: source.bytes,
    mimeType: source.mimeType,
    sourceHash: source.sha256,
    runId: run.id,
  });
  return { extraction, normalizedAlreadyStored: false };
}

function markFailed(identity: DocumentIdentityRecord, errorCode: string, updatedAt: string): void {
  identity.processingStatus = "FAILED";
  identity.proposedType = null;
  identity.confidence = null;
  identity.proposedBy = null;
  identity.classifierVersion = null;
  identity.returnedModel = null;
  identity.classifiedAt = null;
  identity.errorCode = errorCode;
  identity.updatedAt = updatedAt;
}
