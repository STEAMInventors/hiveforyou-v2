import {
  PACK_DRIVEN_CLASSIFICATION_AMBIGUOUS,
  PACK_DRIVEN_CLASSIFICATION_UNKNOWN,
} from "@hiveforyou/domain-pack";

export type PackDrivenReaderPerDocumentWire = {
  sourceDocumentId?: unknown;
  documentTypeId?: unknown;
  classificationNeedsReview?: unknown;
  parseOk?: unknown;
  parseErrors?: unknown;
  executionError?: unknown;
};

export type PackDrivenReaderDocumentOutcomeEvaluation =
  | { kind: "ok" }
  | {
      kind: "needs_review";
      code: "PACK_DRIVEN_READER_CLASSIFICATION_NEEDS_REVIEW";
      affectedDocumentIds: string[];
    }
  | {
      kind: "failed";
      code: "PACK_DRIVEN_READER_DOCUMENT_FAILED";
      affectedDocumentIds: string[];
    };

function asRecord(value: unknown): PackDrivenReaderPerDocumentWire | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as PackDrivenReaderPerDocumentWire;
}

function sourceDocumentId(row: PackDrivenReaderPerDocumentWire): string | null {
  const id = row.sourceDocumentId;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function isClassificationReview(row: PackDrivenReaderPerDocumentWire): boolean {
  if (row.classificationNeedsReview === true) {
    return true;
  }
  const typeId = row.documentTypeId;
  if (typeof typeId !== "string") {
    return false;
  }
  const normalized = typeId.trim().toUpperCase();
  return (
    normalized === PACK_DRIVEN_CLASSIFICATION_UNKNOWN ||
    normalized === PACK_DRIVEN_CLASSIFICATION_AMBIGUOUS
  );
}

function isExecutionFailure(row: PackDrivenReaderPerDocumentWire): boolean {
  const executionError = row.executionError;
  if (typeof executionError === "string" && executionError.trim()) {
    return true;
  }
  if (row.parseOk === false) {
    return true;
  }
  const parseErrors = row.parseErrors;
  if (Array.isArray(parseErrors) && parseErrors.length > 0) {
    return true;
  }
  return false;
}

export function evaluatePackDrivenReaderDocumentOutcomes(input: {
  expectedSourceDocumentIds: ReadonlyArray<string>;
  perDocumentResults: unknown[] | null | undefined;
}): PackDrivenReaderDocumentOutcomeEvaluation {
  const expected = [...new Set(input.expectedSourceDocumentIds.map((id) => id.trim()).filter(Boolean))];
  const rows = (input.perDocumentResults ?? [])
    .map(asRecord)
    .filter((row): row is PackDrivenReaderPerDocumentWire => row != null);

  const byId = new Map<string, PackDrivenReaderPerDocumentWire>();
  for (const row of rows) {
    const id = sourceDocumentId(row);
    if (id) {
      byId.set(id, row);
    }
  }

  const missingDocumentIds = expected.filter((id) => !byId.has(id));
  if (missingDocumentIds.length > 0) {
    return {
      kind: "failed",
      code: "PACK_DRIVEN_READER_DOCUMENT_FAILED",
      affectedDocumentIds: missingDocumentIds,
    };
  }

  const failedDocumentIds: string[] = [];
  const reviewDocumentIds: string[] = [];

  for (const id of expected) {
    const row = byId.get(id)!;
    if (isExecutionFailure(row)) {
      failedDocumentIds.push(id);
      continue;
    }
    if (isClassificationReview(row)) {
      reviewDocumentIds.push(id);
    }
  }

  if (failedDocumentIds.length > 0) {
    return {
      kind: "failed",
      code: "PACK_DRIVEN_READER_DOCUMENT_FAILED",
      affectedDocumentIds: failedDocumentIds,
    };
  }

  if (reviewDocumentIds.length > 0) {
    return {
      kind: "needs_review",
      code: "PACK_DRIVEN_READER_CLASSIFICATION_NEEDS_REVIEW",
      affectedDocumentIds: reviewDocumentIds,
    };
  }

  return { kind: "ok" };
}

export class PackDrivenReaderProductionError extends Error {
  readonly errorCode: string;
  readonly affectedDocumentIds: readonly string[];

  constructor(input: {
    errorCode: string;
    message: string;
    affectedDocumentIds: readonly string[];
  }) {
    super(input.message);
    this.name = "PackDrivenReaderProductionError";
    this.errorCode = input.errorCode;
    this.affectedDocumentIds = input.affectedDocumentIds;
  }
}

export class PackDrivenReaderNeedsReviewError extends PackDrivenReaderProductionError {
  constructor(affectedDocumentIds: readonly string[]) {
    super({
      errorCode: "PACK_DRIVEN_READER_CLASSIFICATION_NEEDS_REVIEW",
      message: `Pack-driven Reader classification requires review for documents: ${affectedDocumentIds.join(", ")}`,
      affectedDocumentIds,
    });
    this.name = "PackDrivenReaderNeedsReviewError";
  }
}
