import { extractTitleCandidate } from "./title-candidate";
import type {
  ScanClassification,
  ScanCompletionStatus,
  ScanDocument,
  ScanDocumentFamily,
  ScanTemporalRole,
} from "./contracts";

type Rule = {
  family: ScanDocumentFamily;
  subtype: string | null;
  documentStatus?: ScanCompletionStatus;
  temporalRole?: ScanTemporalRole;
  confidence: number;
  /** Prefer match in title candidate over body/filename. */
  pattern: RegExp;
};

/**
 * Identity-first rules. Temporal role is not assigned here except explicit drafts.
 * Order matters within each zone. Title matches beat body/filename.
 */
const RULES: Rule[] = [
  { family: "PWN", subtype: "prior_written_notice", pattern: /\bprior written notice\b|\bpwn\b/i, confidence: 0.9 },
  {
    family: "EVAL_PLAN",
    subtype: "parent_evaluation_consent",
    pattern:
      /\bparent(?:al)?\s+evaluation\s+consent\b|\bconsent\s+to\s+eval(?:uation)?\b|\bevaluation\s+consent\b|\bconsent\s+for\s+(?:an?\s+)?(?:initial\s+)?eval(?:uation)?\b|\bpermission\s+to\s+eval(?:uate|uation)?\b|\bparent(?:al)?\s+consent\s+for\s+(?:an?\s+)?(?:initial\s+)?eval(?:uation)?\b|\bi\s+(?:give|provide)\s+(?:my\s+)?consent\s+(?:to|for)\s+(?:the\s+)?eval/i,
    confidence: 0.9,
  },
  {
    family: "EVAL_PLAN",
    subtype: "evaluation_plan",
    pattern: /\b(?:re)?evaluation plan\b|\bassessment plan\b|\bplan\s+for\s+(?:re)?evaluation\b/i,
    confidence: 0.9,
  },
  {
    family: "PROGRESS",
    subtype: "progress_report",
    pattern: /\b(?:annual\s+)?progress report\b|\bprogress note\b|\bprogress toward (?:annual )?goals?\b/i,
    confidence: 0.9,
  },
  {
    family: "ELIGIBILITY",
    subtype: "eligibility_determination",
    pattern: /\beligibility determination\b|\beligibility decision\b|\beligibility meeting\b/i,
    confidence: 0.92,
  },
  {
    family: "EVALUATION",
    subtype: "psychoeducational_evaluation",
    pattern:
      /\bpsycho[-\s]?educational (?:re)?evaluation\b|\bpsychological (?:re)?evaluation\b|\bpsycho[-\s]?educational report\b/i,
    confidence: 0.92,
  },
  {
    family: "EVALUATION",
    subtype: "speech_language_evaluation",
    pattern:
      /\bspeech[-\s]?language (?:eval(?:uation)?|review|reassessment|reevaluation)\b|\bspeech and language (?:eval(?:uation)?|review)\b/i,
    confidence: 0.9,
  },
  {
    family: "EVALUATION",
    subtype: "academic_evaluation",
    pattern: /\bacademic (?:re)?evaluation\b|\breading (?:re)?evaluation\b|\bacademic (?:re)?assessment\b/i,
    confidence: 0.88,
  },
  {
    family: "IEP",
    subtype: "iep_amendment",
    pattern: /\biep\s+amendment\b|\bamendment\s+to\s+(?:the\s+)?iep\b/i,
    confidence: 0.9,
  },
  {
    family: "IEP",
    subtype: "draft_iep",
    documentStatus: "draft",
    temporalRole: "draft",
    pattern: /\bdraft\s+iep\b|\biep\s+draft\b/i,
    confidence: 0.9,
  },
  {
    family: "IEP",
    subtype: "initial_iep",
    pattern: /\binitial\s+iep\b|\bindividualized education program\b.*\binitial\b|\binitial\b.*\biep\b/i,
    confidence: 0.92,
  },
  {
    family: "IEP",
    subtype: "iep",
    pattern: /\breevaluation\s+iep\b|\biep\s+reevaluation\b|\bindividualized education (?:program|plan)\b/i,
    confidence: 0.86,
  },
  { family: "REFERRAL", subtype: "referral", pattern: /\binitial referral\b|\breferral for (?:special )?education\b|\breferral\b/i, confidence: 0.82 },
  { family: "MEETING", subtype: "meeting_notes", pattern: /\bmeeting notes\b|\biep meeting\b/i, confidence: 0.72 },
  { family: "SERVICES", subtype: "service_plan", pattern: /\bservice plan\b|\brelated service\b/i, confidence: 0.7 },
  { family: "ACADEMIC", subtype: "report_card", pattern: /\breport card\b|\bbenchmark\b/i, confidence: 0.78 },
  {
    family: "BEHAVIOR",
    subtype: "behavior_plan",
    pattern: /\bbip\b|\bbehavior intervention\b|\bfunctional behavior\b|\bfba\b/i,
    confidence: 0.84,
  },
  { family: "EXTERNAL", subtype: "outside_provider", pattern: /\boutside provider\b|\bprivate eval\b|\bhospital\b/i, confidence: 0.7 },
  { family: "TRANSITION_EXIT", subtype: "transition", pattern: /\btransition plan\b|\bexit summary\b/i, confidence: 0.8 },
  { family: "EVALUATION", subtype: null, pattern: /\b(?:re)?eval(?:uation)?\b/i, confidence: 0.58 },
  // Weak IEP mention last — title-first + merge guards prevent this from beating a real identity.
  { family: "IEP", subtype: "iep", pattern: /\biep\b/i, confidence: 0.5 },
];

