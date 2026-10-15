import type { StudyRawExtractionOutcome } from "@hiveforyou/core";
import { isStudyRunProcessing } from "@hiveforyou/shared/canonical-study";
import type { StudyRunStatus } from "@hiveforyou/shared/canonical-study";
import type { RawExtractionInspectorDocument } from "@hiveforyou/core";

export type CustomerDocumentUiStatus = "waiting" | "read" | "failed" | "needs_review";

export type CustomerProvenanceSnippet = {
  text: string;
  chipLabel: string;
};

export type CustomerExtractionDocumentRow = {
  sourceDocumentId: string;
  label: string;
  dateLabel: string | null;
  uiStatus: CustomerDocumentUiStatus;
  detailCount: number | null;
  provenance: CustomerProvenanceSnippet | null;
};

const FIRST_NAME_FIELD_KEYS = [
  "firstName",
  "studentFirstName",
  "childFirstName",
  "givenName",
  "studentName",
] as const;

export function formatCustomerDocumentDate(iso: string | undefined | null): string | null {
  if (!iso?.trim()) {
    return null;
  }
  const trimmed = iso.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const date = new Date(`${trimmed.slice(0, 10)}T12:00:00`);
    if (Number.isNaN(date.getTime())) {
      return trimmed.slice(0, 10);
    }
    return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  }
  return trimmed;
}

export function resolveReliableSubjectFirstName(
  documents: readonly RawExtractionInspectorDocument[],
): string | null {
  const names = new Set<string>();
  for (const doc of documents) {
    if (doc.displayStatus !== "SUCCEEDED") {
      continue;
    }
    for (const record of doc.records) {
      for (const key of FIRST_NAME_FIELD_KEYS) {
        const field = record.fields[key];
        const value = field?.value;
        if (typeof value === "string" && value.trim().length > 0) {
          const token = value.trim().split(/\s+/)[0];
          if (token) {
            names.add(token);
          }
        }
      }
    }
    if (!doc.envelope?.parsedModelJson) {
      continue;
    }
    const instances = doc.envelope.parsedModelJson.recordInstances;
    if (!Array.isArray(instances)) {
      continue;
    }
    for (const instance of instances) {
      if (!instance || typeof instance !== "object" || Array.isArray(instance)) {
        continue;
      }
      const fields = (instance as Record<string, unknown>).fields;
      if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
        continue;
      }
      for (const key of FIRST_NAME_FIELD_KEYS) {
        const slot = (fields as Record<string, unknown>)[key];
        if (!slot || typeof slot !== "object" || Array.isArray(slot)) {
          continue;
        }
        const value = (slot as Record<string, unknown>).value;
        if (typeof value === "string" && value.trim().length > 0) {
          const token = value.trim().split(/\s+/)[0];
          if (token) {
            names.add(token);
          }
        }
      }
    }
  }
  if (names.size !== 1) {
    return null;
  }
  return [...names][0] ?? null;
}

function pickProvenance(
  doc: RawExtractionInspectorDocument,
  label: string,
): CustomerProvenanceSnippet | null {
  for (const record of doc.records) {
    for (const field of Object.values(record.fields)) {
      const quote = field.evidence?.quote?.trim();
      const page = field.evidence?.page;
      if (!quote) {
        continue;
      }
      const chipLabel =
        page != null && Number.isFinite(page) ? `${label} · p.${page}` : label;
      return { text: quote, chipLabel };
    }
  }
  return null;
}

export function mapInspectorDocumentToCustomerRow(input: {
  doc: RawExtractionInspectorDocument;
  studyRunStatus: StudyRunStatus;
  rawExtractionOutcome: StudyRawExtractionOutcome | null;
  failedDocumentIds: readonly string[];
  succeededDocumentIds: readonly string[];
  documentDateBySourceId: ReadonlyMap<string, string | undefined>;
}): CustomerExtractionDocumentRow {
  const label =
    input.doc.customerLabel?.trim() ||
    input.doc.modelDocumentClassification?.trim() ||
    "Document";
  const dateLabel = formatCustomerDocumentDate(
    input.documentDateBySourceId.get(input.doc.sourceDocumentId),
  );

  let uiStatus: CustomerDocumentUiStatus = "waiting";
  const display = input.doc.displayStatus;

  if (display === "SUCCEEDED") {
    uiStatus = "read";
  } else if (display === "MODEL_ERROR") {
    uiStatus = "failed";
  } else if (display === "INVALID_JSON") {
    uiStatus = "needs_review";
  } else if (input.failedDocumentIds.includes(input.doc.sourceDocumentId)) {
    uiStatus = "failed";
  } else if (
    input.succeededDocumentIds.includes(input.doc.sourceDocumentId) 
  ) {
    uiStatus = "read";
  } else if (isStudyRunProcessing(input.studyRunStatus)) {
    uiStatus = "waiting";
  } else if (input.rawExtractionOutcome === "failed") {
    uiStatus = "failed";
  } else if (input.rawExtractionOutcome === "partial_failure") {
    uiStatus = "failed";
  }

  const detailCount =
    uiStatus === "read" && input.doc.records.length > 0 ? input.doc.records.length : null;

  const provenance =
    uiStatus === "read" ? pickProvenance(input.doc, label) : null;

  return {
    sourceDocumentId: input.doc.sourceDocumentId,
    label,
    dateLabel,
    uiStatus,
    detailCount,
    provenance,
  };
}

export function isPackDrivenExtractionExploreReady(
  outcome: StudyRawExtractionOutcome | null | undefined,
): boolean {
  return outcome === "succeeded";
}

export function customerStatusLabel(status: CustomerDocumentUiStatus): string {
  switch (status) {
    case "read":
      return "Read";
    case "failed":
      return "Failed";
    case "needs_review":
      return "Needs review";
    default:
      return "Waiting";
  }
}
