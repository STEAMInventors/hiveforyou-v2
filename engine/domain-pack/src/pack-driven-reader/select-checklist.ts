import {
  UNCLASSIFIED_DOCUMENT_TYPE_SENTINEL,
} from "./constants.js";
import type { ProposalDomainPack, ProposalDocumentType, SelectedRecordDefinition } from "./types.js";

export class PackDrivenReaderDocumentTypeError extends Error {
  constructor(
    message: string,
    readonly code: "UNKNOWN_DOCUMENT_TYPE" | "UNCLASSIFIED_NOT_ALLOWED",
  ) {
    super(message);
    this.name = "PackDrivenReaderDocumentTypeError";
  }
}

export function intersectAllDocumentChecklists(pack: ProposalDomainPack): string[] {
  const lists = pack.documentTypes.map((d) => d.checklist);
  if (lists.length === 0) return [];
  let acc = new Set(lists[0]);
  for (const list of lists.slice(1)) {
    const next = new Set(list);
    acc = new Set([...acc].filter((id) => next.has(id)));
  }
  return [...acc].sort();
}

export function resolveGenericUnclassifiedChecklist(pack: ProposalDomainPack): string[] {
  if (pack.genericUnclassifiedChecklist?.length) {
    return [...pack.genericUnclassifiedChecklist];
  }
  const intersection = intersectAllDocumentChecklists(pack);
  if (intersection.length > 0) return intersection;
  return ["document_header"];
}

export type ResolvedDocumentTypeSpec = {
  documentType: ProposalDocumentType | null;
  documentTypeId: string;
  resolution: "classified" | "generic_fallback" | "explicit_unclassified";
  checklistRecordTypeIds: string[];
  checklistPolicy: string;
};

export function resolveDocumentTypeSpec(input: {
  pack: ProposalDomainPack;
  documentTypeId: string | null;
  allowGenericUnclassifiedFallback: boolean;
}): ResolvedDocumentTypeSpec {
  const { pack, documentTypeId, allowGenericUnclassifiedFallback } = input;

  if (
    documentTypeId === null ||
    documentTypeId === UNCLASSIFIED_DOCUMENT_TYPE_SENTINEL ||
    documentTypeId === "unknown"
  ) {
    if (!allowGenericUnclassifiedFallback) {
      throw new PackDrivenReaderDocumentTypeError(
        "Unclassified document reading requires allowGenericUnclassifiedFallback",
        "UNCLASSIFIED_NOT_ALLOWED",
      );
    }
    return {
      documentType: null,
      documentTypeId: UNCLASSIFIED_DOCUMENT_TYPE_SENTINEL,
      resolution: "explicit_unclassified",
      checklistRecordTypeIds: resolveGenericUnclassifiedChecklist(pack),
      checklistPolicy:
        "look_for_all_listed; never_invent_if_absent; extract_other_pack_records_if_found",
    };
  }

  const found = pack.documentTypes.find((d) => d.id === documentTypeId);
  if (found) {
    return {
      documentType: found,
      documentTypeId: found.id,
      resolution: "classified",
      checklistRecordTypeIds: [...found.checklist],
      checklistPolicy:
        found.checklistPolicy ??
        "look_for_all_listed; never_invent_if_absent; extract_other_pack_records_if_found",
    };
  }

  if (!allowGenericUnclassifiedFallback) {
    throw new PackDrivenReaderDocumentTypeError(
      `Unknown documentTypeId '${documentTypeId}'`,
      "UNKNOWN_DOCUMENT_TYPE",
    );
  }

  return {
    documentType: null,
    documentTypeId: UNCLASSIFIED_DOCUMENT_TYPE_SENTINEL,
    resolution: "generic_fallback",
    checklistRecordTypeIds: resolveGenericUnclassifiedChecklist(pack),
    checklistPolicy:
      "look_for_all_listed; never_invent_if_absent; extract_other_pack_records_if_found",
  };
}

export function selectRecordDefinitions(
  pack: ProposalDomainPack,
  checklistRecordTypeIds: string[],
): SelectedRecordDefinition[] {
  const byId = new Map(pack.recordTypes.map((r) => [r.id, r]));
  return checklistRecordTypeIds.map((id) => {
    const r = byId.get(id);
    if (!r) throw new Error(`checklist record ${id} missing from recordTypes`);
    return {
      recordTypeId: r.id,
      label: r.label,
      repeatable: r.repeatable ?? false,
      identity: r.identity,
      fields: r.fields.map((f) => ({ ...f })),
      usesConstructs: r.usesConstructs,
    };
  });
}
