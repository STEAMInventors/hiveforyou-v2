import {
  readerDocumentExtractionAttemptManifestPath,
  readerDocumentExtractionEnvelopePath,
} from "@hiveforyou/shared/hive-artifact-paths";
import type { StructureMapLogicalDocument } from "@hiveforyou/shared/discover/structure-map";
import type {
  ReaderDocumentExtractionAttemptManifest,
  ReaderDocumentExtractionEnvelope,
  ReaderDocumentExtractionStatus,
  ReaderDocumentExtractionStudyRunManifest,
} from "@hiveforyou/shared/reader-document-extraction";
import type { StudyRawExtractionArtifact, StudyRawExtractionOutcome } from "./study-artifact-persistence.js";
import { displayModelIdentityFromSummary } from "./reader-engine-identity.js";

export type RawExtractionDocumentDisplayStatus =
  | ReaderDocumentExtractionStatus
  | "MISSING_OUTPUT";

export type RawExtractionInspectorEvidenceRef = {
  sourceDocumentId: string;
  page: number | null;
  quote: string | null;
  fieldPath: string;
};

export type RawExtractionInspectorRecord = {
  recordTypeId: string;
  fields: Record<string, { value: unknown; evidence: RawExtractionInspectorEvidenceRef | null }>;
};

export type RawExtractionInspectorDocument = {
  sourceDocumentId: string;
  logicalDocumentId: string | null;
  sequenceOrder: number | null;
  customerLabel: string | null;
  displayStatus: RawExtractionDocumentDisplayStatus;
  envelope: ReaderDocumentExtractionEnvelope | null;
  modelDocumentClassification: string | null;
  parseDiagnostics: string[];
  records: RawExtractionInspectorRecord[];
  evidenceRefs: RawExtractionInspectorEvidenceRef[];
};

export type RawExtractionInspectorBundle = {
  disclaimer: "Unvalidated model extraction";
  caseId: string;
  studyRunId: string;
  attemptId: string | null;
  studyRunStatus: string;
  rawExtractionOutcome: StudyRawExtractionOutcome | null;
  modelProvider: string | null;
  modelId: string | null;
  domainPackId: string | null;
  domainPackVersion: string | null;
  processingTimeMs: number | null;
  documents: RawExtractionInspectorDocument[];
  downloadPayload: {
    schemaVersion: "hive.raw-extraction-inspector-export/1";
    exportedAt: string;
    studyRunId: string;
    attemptId: string | null;
    caseId: string;
    terminalArtifact: StudyRawExtractionArtifact | null;
    attemptManifest: ReaderDocumentExtractionAttemptManifest | null;
    studyRunManifest: ReaderDocumentExtractionStudyRunManifest | null;
    envelopes: ReaderDocumentExtractionEnvelope[];
  };
};

export function orderSourceDocumentIdsForEngine1(input: {
  logicalDocuments: StructureMapLogicalDocument[];
  fallbackSourceDocumentIds: string[];
}): string[] {
  const fromStructure = [...input.logicalDocuments]
    .sort((a, b) => {
      const orderA = a.sequenceOrder ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.sequenceOrder ?? Number.MAX_SAFE_INTEGER;
      return orderA - orderB || a.id.localeCompare(b.id);
    })
    .map((doc) => doc.sourceDocumentId)
    .filter((id) => id.trim().length > 0);

  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of fromStructure) {
    if (!seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  }
  for (const id of input.fallbackSourceDocumentIds) {
    const trimmed = id.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      ordered.push(trimmed);
    }
  }
  return ordered;
}

export function assertReaderDocumentExtractionEnvelopeObjectKey(input: {
  userId: string;
  studyRunId: string;
  attemptId: string;
  sourceDocumentId: string;
  objectKey: string;
}): void {
  const expected = readerDocumentExtractionEnvelopePath(
    input.userId,
    input.studyRunId,
    input.attemptId,
    input.sourceDocumentId,
  );
  if (input.objectKey !== expected) {
    throw new Error("READER_DOCUMENT_EXTRACTION_FORBIDDEN_OBJECT_KEY");
  }
  const prefix = `${input.userId}/reader-document-extractions/`;
  if (!input.objectKey.startsWith(prefix)) {
    throw new Error("READER_DOCUMENT_EXTRACTION_FORBIDDEN_OBJECT_KEY");
  }
}

