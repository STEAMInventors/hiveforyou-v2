import type { DomainPack } from "@hiveforyou/domain-pack";

export type PackSlot = {
  id: string;
  label: string;
  sourceDocTypes: readonly string[];
};

const SLOT_LABEL_OVERRIDES: Record<string, string> = {
  "student.firstName": "Student first name",
  "prior.year": "Prior plan year",
  "prior.eligibility.category": "Prior eligibility category",
  "prior.eligibility.primaryNeed": "Prior main area of need",
  "prior.goal.baseline": "Prior goal baseline",
  "prior.goal.target": "Prior goal target",
  "current.year": "Current plan year",
  "current.eligibility.primaryNeed": "Current main area of need",
  "reeval.latest.date": "Latest reevaluation date",
  "reeval.latest.season": "Reevaluation season",
  "reeval.summary": "Reevaluation summary",
  "gap.start": "Gap start",
  "gap.end": "Gap end",
  "goals.diffClause": "Goals change summary",
  "signal.top.question": "Top question to ask",
};

function inferSourceDocTypes(slotId: string, anchorDocType: string): string[] {
  if (slotId.startsWith("prior.")) {
    return [anchorDocType];
  }
  if (slotId.startsWith("current.")) {
    return [anchorDocType];
  }
  if (slotId.startsWith("reeval.")) {
    return [];
  }
  if (slotId.startsWith("gap.") || slotId.startsWith("series.")) {
    return [];
  }
  if (slotId.startsWith("student.")) {
    return [];
  }
  if (slotId.startsWith("goals.") || slotId.startsWith("signal.")) {
    return [anchorDocType];
  }
  return [];
}

export function listPackDocumentTypes(pack: DomainPack): string[] {
  const fromDiscover = pack.discover?.documentTypes ?? [];
  const anchor = pack.story?.anchorDocType;
  const merged = new Set(fromDiscover);
  if (anchor) {
    merged.add(anchor);
  }
  return [...merged];
}

export function listPackSlots(pack: DomainPack): PackSlot[] {
  const anchor = pack.story?.anchorDocType ?? "Document";
  const slotIds = new Set<string>();
  for (const template of pack.narrative.templates) {
    for (const slot of template.slots) {
      slotIds.add(slot);
    }
  }
  for (const slot of Object.keys(pack.story.plainLabels)) {
    slotIds.add(slot);
  }
  const catalog = pack.rulebookSlotCatalog ?? [];
  for (const entry of catalog) {
    slotIds.add(entry.id);
  }
  const catalogById = new Map(catalog.map((e) => [e.id, e]));
  return [...slotIds].sort().map((id) => ({
    id,
    label: catalogById.get(id)?.label ?? SLOT_LABEL_OVERRIDES[id] ?? id,
    sourceDocTypes:
      catalogById.get(id)?.sourceDocTypes ?? inferSourceDocTypes(id, anchor),
  }));
}

export type PackAuditReadiness =
  | { ok: true; documentTypes: string[]; slots: PackSlot[] }
  | { ok: false; domainId: string; missing: ("documentTypes" | "slots")[] };

export function checkPackAuditReadiness(pack: DomainPack): PackAuditReadiness {
  const documentTypes = listPackDocumentTypes(pack);
  const slots = listPackSlots(pack);
  const missing: ("documentTypes" | "slots")[] = [];
  if (documentTypes.length === 0) {
    missing.push("documentTypes");
  }
  if (slots.length === 0) {
    missing.push("slots");
  }
  if (missing.length > 0) {
    return { ok: false, domainId: pack.manifest.id, missing };
  }
  return { ok: true, documentTypes, slots };
}
