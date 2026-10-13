export const READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION = "hive.reader-document-extraction/1" as const;
export const READER_DOCUMENT_EXTRACTION_MANIFEST_SCHEMA_VERSION =
  "hive.reader-document-extraction-manifest/1" as const;

export type ReaderDocumentExtractionStatus = "SUCCEEDED" | "INVALID_JSON" | "MODEL_ERROR";

export type ReaderDocumentExtractionEnvelope = {
  schemaVersion: typeof READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION;
  studyRunId: string;
  attemptId: string;
  caseId: string;
  userId: string;
  sourceDocumentId: string;
  domainId: string;
  packId: string;
  packVersion: string;
  packContentSha256: string | null;
  promptVersion: string | null;
  modelProvider: string;
  modelId: string;
  status: ReaderDocumentExtractionStatus;
  occurredAt: string;
  rawAssistantText?: string;
  parsedModelJson?: Record<string, unknown>;
  usage?: {
    inputTokens: number | null;
    outputTokens: number | null;
    cacheReadInputTokens: number | null;
    cacheWriteInputTokens: number | null;
  };
  latencyMs?: number;
  sanitizedError?: {
    code: string;
    message: string;
  };
};

export type ReaderDocumentExtractionAttemptManifest = {
  schemaVersion: typeof READER_DOCUMENT_EXTRACTION_MANIFEST_SCHEMA_VERSION;
  studyRunId: string;
  attemptId: string;
  caseId: string;
  updatedAt: string;
  documents: Array<{
    sourceDocumentId: string;
    status: ReaderDocumentExtractionStatus;
    envelopeObjectKey: string;
  }>;
};

export type ReaderDocumentExtractionStudyRunManifest = {
  schemaVersion: typeof READER_DOCUMENT_EXTRACTION_MANIFEST_SCHEMA_VERSION;
  studyRunId: string;
  caseId: string;
  latestAttemptId: string;
  updatedAt: string;
  latestAttemptManifestObjectKey: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readRequiredString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (!isNonEmptyString(value)) {
    throw new Error(`READER_DOCUMENT_EXTRACTION_INVALID: ${field}`);
  }
  return value;
}

function parseUsage(raw: unknown): ReaderDocumentExtractionEnvelope["usage"] | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  const readToken = (...keys: string[]): number | null => {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
    }
    return null;
  };
  return {
    inputTokens: readToken("inputTokens", "input_tokens"),
    outputTokens: readToken("outputTokens", "output_tokens"),
    cacheReadInputTokens: readToken("cacheReadInputTokens", "cache_read_input_tokens"),
    cacheWriteInputTokens: readToken("cacheWriteInputTokens", "cache_write_input_tokens"),
  };
}

