export const READER_ACCEPTED_FACTS_SCHEMA_VERSION = "reader-accepted-facts/1" as const;

export type ReaderAcceptedFactsArtifact = {
  schemaVersion: typeof READER_ACCEPTED_FACTS_SCHEMA_VERSION;
  studyRunId: string;
  attemptId: string;
  caseId: string;
  readerArchitectureVariant: string | null;
  promptSha256: string;
  createdAt: string;
  facts: Record<string, unknown>[];
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseReaderAcceptedFactsArtifact(raw: unknown): ReaderAcceptedFactsArtifact {
  if (!raw || typeof raw !== "object") {
    throw new Error("READER_ACCEPTED_FACTS_INVALID: expected object");
  }
  const record = raw as Record<string, unknown>;
  if (record.schemaVersion !== READER_ACCEPTED_FACTS_SCHEMA_VERSION) {
    throw new Error("READER_ACCEPTED_FACTS_INVALID: schemaVersion");
  }
  if (!isNonEmptyString(record.studyRunId)) {
    throw new Error("READER_ACCEPTED_FACTS_INVALID: studyRunId");
  }
  if (!isNonEmptyString(record.attemptId)) {
    throw new Error("READER_ACCEPTED_FACTS_INVALID: attemptId");
  }
  if (!isNonEmptyString(record.caseId)) {
    throw new Error("READER_ACCEPTED_FACTS_INVALID: caseId");
  }
  const architecture = record.readerArchitectureVariant;
  if (architecture !== null && !isNonEmptyString(architecture)) {
    throw new Error("READER_ACCEPTED_FACTS_INVALID: readerArchitectureVariant");
  }
  if (!isNonEmptyString(record.promptSha256) || !/^[a-f0-9]{64}$/.test(record.promptSha256)) {
    throw new Error("READER_ACCEPTED_FACTS_INVALID: promptSha256");
  }
  if (!isNonEmptyString(record.createdAt)) {
    throw new Error("READER_ACCEPTED_FACTS_INVALID: createdAt");
  }
  if (!Array.isArray(record.facts)) {
    throw new Error("READER_ACCEPTED_FACTS_INVALID: facts");
  }
  const facts: Record<string, unknown>[] = [];
  for (const item of record.facts) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("READER_ACCEPTED_FACTS_INVALID: fact entry");
    }
    facts.push(item as Record<string, unknown>);
  }
  return {
    schemaVersion: READER_ACCEPTED_FACTS_SCHEMA_VERSION,
    studyRunId: record.studyRunId,
    attemptId: record.attemptId,
    caseId: record.caseId,
    readerArchitectureVariant: architecture,
    promptSha256: record.promptSha256,
    createdAt: record.createdAt,
    facts,
  };
}

export function buildReaderAcceptedFactsArtifact(input: {
  studyRunId: string;
  attemptId: string;
  caseId: string;
  readerArchitectureVariant: string | null;
  promptSha256: string;
  createdAt: string;
  facts: unknown[];
}): ReaderAcceptedFactsArtifact {
  return parseReaderAcceptedFactsArtifact({
    schemaVersion: READER_ACCEPTED_FACTS_SCHEMA_VERSION,
    studyRunId: input.studyRunId,
    attemptId: input.attemptId,
    caseId: input.caseId,
    readerArchitectureVariant: input.readerArchitectureVariant,
    promptSha256: input.promptSha256,
    createdAt: input.createdAt,
    facts: input.facts,
  });
}