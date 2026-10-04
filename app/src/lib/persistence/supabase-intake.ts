import type {
  DocumentExtractionRecord,
  DocumentExtractionRepository,
  DocumentIdentityRecord,
  DocumentIdentityRepository,
  DocumentNormalizedExtractionRecord,
  DocumentNormalizedExtractionRepository,
  ExtractionBoundingBox,
  IntakeRunRecord,
  IntakeRunRepository,
} from "@hiveforyou/intake";
import type {
  DocumentIdentityType,
  IntakeDocumentStatus,
  IntakeRunStatus,
  NormalizedDocumentExtraction,
} from "@hiveforyou/shared/intake";
import { withSessionOwner } from "@hiveforyou/core";

import type { HiveGateway, HiveRow } from "./hive-gateway";

function text(row: HiveRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new Error(`Expected ${key} to be text.`);
  }
  return value;
}

function nullableText(row: HiveRow, key: string): string | null {
  const value = row[key];
  if (value == null) {
    return null;
  }
  return String(value);
}

function nullableNumber(row: HiveRow, key: string): number | null {
  const value = row[key];
  if (value == null || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boundingBoxes(value: unknown): ExtractionBoundingBox[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const boxes: ExtractionBoundingBox[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      return null;
    }
    const box = entry as Record<string, unknown>;
    const x = Number(box.x);
    const y = Number(box.y);
    const width = Number(box.width);
    const height = Number(box.height);
    if (![x, y, width, height].every((coordinate) => Number.isFinite(coordinate))) {
      return null;
    }
    boxes.push({ x, y, width, height });
  }
  return boxes;
}

function mapRun(row: HiveRow): IntakeRunRecord {
  return {
    id: text(row, "id"),
    caseId: text(row, "case_id"),
    userId: text(row, "user_id"),
    idempotencyKey: text(row, "idempotency_key"),
    status: text(row, "status") as IntakeRunStatus,
    classifier: (nullableText(row, "classifier") ?? "LOCAL") as IntakeRunRecord["classifier"],
    classifierVersion: nullableText(row, "classifier_version"),
    startedAt: text(row, "started_at"),
    completedAt: nullableText(row, "completed_at"),
    errorCode: nullableText(row, "error_code"),
    rawIntent: nullableText(row, "raw_intent"),
    explicitDomainId: nullableText(row, "explicit_domain_id"),
    jevDomainProposal: nullableText(row, "jev_domain_proposal"),
    jevDomainConfidence: nullableNumber(row, "jev_domain_confidence"),
    resolvedDomainId: nullableText(row, "resolved_domain_id"),
    resolutionSource: nullableText(row, "resolution_source") as IntakeRunRecord["resolutionSource"],
    studyPath: nullableText(row, "study_path") as IntakeRunRecord["studyPath"],
    packExecutionJson:
      row.pack_execution == null ? null : JSON.stringify(row.pack_execution),
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
  };
}

function mapIdentity(row: HiveRow): DocumentIdentityRecord {
  return {
    id: text(row, "id"),
    intakeRunId: text(row, "intake_run_id"),
    sourceDocumentId: text(row, "source_document_id"),
    userId: text(row, "user_id"),
    caseId: text(row, "case_id"),
    processingStatus: text(row, "processing_status") as IntakeDocumentStatus,
    proposedType: nullableText(row, "proposed_type") as DocumentIdentityType | null,
    confidence: nullableNumber(row, "confidence"),
    proposedBy: nullableText(row, "proposed_by"),
    classifierVersion: nullableText(row, "classifier_version"),
    returnedModel: nullableText(row, "returned_model"),
    classifiedAt: nullableText(row, "classified_at"),
    errorCode: nullableText(row, "error_code"),
    analysisDisposition:
      nullableText(row, "analysis_disposition") === "DISCARDED" ? "DISCARDED" : "PRESENT",
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
  };
}

function mapExtraction(row: HiveRow): DocumentExtractionRecord {
  return {
    id: text(row, "id"),
    userId: text(row, "user_id"),
    sourceDocumentId: text(row, "source_document_id"),
    pageNumber: Number(row.page_number),
    extractionMethod: text(row, "extraction_method"),
    sourceHash: text(row, "source_hash"),
    pageText: text(row, "page_text"),
    boundingBoxes: boundingBoxes(row.bounding_boxes),
    createdAt: text(row, "created_at"),
  };
}

function normalizedExtraction(value: unknown): NormalizedDocumentExtraction {
  if (!value || typeof value !== "object") {
    throw new Error("Expected normalized_extraction to be a JSON object.");
  }
  return value as NormalizedDocumentExtraction;
}

function mapNormalizedExtraction(row: HiveRow): DocumentNormalizedExtractionRecord {
  return {
    id: text(row, "id"),
    userId: text(row, "user_id"),
    sourceDocumentId: text(row, "source_document_id"),
    sourceHash: text(row, "source_hash"),
    schemaVersion: text(row, "schema_version"),
    normalizedExtraction: normalizedExtraction(row.normalized_extraction),
    createdAt: text(row, "created_at"),
  };
}

export class SupabaseIntakeRepository
  implements
    IntakeRunRepository,
    DocumentIdentityRepository,
    DocumentExtractionRepository,
    DocumentNormalizedExtractionRepository
{
  constructor(
    private readonly gateway: HiveGateway,
    private readonly userId: string,
  ) {}

  async insert(record: IntakeRunRecord | DocumentIdentityRecord): Promise<void> {
    if ("idempotencyKey" in record) {
      await this.gateway.insert(
        "intake_runs",
        withSessionOwner(this.userId, {
          id: record.id,
          case_id: record.caseId,
          user_id: record.userId,
          idempotency_key: record.idempotencyKey,
          status: record.status,
          classifier: record.classifier,
          classifier_version: record.classifierVersion,
          started_at: record.startedAt,
          completed_at: record.completedAt,
          error_code: record.errorCode,
          raw_intent: record.rawIntent,
          explicit_domain_id: record.explicitDomainId,
          jev_domain_proposal: record.jevDomainProposal,
          jev_domain_confidence: record.jevDomainConfidence,
          resolved_domain_id: record.resolvedDomainId,
          resolution_source: record.resolutionSource,
          study_path: record.studyPath,
          pack_execution: record.packExecutionJson
            ? JSON.parse(record.packExecutionJson)
            : null,
          created_at: record.createdAt,
          updated_at: record.updatedAt,
        }),
      );
      return;
    }
    await this.gateway.insert(
      "document_identities",
      withSessionOwner(this.userId, {
        id: record.id,
        intake_run_id: record.intakeRunId,
        source_document_id: record.sourceDocumentId,
        user_id: record.userId,
        case_id: record.caseId,
        processing_status: record.processingStatus,
        proposed_type: record.proposedType,
        confidence: record.confidence,
        proposed_by: record.proposedBy,
        classifier_version: record.classifierVersion,
        returned_model: record.returnedModel,
        classified_at: record.classifiedAt,
        error_code: record.errorCode,
        analysis_disposition: record.analysisDisposition,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      }),
    );
  }

  async getById(userId: string, id: string): Promise<IntakeRunRecord | null> {
    if (userId !== this.userId) {
      return null;
    }
    const rows = await this.gateway.selectWhere(
      "intake_runs",
      { id, user_id: this.userId },
      { limit: 1 },
    );
    return rows[0] ? mapRun(rows[0]) : null;
  }

  async getByIdempotencyKey(
    userId: string,
    caseId: string,
    idempotencyKey: string,
  ): Promise<IntakeRunRecord | null> {
    if (userId !== this.userId) {
      return null;
    }
    const rows = await this.gateway.selectWhere(
      "intake_runs",
      { user_id: this.userId, case_id: caseId, idempotency_key: idempotencyKey },
      { limit: 1 },
    );
    return rows[0] ? mapRun(rows[0]) : null;
  }

  async save(record: IntakeRunRecord | DocumentIdentityRecord): Promise<void> {
    if ("idempotencyKey" in record) {
      await this.gateway.updateWhere(
        "intake_runs",
        {
          status: record.status,
          completed_at: record.completedAt,
          error_code: record.errorCode,
          classifier_version: record.classifierVersion,
          raw_intent: record.rawIntent,
          explicit_domain_id: record.explicitDomainId,
          jev_domain_proposal: record.jevDomainProposal,
          jev_domain_confidence: record.jevDomainConfidence,
          resolved_domain_id: record.resolvedDomainId,
          resolution_source: record.resolutionSource,
          study_path: record.studyPath,
          pack_execution: record.packExecutionJson
            ? JSON.parse(record.packExecutionJson)
            : null,
          updated_at: record.updatedAt,
        },
        { id: record.id, user_id: this.userId },
      );
      return;
    }
    await this.gateway.updateWhere(
      "document_identities",
      {
        processing_status: record.processingStatus,
        proposed_type: record.proposedType,
        confidence: record.confidence,
        proposed_by: record.proposedBy,
        classifier_version: record.classifierVersion,
        returned_model: record.returnedModel,
        classified_at: record.classifiedAt,
        error_code: record.errorCode,
        analysis_disposition: record.analysisDisposition,
        updated_at: record.updatedAt,
      },
      { id: record.id, user_id: this.userId },
    );
  }

  async listByRun(userId: string, intakeRunId: string): Promise<DocumentIdentityRecord[]> {
    if (userId !== this.userId) {
      return [];
    }
    const rows = await this.gateway.selectWhere(
      "document_identities",
      { user_id: this.userId, intake_run_id: intakeRunId },
      { orderBy: "created_at", ascending: true },
    );
    return rows.map(mapIdentity);
  }

  async upsertPages(pages: DocumentExtractionRecord[]): Promise<void> {
    for (const page of pages) {
      const existing = await this.gateway.selectWhere(
        "document_extractions",
        {
          user_id: this.userId,
          source_document_id: page.sourceDocumentId,
          page_number: page.pageNumber,
          extraction_method: page.extractionMethod,
          source_hash: page.sourceHash,
        },
        { limit: 1 },
      );
      if (existing[0]) {
        continue;
      }
      await this.gateway.insert(
        "document_extractions",
        withSessionOwner(this.userId, {
          id: page.id,
          user_id: page.userId,
          source_document_id: page.sourceDocumentId,
          page_number: page.pageNumber,
          extraction_method: page.extractionMethod,
          source_hash: page.sourceHash,
          page_text: page.pageText,
          bounding_boxes: page.boundingBoxes,
          created_at: page.createdAt,
        }),
      );
    }
  }

  async upsert(record: DocumentNormalizedExtractionRecord): Promise<void> {
    const existing = await this.gateway.selectWhere(
      "document_normalized_extractions",
      {
        user_id: this.userId,
        source_document_id: record.sourceDocumentId,
        source_hash: record.sourceHash,
      },
      { limit: 1 },
    );
    if (existing[0]) {
      return;
    }
    await this.gateway.insert(
      "document_normalized_extractions",
      withSessionOwner(this.userId, {
        id: record.id,
        user_id: record.userId,
        source_document_id: record.sourceDocumentId,
        source_hash: record.sourceHash,
        schema_version: record.schemaVersion,
        normalized_extraction: record.normalizedExtraction,
        created_at: record.createdAt,
      }),
    );
  }

  async getBySourceHash(
    userId: string,
    sourceDocumentId: string,
    sourceHash: string,
  ): Promise<DocumentNormalizedExtractionRecord | null> {
    if (userId !== this.userId) {
      return null;
    }
    const rows = await this.gateway.selectWhere(
      "document_normalized_extractions",
      {
        user_id: this.userId,
        source_document_id: sourceDocumentId,
        source_hash: sourceHash,
      },
      { limit: 1 },
    );
    return rows[0] ? mapNormalizedExtraction(rows[0]) : null;
  }

  async listBySourceHash(
    userId: string,
    sourceDocumentId: string,
    sourceHash: string,
    extractionMethod: string,
  ): Promise<DocumentExtractionRecord[]> {
    if (userId !== this.userId) {
      return [];
    }
    const rows = await this.gateway.selectWhere(
      "document_extractions",
      {
        user_id: this.userId,
        source_document_id: sourceDocumentId,
        source_hash: sourceHash,
        extraction_method: extractionMethod,
      },
      { orderBy: "page_number", ascending: true },
    );
    return rows.map(mapExtraction);
  }
}
