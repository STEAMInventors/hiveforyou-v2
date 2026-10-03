import type { StudyAnchors } from "@hiveforyou/shared/pack-study";

const SLOT_ROLE: Record<string, string> = {
  "prior.eligibility.category": "Prior eligibility",
  "current.eligibility.category": "Current eligibility",
  "prior.eligibility.primaryNeed": "Prior IEP",
  "current.eligibility.primaryNeed": "Current IEP",
  "prior.goal.baseline": "Prior IEP",
  "prior.goal.target": "Prior IEP",
  "prior.goal.skill": "Prior IEP",
  "current.goal.skill": "Current IEP",
  "reeval.latest.date": "Reevaluation",
  "reeval.latest.season": "Reevaluation",
  "reeval.summary": "Reevaluation",
};

/** Intake/local classifier families stored on `CaseDocument.documentType`. */
const IEP_FAMILY_DISPLAY: Record<string, string> = {
  REFERRAL: "Referral for special education evaluation",
  EVAL_PLAN: "Special education evaluation plan",
  EVALUATION: "Evaluation report",
  ELIGIBILITY: "Eligibility determination",
  MEETING: "Meeting notes",
  PWN: "Prior written notice",
  IEP: "Individualized Education Program",
  PROGRESS: "Progress report",
  SERVICES: "Related services",
  ACADEMIC: "Academic evaluation report",
  BEHAVIOR: "Behavior evaluation report",
  EXTERNAL: "External evaluation",
  TRANSITION_EXIT: "Transition plan",
  OTHER: "Supporting document",
  OTHER_EDUCATIONAL: "Supporting document",
};

const ENGINE_KEY = /^[A-Z][A-Z0-9_]*$/;

export function looksLikeEngineDocumentKey(value: string): boolean {
  const t = value.trim();
  return ENGINE_KEY.test(t) || (t.includes("_") && t === t.toUpperCase());
}

export function docRoleLabelForSlot(slot: string, anchors: StudyAnchors): string {
  if (SLOT_ROLE[slot]) {
    return SLOT_ROLE[slot];
  }
  if (slot.startsWith("prior.")) {
    return anchors.prior?.label?.replace(/\d{4}/, "").trim() || "Prior IEP";
  }
  if (slot.startsWith("current.")) {
    return anchors.current?.label?.replace(/\d{4}/, "").trim() || "Current IEP";
  }
  if (slot.startsWith("goal.")) {
    return "IEP goal";
  }
  if (slot.startsWith("reeval.")) {
    return "Reevaluation";
  }
  return "Source document";
}

export function chipLabel(role: string, page: number): string {
  return `${role} · p.${page}`;
}

function titleFromFileName(fileName: string): string {
  let base = fileName.replace(/\.pdf$/i, "").replace(/^\d+\s+/, "").trim();
  base = base.replace(/_/g, " ");
  if (!base) {
    return "";
  }
  return base.replace(/\b\w/g, (char) => char.toUpperCase());
}

function humanizeEngineKey(key: string): string {
  const mapped = IEP_FAMILY_DISPLAY[key.trim()];
  if (mapped) {
    return mapped;
  }
  return key
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\biep\b/g, "IEP")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Customer-facing document title — never a raw classifier family or filename token. */
export function documentDisplayTitle(fileName: string, documentType?: string | null): string {
  const type = documentType?.trim() ?? "";
  const fromFile = titleFromFileName(fileName);

  if (type && looksLikeEngineDocumentKey(type)) {
    const fileHay = fileName.toLowerCase();
    if (fileHay.includes("prior")) {
      if (type === "IEP") {
        return "Prior IEP";
      }
      if (type === "ELIGIBILITY") {
        return "Prior eligibility determination";
      }
    }
    if (fileHay.includes("current") || fileHay.includes(" new ") || /\bnew\b/.test(fileHay)) {
      if (type === "IEP") {
        return "Current IEP";
      }
      if (type === "ELIGIBILITY") {
        return "Current eligibility determination";
      }
    }
    if ((fileHay.includes("reeval") || fileHay.includes("re-eval")) && type === "EVALUATION") {
      return "Reevaluation report";
    }
    if (fileHay.includes("academic") && type === "EVALUATION") {
      return "Academic evaluation report";
    }
    if (fileHay.includes("psycho") && type === "EVALUATION") {
      return "Psychoeducational evaluation";
    }
    return humanizeEngineKey(type);
  }

  if (type && !type.toLowerCase().endsWith(".pdf") && type.length > 3 && !looksLikeEngineDocumentKey(type)) {
    return type;
  }

  if (fromFile) {
    return fromFile;
  }

  return type ? humanizeEngineKey(type) : "Source document";
}