const IEP_DOCUMENT_TITLE =
  /\bindividualized education (?:program|plan)\b|\breevaluation\s+iep\b|\biep\s+reevaluation\b|\binitial\s+iep\b|\bdraft\s+iep\b/i;

const ELIGIBILITY_PRIMARY_TITLE = /\beligibility determination\b|\beligibility decision\b/i;

const IEP_STRUCTURE_PATTERNS = [
  /\bpresent levels?(?:\s+of\s+academic\s+achievement)?\b|\bplaafp\b/i,
  /\bannual goals?\b/i,
  /\bspecial education services?\b/i,
  /\brelated services?\b/i,
  /\baccommodations?\b/i,
  /\b(?:least restrictive|placement|participation in (?:state|district))\b/i,
  /\bservice (?:grid|minutes|schedule|delivery)\b/i,
  /\biep team\b|\bparent(?:al)? signature/i,
  /\bprogress (?:measurement|reporting)\b/i,
];

const ELIGIBILITY_STRUCTURE_PATTERNS = [
  /\bdisability categor(?:y|ies)\b/i,
  /\bmeets (?:the )?eligibility criteria\b|\bdoes not meet (?:eligibility|the criteria)\b/i,
  /\beligibility (?:team )?determination\b|\beligibility decision\b/i,
  /\b(?:not )?eligible for special education\b/i,
];

export function scoreIepPrimaryIdentity(title: string, body: string): number {
  let score = 0;
  if (IEP_DOCUMENT_TITLE.test(title)) score += 6;
  else if (/\biep\b/i.test(title) && !ELIGIBILITY_PRIMARY_TITLE.test(title)) score += 2;
  for (const pattern of IEP_STRUCTURE_PATTERNS) {
    if (pattern.test(title) || pattern.test(body)) score += 2;
  }
  return score;
}

export function scoreEligibilityPrimaryIdentity(title: string, body: string): number {
  let score = 0;
  if (ELIGIBILITY_PRIMARY_TITLE.test(title) && !IEP_DOCUMENT_TITLE.test(title)) score += 6;
  for (const pattern of ELIGIBILITY_STRUCTURE_PATTERNS) {
    if (pattern.test(title) || pattern.test(body)) score += 2;
  }
  return score;
}

/**
 * Primary document identity when IEP and eligibility language both appear.
 * Incidental eligibility phrases in an IEP do not make the document an eligibility determination.
 */
export function classifyPrimaryDocumentIdentity(
  title: string | null | undefined,
  body: string
): { preferFamily: ScanDocumentFamily | null; reason: string } {
  const heading = title ?? "";
  const iep = scoreIepPrimaryIdentity(heading, body);
  const eligibility = scoreEligibilityPrimaryIdentity(heading, body);
  if (IEP_DOCUMENT_TITLE.test(heading)) {
    return { preferFamily: "IEP", reason: "iep_title_over_eligibility_mention" };
  }
  if (iep >= 6 && iep > eligibility) {
    return { preferFamily: "IEP", reason: "iep_structure_primary" };
  }
  if (eligibility >= 6 && eligibility > iep && iep < 6) {
    return { preferFamily: "ELIGIBILITY", reason: "eligibility_title_primary" };
  }
  return { preferFamily: null, reason: "rule_match" };
}

