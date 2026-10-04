import type { HandlingKind } from "../engine/domain-packs/_shared/rulebook/schema.ts";

export type DocSignals = {
  docType: string;
  slotCount: number;
  isAnchor: boolean;
  hasDates: boolean;
  hasDeadlineSlots: boolean;
  hasCodedValues: boolean;
  alreadyHasGuide: boolean;
};

export type ModelDecision = {
  docType: string;
  kind: HandlingKind;
  reason: string;
  proposedSections: {
    id: string;
    parentTitle: string;
    docTitle: string;
    slots: string[];
  }[];
  termsNeeded: { word: string; abbr: string | null }[];
};

export type FinalDecision = ModelDecision & {
  existing: boolean;
  overridden: boolean;
};

export type AuditPlan = {
  domain: string;
  generatedAt: string;
  model: string;
  status: "ok" | "model-failed";
  summary: Record<HandlingKind, number>;
  decisions: FinalDecision[];
  errors: string[];
};

const KINDS: HandlingKind[] = [
  "document-guide",
  "notice-guide",
  "glossary-only",
  "none",
];

export function emptySummary(): Record<HandlingKind, number> {
  return {
    "document-guide": 0,
    "notice-guide": 0,
    "glossary-only": 0,
    none: 0,
  };
}

export function signalOnlyDecisions(
  documentTypes: string[],
  signalsByDoc: Map<string, DocSignals>,
  existingGuideKinds: Map<string, HandlingKind> = new Map(),
): FinalDecision[] {
  return documentTypes.map((docType) => {
    const signals = signalsByDoc.get(docType)!;
    let kind: HandlingKind = "none";
    if (signals.alreadyHasGuide) {
      kind = existingGuideKinds.get(docType) ?? (signals.isAnchor ? "document-guide" : "notice-guide");
    } else if (signals.isAnchor) {
      kind = "document-guide";
    } else if (signals.hasDeadlineSlots) {
      kind = "notice-guide";
    }
    return {
      docType,
      kind,
      reason: "signal-only fallback",
      proposedSections: [],
      termsNeeded: [],
      existing: signals.alreadyHasGuide,
      overridden: false,
    };
  });
}

export function decideFromModel(input: {
  domain: string;
  documentTypes: string[];
  slotIds: Set<string>;
  signalsByDoc: Map<string, DocSignals>;
  existingGuideKinds: Map<string, HandlingKind>;
  modelDecisions: ModelDecision[];
}): { decisions: FinalDecision[]; errors: string[] } {
  const errors: string[] = [];
  const byDoc = new Map<string, ModelDecision>();

  for (const decision of input.modelDecisions) {
    if (!input.documentTypes.includes(decision.docType)) {
      errors.push(`model invented docType '${decision.docType}'`);
      continue;
    }
    for (const section of decision.proposedSections) {
      for (const slot of section.slots) {
        if (!input.slotIds.has(slot)) {
          errors.push(`model invented slot '${slot}' for docType '${decision.docType}'`);
        }
      }
    }
    if (!byDoc.has(decision.docType)) {
      byDoc.set(decision.docType, decision);
    }
  }

  const final: FinalDecision[] = [];
  for (const docType of input.documentTypes) {
    const signals = input.signalsByDoc.get(docType)!;
    const model = byDoc.get(docType);
    let kind: HandlingKind = model?.kind ?? "none";
    let reason = model?.reason ?? "no model decision";
    let proposedSections = model?.proposedSections ?? [];
    let termsNeeded = model?.termsNeeded ?? [];
    let existing = false;
    let overridden = false;

    if (signals.slotCount === 0) {
      kind = "none";
      reason = "no slots sourced from this document type";
    } else if (signals.alreadyHasGuide) {
      kind = input.existingGuideKinds.get(docType) ?? kind;
      reason = model?.reason ?? "existing guide in rulebook";
      existing = true;
    } else if (signals.hasDeadlineSlots && !signals.isAnchor && kind === "none") {
      kind = "notice-guide";
      reason = "deadline slots present (code override)";
      overridden = true;
    }

    final.push({
      docType,
      kind,
      reason,
      proposedSections,
      termsNeeded,
      existing,
      overridden,
    });
  }

  return { decisions: final, errors };
}

export function summarizeDecisions(decisions: FinalDecision[]): Record<HandlingKind, number> {
  const summary = emptySummary();
  for (const d of decisions) {
    summary[d.kind] += 1;
  }
  return summary;
}