export function parseReaderDocumentExtractionEnvelope(raw: unknown): ReaderDocumentExtractionEnvelope {
  if (!raw || typeof raw !== "object") {
    throw new Error("READER_DOCUMENT_EXTRACTION_INVALID: expected object");
  }
  const record = raw as Record<string, unknown>;
  if (record.schemaVersion !== READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION) {
    throw new Error("READER_DOCUMENT_EXTRACTION_INVALID: schemaVersion");
  }
  const status = record.status;
  if (status !== "SUCCEEDED" && status !== "INVALID_JSON" && status !== "MODEL_ERROR") {
    throw new Error("READER_DOCUMENT_EXTRACTION_INVALID: status");
  }
  const studyRunId = readRequiredString(record, "studyRunId");
  const attemptId = readRequiredString(record, "attemptId");
  const caseId = readRequiredString(record, "caseId");
  const userId = readRequiredString(record, "userId");
  const sourceDocumentId = readRequiredString(record, "sourceDocumentId");
  const domainId = readRequiredString(record, "domainId");
  const packId = readRequiredString(record, "packId");
  const packVersion = readRequiredString(record, "packVersion");
  const modelProvider = readRequiredString(record, "modelProvider");
  const modelId = readRequiredString(record, "modelId");
  const occurredAt = readRequiredString(record, "occurredAt");
  const packHash = record.packContentSha256;
  if (packHash !== null && packHash !== undefined) {
    if (typeof packHash !== "string" || !/^[a-f0-9]{64}$/.test(packHash)) {
      throw new Error("READER_DOCUMENT_EXTRACTION_INVALID: packContentSha256");
    }
  }
  const promptVersion = record.promptVersion;
  if (promptVersion !== null && promptVersion !== undefined && !isNonEmptyString(promptVersion)) {
    throw new Error("READER_DOCUMENT_EXTRACTION_INVALID: promptVersion");
  }
  let parsedModelJson: Record<string, unknown> | undefined;
  if (record.parsedModelJson !== undefined && record.parsedModelJson !== null) {
    if (!record.parsedModelJson || typeof record.parsedModelJson !== "object" || Array.isArray(record.parsedModelJson)) {
      throw new Error("READER_DOCUMENT_EXTRACTION_INVALID: parsedModelJson");
    }
    parsedModelJson = record.parsedModelJson as Record<string, unknown>;
  }
  let sanitizedError: ReaderDocumentExtractionEnvelope["sanitizedError"];
  if (record.sanitizedError !== undefined && record.sanitizedError !== null) {
    if (!record.sanitizedError || typeof record.sanitizedError !== "object") {
      throw new Error("READER_DOCUMENT_EXTRACTION_INVALID: sanitizedError");
    }
    const err = record.sanitizedError as Record<string, unknown>;
    if (!isNonEmptyString(err.code) || !isNonEmptyString(err.message)) {
      throw new Error("READER_DOCUMENT_EXTRACTION_INVALID: sanitizedError fields");
    }
    sanitizedError = { code: err.code, message: err.message };
  }
  const latencyMs = record.latencyMs;
  if (latencyMs !== undefined && latencyMs !== null) {
    if (typeof latencyMs !== "number" || !Number.isFinite(latencyMs)) {
      throw new Error("READER_DOCUMENT_EXTRACTION_INVALID: latencyMs");
    }
  }
  const rawAssistantText = record.rawAssistantText;
  if (rawAssistantText !== undefined && rawAssistantText !== null && typeof rawAssistantText !== "string") {
    throw new Error("READER_DOCUMENT_EXTRACTION_INVALID: rawAssistantText");
  }
  return {
    schemaVersion: READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION,
    studyRunId,
    attemptId,
    caseId,
    userId,
    sourceDocumentId,
    domainId,
    packId,
    packVersion,
    packContentSha256: (packHash as string | null | undefined) ?? null,
    promptVersion: (promptVersion as string | null | undefined) ?? null,
    modelProvider,
    modelId,
    status,
    occurredAt,
    rawAssistantText: rawAssistantText as string | undefined,
    parsedModelJson,
    usage: parseUsage(record.usage),
    latencyMs: latencyMs as number | undefined,
    sanitizedError,
  };
}

export function buildReaderDocumentExtractionEnvelope(
  input: ReaderDocumentExtractionEnvelope,
): ReaderDocumentExtractionEnvelope {
  return parseReaderDocumentExtractionEnvelope(input);
}

export function buildReaderDocumentExtractionAttemptManifest(input: {
  studyRunId: string;
  attemptId: string;
  caseId: string;
  updatedAt: string;
  documents: ReaderDocumentExtractionAttemptManifest["documents"];
}): ReaderDocumentExtractionAttemptManifest {
  if (!isNonEmptyString(input.studyRunId)) {
    throw new Error("READER_DOCUMENT_EXTRACTION_MANIFEST_INVALID: studyRunId");
  }
  if (!isNonEmptyString(input.attemptId)) {
    throw new Error("READER_DOCUMENT_EXTRACTION_MANIFEST_INVALID: attemptId");
  }
  if (!isNonEmptyString(input.caseId)) {
    throw new Error("READER_DOCUMENT_EXTRACTION_MANIFEST_INVALID: caseId");
  }
  if (!isNonEmptyString(input.updatedAt)) {
    throw new Error("READER_DOCUMENT_EXTRACTION_MANIFEST_INVALID: updatedAt");
  }
  if (!Array.isArray(input.documents) || input.documents.length === 0) {
    throw new Error("READER_DOCUMENT_EXTRACTION_MANIFEST_INVALID: documents");
  }
  for (const doc of input.documents) {
    if (!isNonEmptyString(doc.sourceDocumentId)) {
      throw new Error("READER_DOCUMENT_EXTRACTION_MANIFEST_INVALID: sourceDocumentId");
    }
    if (doc.status !== "SUCCEEDED" && doc.status !== "INVALID_JSON" && doc.status !== "MODEL_ERROR") {
      throw new Error("READER_DOCUMENT_EXTRACTION_MANIFEST_INVALID: status");
    }
    if (!isNonEmptyString(doc.envelopeObjectKey)) {
      throw new Error("READER_DOCUMENT_EXTRACTION_MANIFEST_INVALID: envelopeObjectKey");
    }
  }
  return {
    schemaVersion: READER_DOCUMENT_EXTRACTION_MANIFEST_SCHEMA_VERSION,
    studyRunId: input.studyRunId,
    attemptId: input.attemptId,
    caseId: input.caseId,
    updatedAt: input.updatedAt,
    documents: input.documents,
  };
}