export function shouldExpectPriorComparableIep(subtype: string | null | undefined): boolean {
  return subtype !== "initial_iep";
}

function isIepIdentitySubtype(subtype: string | null | undefined): boolean {
  return subtype === "iep" || subtype === "initial_iep" || subtype === "draft_iep" || subtype === "iep_amendment";
}

const FAMILY_LABELS: Record<ScanDocumentFamily, string> = {
  REFERRAL: "Referral",
  EVAL_PLAN: "Evaluation planning",
  EVALUATION: "Evaluation",
  ELIGIBILITY: "Eligibility",
  MEETING: "Meeting",
  PWN: "Prior written notice",
  IEP: "IEP",
  PROGRESS: "Progress",
  SERVICES: "Services",
  ACADEMIC: "Academic",
  BEHAVIOR: "Behavior",
  EXTERNAL: "External",
  TRANSITION_EXIT: "Transition/exit",
  OTHER_EDUCATIONAL: "Other educational",
  OTHER: "Other",
};

const IDENTITY_LABELS: Record<string, string> = {
  iep: "IEP",
  iep_amendment: "IEP Amendment",
  draft_iep: "IEP",
  initial_iep: "Initial IEP",
  progress_report: "Progress Report",
  evaluation_plan: "Evaluation Plan",
  parent_evaluation_consent: "Evaluation Consent",
  psychoeducational_evaluation: "Psychoeducational Evaluation",
  academic_evaluation: "Academic Evaluation",
  speech_language_evaluation: "Speech-Language Evaluation",
  other_evaluation: "Evaluation",
  eligibility_determination: "Eligibility Determination",
  prior_written_notice: "Prior Written Notice",
  meeting_notes: "Meeting Notes",
};

const TEMPORAL_LABELS: Record<ScanTemporalRole, string> = {
  prior: "Prior",
  current: "Current",
  intermediate: "Intermediate",
  sequence: "Sequence",
  draft: "Draft",
  proposed: "Proposed",
  unknown: "Unknown",
};

export function formatScanFamily(family: ScanDocumentFamily | string | null | undefined): string {
  if (!family) return "Other";
  return FAMILY_LABELS[family as ScanDocumentFamily] ?? String(family);
}

