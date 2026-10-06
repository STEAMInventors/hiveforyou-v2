import { randomUUID } from "node:crypto";

import {
  IDENTITY_REVIEW_CONFIDENCE,
  INTAKE_CLASSIFIER,
  INTAKE_IDENTITY_CONFIG_ID,
  isTerminalIntakeDocumentStatus,
  isTerminalIntakeRunStatus,
} from "@hiveforyou/shared/intake";

import { TEXT_TOO_SHORT_ERROR_CODE, textTooShortToClassify } from "./decide-document-identity-local";
import { assessExtraction, extractDocument, PLAIN_TEXT_METHOD } from "./extract-document";
import {
  normalizedToExtractionPages,
  primaryExtractionMethod,
} from "./extraction/map-normalized-to-intake";
import type { IntakeExecutionDeps } from "./execute-intake";
import { finalizeIntakeRunPack } from "./finalize-intake-pack";
import { JevRequestError, type JevIdentityDecision } from "./jev-client";
import { rollupIntakeRunStatus } from "./run-status";
import { identityTextSample, joinPageText } from "./sample";
import { elapsedMs, logStageTiming } from "./stage-timing";
import type {
  DocumentExtractionRecord,
  DocumentExtractionResult,
  DocumentIdentityRecord,
  DocumentNormalizedExtractionRecord,
  IntakeRunRecord,
  IntakeSourceDocument,
} from "./types";
import {
  NORMALIZED_EXTRACTION_SCHEMA_VERSION,
  NESTIEP_EXTRACTOR_VERSION,
} from "@hiveforyou/shared/intake";

export const INTAKE_NON_RETRIABLE_ERROR_CODES = new Set([
  "ENCRYPTED_PDF",
  "UNSUPPORTED_FILE",
  "SOURCE_MISSING",
]);

export function isIntakeNonRetriableErrorCode(errorCode: string | null | undefined): boolean {
  return Boolean(errorCode && INTAKE_NON_RETRIABLE_ERROR_CODES.has(errorCode));
}

export type IntakeExtractStepResult = {
  sourceDocumentId: string;
  extractionStatus: string;
  pageCount: number;
  normalizedStored: boolean;
  errorCode: string | null;
};

export type IntakeClassifyStepResult = {
  sourceDocumentId: string;
  processingStatus: string;
  errorCode: string | null;
};

