import type { RawExtractionInspectorDocument } from "@hiveforyou/core";

export type IntakeSourceDocumentInventoryRow = {
  sourceDocumentId: string;
  filename: string;
};

export function dedupeSourceDocumentIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function mergeIntakeIntoFallbackSourceDocumentIds(
  studyContextSourceDocumentIds: readonly string[],
  intakeInventory: readonly IntakeSourceDocumentInventoryRow[],
): string[] {
  return dedupeSourceDocumentIds([
    ...studyContextSourceDocumentIds,
    ...intakeInventory.map((row) => row.sourceDocumentId),
  ]);
}

export function intakeFilenameBySourceId(
  intakeInventory: readonly IntakeSourceDocumentInventoryRow[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of intakeInventory) {
    const id = row.sourceDocumentId.trim();
    const filename = row.filename.trim();
    if (id && filename) {
      map.set(id, filename);
    }
  }
  return map;
}

function syntheticInspectorDocument(
  sourceDocumentId: string,
  customerLabel: string | null,
): RawExtractionInspectorDocument {
  return {
    sourceDocumentId,
    logicalDocumentId: null,
    sequenceOrder: null,
    customerLabel,
    displayStatus: "MISSING_OUTPUT",
    envelope: null,
    modelDocumentClassification: null,
    parseDiagnostics: ["No persisted envelope for this logical document."],
    records: [],
    evidenceRefs: [],
  };
}

/** Merge persisted Reader rows with intake upload inventory (stable sourceDocumentId, no duplicates). */
export function mergeInspectorDocumentsWithIntakeInventory(input: {
  inspectorDocuments: readonly RawExtractionInspectorDocument[];
  intakeInventory: readonly IntakeSourceDocumentInventoryRow[];
  orderedSourceDocumentIds: readonly string[];
}): RawExtractionInspectorDocument[] {
  const filenames = intakeFilenameBySourceId(input.intakeInventory);
  const bySource = new Map(
    input.inspectorDocuments.map((doc) => [doc.sourceDocumentId, doc] as const),
  );

  const orderedIds = dedupeSourceDocumentIds([
    ...input.orderedSourceDocumentIds,
    ...input.intakeInventory.map((row) => row.sourceDocumentId),
  ]);

  return orderedIds.map((sourceDocumentId) => {
    const existing = bySource.get(sourceDocumentId);
    const intakeLabel = filenames.get(sourceDocumentId) ?? null;
    if (existing) {
      if (existing.customerLabel?.trim()) {
        return existing;
      }
      if (intakeLabel) {
        return { ...existing, customerLabel: intakeLabel };
      }
      return existing;
    }
    return syntheticInspectorDocument(sourceDocumentId, intakeLabel);
  });
}