export function assertReaderDocumentExtractionAttemptManifestObjectKey(input: {
  userId: string;
  studyRunId: string;
  attemptId: string;
  objectKey: string;
}): void {
  const expected = readerDocumentExtractionAttemptManifestPath(
    input.userId,
    input.studyRunId,
    input.attemptId,
  );
  if (input.objectKey !== expected) {
    throw new Error("READER_DOCUMENT_EXTRACTION_FORBIDDEN_OBJECT_KEY");
  }
}

function readEvidence(value: unknown, fieldPath: string): RawExtractionInspectorEvidenceRef | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const sourceDocumentId =
    typeof record.sourceDocumentId === "string" ? record.sourceDocumentId : null;
  const page = typeof record.page === "number" && Number.isFinite(record.page) ? record.page : null;
  const quote = typeof record.quote === "string" ? record.quote : null;
  if (!sourceDocumentId && page == null && quote == null) {
    return null;
  }
  return {
    sourceDocumentId: sourceDocumentId ?? "",
    page,
    quote,
    fieldPath,
  };
}

export function extractInspectorRecordsFromParsedModel(
  parsedModelJson: Record<string, unknown> | undefined,
): { records: RawExtractionInspectorRecord[]; evidenceRefs: RawExtractionInspectorEvidenceRef[] } {
  if (!parsedModelJson) {
    return { records: [], evidenceRefs: [] };
  }
  const instances = parsedModelJson.recordInstances;
  if (!Array.isArray(instances)) {
    return { records: [], evidenceRefs: [] };
  }

  const records: RawExtractionInspectorRecord[] = [];
  const evidenceRefs: RawExtractionInspectorEvidenceRef[] = [];

  instances.forEach((instance, instanceIndex) => {
    if (!instance || typeof instance !== "object" || Array.isArray(instance)) {
      return;
    }
    const row = instance as Record<string, unknown>;
    const recordTypeId =
      typeof row.recordTypeId === "string" ? row.recordTypeId : `record-${instanceIndex}`;
    const fieldsRaw = row.fields;
    const fields: RawExtractionInspectorRecord["fields"] = {};
    if (fieldsRaw && typeof fieldsRaw === "object" && !Array.isArray(fieldsRaw)) {
      for (const [fieldName, fieldValue] of Object.entries(fieldsRaw as Record<string, unknown>)) {
        if (!fieldValue || typeof fieldValue !== "object" || Array.isArray(fieldValue)) {
          fields[fieldName] = { value: fieldValue, evidence: null };
          continue;
        }
        const slot = fieldValue as Record<string, unknown>;
        const evidence = readEvidence(slot.evidence, `${recordTypeId}.${fieldName}`);
        if (evidence) {
          evidenceRefs.push(evidence);
        }
        fields[fieldName] = {
          value: "value" in slot ? slot.value : fieldValue,
          evidence,
        };
      }
    }
    records.push({ recordTypeId, fields });
  });

  return { records, evidenceRefs };
}

export function buildParseDiagnostics(envelope: ReaderDocumentExtractionEnvelope | null): string[] {
  if (!envelope) {
    return ["No persisted envelope for this logical document."];
  }
  const lines: string[] = [`Persistence status: ${envelope.status}`];
  if (envelope.sanitizedError) {
    lines.push(`Model call error (${envelope.sanitizedError.code}): ${envelope.sanitizedError.message}`);
  }
  if (envelope.status === "INVALID_JSON") {
    lines.push("Model response could not be parsed as JSON.");
  }
  if (envelope.status === "SUCCEEDED" && !envelope.parsedModelJson) {
    lines.push("Succeeded status but parsedModelJson is absent.");
  }
  return lines;
}