export type IntakeLoadRunResult =
  | { kind: "bail"; reason: "missing" | "complete" }
  | {
      kind: "ready";
      run: IntakeRunRecord;
      identities: DocumentIdentityRecord[];
      pendingExtractIds: string[];
      pendingClassifyIds: string[];
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
      cached.normalizedExtraction.schemaVersion === NORMALIZED_EXTRACTION_SCHEMA_VERSION &&
      cached.normalizedExtraction.extractorVersion === NESTIEP_EXTRACTOR_VERSION
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

export async function loadIntakeRunForProcessing(
  deps: IntakeExecutionDeps,
  userId: string,
  intakeRunId: string,
): Promise<IntakeLoadRunResult> {
  const run = await deps.runs.getById(userId, intakeRunId);
  if (!run) {
    return { kind: "bail", reason: "missing" };
  }
  if (isTerminalIntakeRunStatus(run.status)) {
    return { kind: "bail", reason: "complete" };
  }

  let activeRun = run;
  if (run.status === "QUEUED") {
    const now = timestamp(deps);
    activeRun = {
      ...run,
      status: "RUNNING",
      startedAt: run.startedAt || now,
      updatedAt: now,
    };
    await deps.runs.save(activeRun);
  }

  const identities = await deps.identities.listByRun(userId, intakeRunId);
  const pendingExtractIds = identities
    .filter(
      (identity) =>
        identity.processingStatus === "UPLOADED" ||
        identity.processingStatus === "EXTRACTING",
    )
    .map((identity) => identity.sourceDocumentId);
  const pendingClassifyIds = identities
    .filter((identity) => identity.processingStatus === "CLASSIFYING")
    .map((identity) => identity.sourceDocumentId);

  return {
    kind: "ready",
    run: activeRun,
    identities,
    pendingExtractIds,
    pendingClassifyIds,
  };
}

export async function runIntakeExtractStep(
  deps: IntakeExecutionDeps,
  run: IntakeRunRecord,
  sourceDocumentId: string,
  source: IntakeSourceDocument | null,
): Promise<IntakeExtractStepResult> {
  const now = () => timestamp(deps);
  const identities = await deps.identities.listByRun(run.userId, run.id);
  const identity = identities.find((row) => row.sourceDocumentId === sourceDocumentId);
  if (!identity) {
    throw new Error("INTAKE_IDENTITY_NOT_FOUND");
  }
  if (isTerminalIntakeDocumentStatus(identity.processingStatus)) {
    return {
      sourceDocumentId,
      extractionStatus: identity.processingStatus,
      pageCount: 0,
      normalizedStored: true,
      errorCode: identity.errorCode,
    };
  }

  identity.processingStatus = "EXTRACTING";
  identity.updatedAt = now();
  await persistIdentity(deps, identity);

  if (!source) {
    markFailed(identity, "SOURCE_MISSING", now());
    await persistIdentity(deps, identity);
    return {
      sourceDocumentId,
      extractionStatus: "FAILED",
      pageCount: 0,
      normalizedStored: false,
      errorCode: "SOURCE_MISSING",
    };
  }

  const extract = deps.extract ?? extractDocument;
  const extractStart = performance.now();
  const { extraction, normalizedAlreadyStored } = await resolveDocumentExtraction(
    deps,
    identity,
    source,
    run,
    extract,
  );
  const stats = extraction.normalizedExtraction?.statistics;
  logStageTiming({
    stage: "extract",
    intakeRunId: run.id,
    sourceDocumentId: identity.sourceDocumentId,
    pageCount: stats?.pageCount ?? extraction.pages.length,
    nativePageCount: stats?.nativePageCount ?? null,
    ocrPageCount: stats?.ocrPageCount ?? null,
    operatorListSkippedPages: stats?.operatorListSkippedPages ?? null,
    extractionStatus: extraction.extractionStatus,
    ms: elapsedMs(extractStart),
  });

  if (extraction.normalizedExtraction && !normalizedAlreadyStored) {
    if (!deps.normalizedExtractions) {
      markFailed(identity, "NORMALIZED_EXTRACTION_UNAVAILABLE", now());
      await persistIdentity(deps, identity);
      return {
        sourceDocumentId,
        extractionStatus: "FAILED",
        pageCount: extraction.pages.length,
        normalizedStored: false,
        errorCode: "NORMALIZED_EXTRACTION_UNAVAILABLE",
      };
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
      return {
        sourceDocumentId,
        extractionStatus: "FAILED",
        pageCount: extraction.pages.length,
        normalizedStored: false,
        errorCode: "NORMALIZED_EXTRACTION_PERSISTENCE_FAILED",
      };
    }
  }

  if (extraction.documentPages && deps.documentPages) {
    try {
      await deps.documentPages.saveIfAbsent(
        identity.userId,
        extraction.sourceHash,
        extraction.documentPages,
      );
    } catch {
      // Document-pages cache is best-effort; extraction outcome is unchanged.
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
    const errorCode = extraction.errorCode ?? "EXTRACTION_FAILED";
    markFailed(identity, errorCode, now());
    await persistIdentity(deps, identity);
    return {
      sourceDocumentId,
      extractionStatus: "FAILED",
      pageCount: extraction.pages.length,
      normalizedStored: normalizedAlreadyStored || Boolean(extraction.normalizedExtraction),
      errorCode,
    };
  }

  if (
    (extraction.extractionStatus !== "SUCCEEDED" && extraction.extractionStatus !== "PARTIAL") ||
    extraction.pages.length === 0
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
    return {
      sourceDocumentId,
      extractionStatus: extraction.extractionStatus,
      pageCount: extraction.pages.length,
      normalizedStored: normalizedAlreadyStored || Boolean(extraction.normalizedExtraction),
      errorCode: null,
    };
  }

  if (textTooShortToClassify(pageText)) {
    const classifiedAt = now();
    identity.proposedType = "other";
    identity.confidence = 0;
    identity.proposedBy = INTAKE_CLASSIFIER;
    identity.returnedModel = null;
    identity.classifierVersion = INTAKE_IDENTITY_CONFIG_ID;
    identity.classifiedAt = classifiedAt;
    identity.errorCode = TEXT_TOO_SHORT_ERROR_CODE;
    identity.processingStatus = "NEEDS_REVIEW";
    identity.updatedAt = classifiedAt;
    await persistIdentity(deps, identity);
    return {
      sourceDocumentId,
      extractionStatus: extraction.extractionStatus,
      pageCount: extraction.pages.length,
      normalizedStored: normalizedAlreadyStored || Boolean(extraction.normalizedExtraction),
      errorCode: TEXT_TOO_SHORT_ERROR_CODE,
    };
  }

  identity.processingStatus = "CLASSIFYING";
  identity.updatedAt = now();
  await persistIdentity(deps, identity);

  return {
    sourceDocumentId,
    extractionStatus: extraction.extractionStatus,
    pageCount: extraction.pages.length,
    normalizedStored: normalizedAlreadyStored || Boolean(extraction.normalizedExtraction),
    errorCode: null,
  };
}

export async function runIntakeClassifyStep(
  deps: IntakeExecutionDeps,
  run: IntakeRunRecord,
  sourceDocumentId: string,
  source: IntakeSourceDocument | null,
): Promise<IntakeClassifyStepResult> {
  const now = () => timestamp(deps);
  const identities = await deps.identities.listByRun(run.userId, run.id);
  const identity = identities.find((row) => row.sourceDocumentId === sourceDocumentId);
  if (!identity) {
    throw new Error("INTAKE_IDENTITY_NOT_FOUND");
  }
  if (identity.processingStatus !== "CLASSIFYING") {
    return {
      sourceDocumentId,
      processingStatus: identity.processingStatus,
      errorCode: identity.errorCode,
    };
  }

  if (!source) {
    markFailed(identity, "SOURCE_MISSING", now());
    await persistIdentity(deps, identity);
    return { sourceDocumentId, processingStatus: "FAILED", errorCode: "SOURCE_MISSING" };
  }

  const extract = deps.extract ?? extractDocument;
  const { extraction } = await resolveDocumentExtraction(deps, identity, source, run, extract);
  const pageText = joinPageText(extraction.pages);

  let decision: JevIdentityDecision;
  try {
    decision = await deps.decide(identityTextSample(pageText));
  } catch (error) {
    const errorCode = error instanceof JevRequestError ? error.errorCode : "JEV_UNAVAILABLE";
    markFailed(identity, errorCode, now());
    await persistIdentity(deps, identity);
    return { sourceDocumentId, processingStatus: "FAILED", errorCode };
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

  return {
    sourceDocumentId,
    processingStatus: identity.processingStatus,
    errorCode: null,
  };
}

export async function runIntakeIdentityClassificationForRun(
  deps: IntakeExecutionDeps,
  run: IntakeRunRecord,
  sourcesById: Map<string, IntakeSourceDocument>,
): Promise<IntakeClassifyStepResult[]> {
  const identities = await deps.identities.listByRun(run.userId, run.id);
  const pending = identities.filter((identity) => identity.processingStatus === "CLASSIFYING");
  const results: IntakeClassifyStepResult[] = [];
  for (const identity of pending) {
    results.push(
      await runIntakeClassifyStep(
        deps,
        run,
        identity.sourceDocumentId,
        sourcesById.get(identity.sourceDocumentId) ?? null,
      ),
    );
  }
  return results;
}

export async function completeIntakeRunStatus(
  deps: IntakeExecutionDeps,
  run: IntakeRunRecord,
): Promise<IntakeRunRecord> {
  const latest = await deps.identities.listByRun(run.userId, run.id);
  const status = rollupIntakeRunStatus(latest.map((identity) => identity.processingStatus));
  const now = timestamp(deps);
  const updated: IntakeRunRecord = {
    ...run,
    status,
    completedAt: status === "RUNNING" ? null : now,
    errorCode: status === "FAILED" ? "INTAKE_UNUSABLE" : null,
    updatedAt: now,
  };
  await deps.runs.save(updated);
  return updated;
}

export async function finalizeIntakeRunPackStep(
  deps: IntakeExecutionDeps,
  run: IntakeRunRecord,
): Promise<{ studyPath: IntakeRunRecord["studyPath"]; resolvedDomainId: string | null }> {
  const finalized = await finalizeIntakeRunPack(deps, run);
  await deps.runs.save(finalized);
  return {
    studyPath: finalized.studyPath,
    resolvedDomainId: finalized.resolvedDomainId,
  };
}