export function formatScanSubtype(subtype: string | null | undefined): string {
  if (!subtype) return "Type unclear";
  if (IDENTITY_LABELS[subtype]) return IDENTITY_LABELS[subtype];
  return subtype
    .replace(/_/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function formatScanTemporalRole(role: ScanTemporalRole | string | null | undefined): string {
  if (!role) return TEMPORAL_LABELS.unknown;
  return TEMPORAL_LABELS[role as ScanTemporalRole] ?? String(role);
}

export function formatScanStage(stage: string): string {
  const labels: Record<string, string> = {
    review: "Review",
    clarify: "Clarify",
    ask: "Ask",
    document: "Document",
  };
  return labels[stage] ?? stage.charAt(0).toUpperCase() + stage.slice(1);
}

function pagePreview(document: ScanDocument, maxPages = 3, maxChars = 4000): string {
  return document.pages
    .slice(0, maxPages)
    .map((page) => page.text)
    .join(" ")
    .slice(0, maxChars);
}

function detectDraft(haystack: string, rule?: Rule): { temporalRole: ScanTemporalRole; documentStatus: ScanCompletionStatus } {
  if (rule?.temporalRole === "draft" || rule?.documentStatus === "draft" || /\bdraft\s+iep\b|\biep\s+draft\b/i.test(haystack)) {
    return { temporalRole: "draft", documentStatus: "draft" };
  }
  return { temporalRole: "unknown", documentStatus: "unknown" };
}

function findRule(text: string): Rule | undefined {
  return RULES.find((rule) => rule.pattern.test(text));
}

function findIepIdentityRule(text: string): Rule | undefined {
  return RULES.find((rule) => rule.family === "IEP" && rule.confidence >= 0.86 && rule.pattern.test(text));
}

/**
 * Title-first local classification. Filename is supporting only and cannot
 * override a contradictory title/body identity match.
 * Does not assign prior/current — that is resolved after all documents are classified.
 * Document dates are resolved later from labeled date candidates.
 */
export function classifyIepDocumentLocally(document: ScanDocument): ScanClassification {
  const titleCandidate = extractTitleCandidate(document);
  const body = pagePreview(document);
  const filename = document.originalDisplayName;
  const fullForDraft = `${titleCandidate ?? ""} ${body} ${filename}`;
  const identityText = `${titleCandidate ?? ""} ${body}`;

  const titleMatch = titleCandidate ? findRule(titleCandidate) : undefined;
  const bodyMatch = findRule(body);
  const filenameMatch = findRule(filename);
  const primary = classifyPrimaryDocumentIdentity(titleCandidate, body);

  let match = titleMatch ?? bodyMatch;
  let classificationReason = primary.reason === "rule_match" ? "rule_match" : primary.reason;

  if (titleMatch && bodyMatch) {
    if (titleMatch.family !== bodyMatch.family) {
      if (titleMatch.family === "IEP" && bodyMatch.family === "ELIGIBILITY") {
        match = titleMatch;
        classificationReason = "iep_title_over_eligibility_body";
      } else if (titleMatch.family === "ELIGIBILITY" && bodyMatch.family === "IEP") {
        match = primary.preferFamily === "IEP" ? bodyMatch : titleMatch;
        classificationReason = primary.preferFamily === "IEP" ? primary.reason : "eligibility_title_primary";
      } else if (/^(IEP|ELIGIBILITY|PROGRESS|EVAL_PLAN)$/.test(titleMatch.family) && bodyMatch.family === "EVALUATION") {
        match = titleMatch;
      } else if (/^(PROGRESS|EVAL_PLAN|EVALUATION)$/.test(titleMatch.family) && bodyMatch.family === "IEP") {
        match = titleMatch;
      } else if (titleMatch.subtype && !bodyMatch.subtype) {
        match = titleMatch;
      } else if (!titleMatch.subtype && bodyMatch.subtype) {
        match = bodyMatch;
      } else {
        match = titleMatch.confidence >= bodyMatch.confidence ? titleMatch : bodyMatch;
      }
    } else if (!titleMatch.subtype && bodyMatch.subtype) {
      match = bodyMatch;
    } else if (titleMatch.subtype && bodyMatch.subtype && titleMatch.subtype !== bodyMatch.subtype) {
      match = titleMatch.confidence >= bodyMatch.confidence ? titleMatch : bodyMatch;
      if (/\binitial\b/i.test(`${titleCandidate ?? ""} ${body}`) && /initial_iep/.test(bodyMatch.subtype ?? "")) {
        match = bodyMatch;
      }
      if (/\binitial\b/i.test(titleCandidate ?? "") && /initial_iep/.test(titleMatch.subtype ?? "")) {
        match = titleMatch;
      }
    }
  }

  if (match?.family === "ELIGIBILITY" && primary.preferFamily === "IEP") {
    const iepRule = titleMatch?.family === "IEP" ? titleMatch : bodyMatch?.family === "IEP" ? bodyMatch : findIepIdentityRule(identityText);
    if (iepRule) {
      match = iepRule;
      classificationReason = primary.reason;
    }
  }

  if (!match?.subtype && filenameMatch?.subtype) {
    if (!match || match.family === filenameMatch.family) {
      match = filenameMatch;
    } else if (
      match.family === "EVALUATION" &&
      (!match.subtype || match.subtype === "other_evaluation") &&
      match.confidence <= 0.6 &&
      filenameMatch.family === "EVAL_PLAN"
    ) {
      match = filenameMatch;
    }
  }
  if (!match) {
    const draft = detectDraft(fullForDraft);
    return {
      documentId: document.scanDocumentId,
      family: "OTHER",
      subtype: null,
      documentDate: null,
      temporalRole: draft.temporalRole,
      documentStatus: draft.documentStatus,
      confidence: 0.2,
      classificationReason: "unmatched",
    };
  }

  let confidence = match.confidence;
  if (titleMatch && bodyMatch && titleMatch.subtype === bodyMatch.subtype) {
    confidence = Math.min(0.98, confidence + 0.04);
  }

  const draft = detectDraft(fullForDraft, match);
  if (match.family === "IEP" && /\binitial\s+iep\b/i.test(`${titleCandidate ?? ""} ${body}`)) {
    const initial = RULES.find((rule) => rule.subtype === "initial_iep");
    if (initial) {
      match = initial;
      confidence = Math.max(confidence, initial.confidence);
      classificationReason = "initial_iep_title";
    }
  }
  return {
    documentId: document.scanDocumentId,
    family: match.family,
    subtype: match.subtype,
    documentDate: null,
    temporalRole: draft.temporalRole,
    documentStatus: draft.documentStatus,
    confidence,
    classificationReason,
  };
}

/** @deprecated Prefer always calling the model when OpenAI is available. Kept for tests. */
export function needsModelClassification(
  classification: ScanClassification,
  needsModelMin = 0.7
): boolean {
  return classification.subtype == null || classification.confidence < needsModelMin;
}

function isSpecificIdentity(classification: ScanClassification, keepLocalMin: number): boolean {
  const subtype = classification.subtype;
  if (!subtype || classification.confidence < keepLocalMin) return false;
  if (subtype === "other_evaluation") return false;
  if (subtype === "iep" && classification.confidence < 0.7) return false;
  return true;
}

/**
 * Model wins when local identity is weak. A high-confidence specific local identity
 * is not overridden to a different family (especially not IEP).
 * Model prior/current is ignored — temporal resolution happens later.
 */
export function mergeClassification(
  local: ScanClassification,
  model: Partial<ScanClassification> | null,
  opts?: { acceptMin?: number; keepLocalMin?: number }
): ScanClassification {
  const acceptMin = opts?.acceptMin ?? 0.5;
  const keepLocalMin = opts?.keepLocalMin ?? 0.7;
  if (!model || (model.confidence ?? 0) < acceptMin) {
    return {
      ...local,
      temporalRole: local.temporalRole === "draft" ? "draft" : "unknown",
    };
  }

  const modelConfidence = model.confidence ?? 0;
  const familyDiffers = Boolean(model.family && model.family !== local.family);
  const subtypeDiffers = model.subtype !== undefined && model.subtype !== local.subtype;
  const localWeak = !isSpecificIdentity(local, keepLocalMin);
  const localSpecific = isSpecificIdentity(local, keepLocalMin);
  const modelLacksSubtype = model.subtype === null || model.subtype === undefined;
  const modelIsCatchAllEval = model.family === "EVALUATION" && modelLacksSubtype;

  const localDraft = local.temporalRole === "draft" || local.documentStatus === "draft";
  const modelDraft = model.temporalRole === "draft" || model.documentStatus === "draft";
  const temporalRole: ScanTemporalRole = localDraft || modelDraft ? "draft" : "unknown";
  const documentStatus: ScanCompletionStatus = localDraft || modelDraft ? "draft" : "unknown";
  const modelIsIep = model.family === "IEP" && isIepIdentitySubtype(model.subtype ?? null);
  const localEligVsModelIep =
    local.family === "ELIGIBILITY" &&
    modelIsIep &&
    modelConfidence >= keepLocalMin &&
    local.classificationReason !== "eligibility_title_primary";

  if (localSpecific && (modelLacksSubtype || modelIsCatchAllEval)) {
    return {
      ...local,
      documentDate: null,
      temporalRole,
      documentStatus,
    };
  }

  if (localSpecific && familyDiffers && !localEligVsModelIep) {
    return {
      ...local,
      documentDate: null,
      temporalRole,
      documentStatus,
    };
  }

  if (localSpecific && subtypeDiffers && !familyDiffers) {
    return {
      ...local,
      documentDate: null,
      temporalRole,
      documentStatus,
    };
  }

  if (localWeak || familyDiffers || subtypeDiffers || modelConfidence >= local.confidence) {
    const modelSubtype = model.subtype === "prior_iep" || model.subtype === "current_iep" || model.subtype === "annual_iep"
      ? "iep"
      : model.subtype;
    return {
      documentId: local.documentId,
      family: model.family ?? local.family,
      subtype: modelSubtype !== undefined ? modelSubtype : local.subtype,
      documentDate: null,
      temporalRole,
      documentStatus,
      confidence: modelConfidence || local.confidence,
      classificationReason: localEligVsModelIep ? "model_iep_over_local_eligibility" : "model_classification",
    };
  }

  return {
    ...local,
    documentDate: null,
    temporalRole,
    documentStatus,
  };
}