export function buildRawExtractionInspectorBundle(input: {
  caseId: string;
  studyRunId: string;
  studyRunStatus: string;
  attemptId: string | null;
  terminalArtifact: StudyRawExtractionArtifact | null;
  studyRunManifest: ReaderDocumentExtractionStudyRunManifest | null;
  attemptManifest: ReaderDocumentExtractionAttemptManifest | null;
  envelopesBySourceDocumentId: Map<string, ReaderDocumentExtractionEnvelope>;
  orderedSourceDocumentIds: string[];
  logicalDocuments: StructureMapLogicalDocument[];
  exportedAt?: string;
}): RawExtractionInspectorBundle {
  const logicalBySource = new Map(
    input.logicalDocuments.map((doc) => [doc.sourceDocumentId, doc] as const),
  );

  const manifestStatusBySource = new Map<string, ReaderDocumentExtractionStatus>();
  for (const row of input.attemptManifest?.documents ?? []) {
    manifestStatusBySource.set(row.sourceDocumentId, row.status);
  }

  const documents: RawExtractionInspectorDocument[] = input.orderedSourceDocumentIds.map(
    (sourceDocumentId) => {
      const logical = logicalBySource.get(sourceDocumentId);
      const envelope = input.envelopesBySourceDocumentId.get(sourceDocumentId) ?? null;
      let displayStatus: RawExtractionDocumentDisplayStatus =
        envelope?.status ?? manifestStatusBySource.get(sourceDocumentId) ?? "MISSING_OUTPUT";
      if (!envelope && !manifestStatusBySource.has(sourceDocumentId)) {
        displayStatus = "MISSING_OUTPUT";
      }
      const classification =
        envelope?.parsedModelJson && typeof envelope.parsedModelJson.documentTypeId === "string"
          ? envelope.parsedModelJson.documentTypeId
          : null;
      const { records, evidenceRefs } = extractInspectorRecordsFromParsedModel(
        envelope?.parsedModelJson,
      );
      return {
        sourceDocumentId,
        logicalDocumentId: logical?.id ?? null,
        sequenceOrder: logical?.sequenceOrder ?? null,
        customerLabel: logical?.title ?? null,
        displayStatus,
        envelope,
        modelDocumentClassification: classification,
        parseDiagnostics: buildParseDiagnostics(envelope),
        records,
        evidenceRefs,
      };
    },
  );

  const envelopes = [...input.envelopesBySourceDocumentId.values()];
  const processingTimeMs = envelopes.reduce(
    (sum, row) => sum + (typeof row.latencyMs === "number" ? row.latencyMs : 0),
    0,
  );
  const modelIdentity = displayModelIdentityFromSummary(
    input.terminalArtifact?.observedReaderIdentity,
    envelopes,
  );
  const firstEnvelope = envelopes[0];

  return {
    disclaimer: "Unvalidated model extraction",
    caseId: input.caseId,
    studyRunId: input.studyRunId,
    attemptId: input.attemptId,
    studyRunStatus: input.studyRunStatus,
    rawExtractionOutcome: input.terminalArtifact?.outcome ?? null,
    modelProvider: modelIdentity.modelProvider,
    modelId: modelIdentity.modelId,
    domainPackId: firstEnvelope?.packId ?? null,
    domainPackVersion: firstEnvelope?.packVersion ?? null,
    processingTimeMs: envelopes.length > 0 ? processingTimeMs : null,
    documents,
    downloadPayload: {
      schemaVersion: "hive.raw-extraction-inspector-export/1",
      exportedAt: input.exportedAt ?? new Date().toISOString(),
      studyRunId: input.studyRunId,
      attemptId: input.attemptId,
      caseId: input.caseId,
      terminalArtifact: input.terminalArtifact,
      attemptManifest: input.attemptManifest,
      studyRunManifest: input.studyRunManifest,
      envelopes,
    },
  };
}
