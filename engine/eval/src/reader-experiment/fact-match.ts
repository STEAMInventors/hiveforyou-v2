import {
  mapV4EvidenceRefToWordRange,
  wordRangesOverlap,
  type PageWordRange,
} from "@hiveforyou/core/atoms/map-v4-evidence";
import type { PageModel } from "@hiveforyou/core/document/page-model";
import type {
  ClaimModality,
  ClaimValueV4,
  EvidenceReferenceV4,
} from "@hiveforyou/shared/case-intelligence/4";
import type { NestIepRecoveredPage } from "@hiveforyou/shared/intake";

import { claimValuesEquivalent, type GradeCorpusContext } from "../grade.js";
import type { GoldenCase, GoldenFact } from "../golden/types.js";

export type GoldenFactMatchStatus =
  | "matched"
  | "missed"
  | "overlap_value_mismatch"
  | "overlap_modality_mismatch";

export type PerGoldenFactRow = {
  goldenFactId: string;
  documentId: string;
  pageNumber: number;
  status: GoldenFactMatchStatus;
  matchedCandidateId: string | null;
  competingCandidateIds: string[];
};

export type PerDocumentCoverageRow = {
  documentId: string;
  goldenFactCount: number;
  matchedCount: number;
  recall: number;
};

export type ReaderGoldenComparisonSummary = {
  goldenFactCount: number;
  candidateCount: number;
  matchedGoldenCount: number;
  recall: number;
  precision: number;
  duplicateCandidateCount: number;
  unmatchedCandidateCount: number;
  verificationIncomplete: boolean;
};

export type ReaderGoldenMatchDiagnostics = {
  evidenceRefCount: number;
  documentIdResolvedCount: number;
  pageResolvedCount: number;
  quoteMappedToWordRangeCount: number;
  goldenRangeOverlapCount: number;
  valueMatchCount: number;
  modalityMatchCount: number;
};

export type ReaderGoldenComparisonReport = {
  summary: ReaderGoldenComparisonSummary;
  matchDiagnostics: ReaderGoldenMatchDiagnostics;
  corpusMappingBlocked: boolean;
  perGoldenFact: PerGoldenFactRow[];
  perDocumentCoverage: PerDocumentCoverageRow[];
  unmatchedCandidateIds: string[];
  duplicateCandidateIds: string[];
};

export type ReaderTraceEventRow = {
  event_type: string;
  event_payload: Record<string, unknown>;
  attempt_id: string;
  sequence_number: number;
};

export type StudyRunTraceAudit = {
  studyRunId: string;
  attemptId: string | null;
  traceEventCount: number;
  acceptedEvidenceEventCount: number;
  factProposedEventCount: number;
  completedPayload: Record<string, unknown> | null;
  architectureVariant: string | null;
};

export type StudyRunGradeabilityAssessment = {
  studyRunId: string;
  gradeable: boolean;
  blockers: string[];
  traceAudit: StudyRunTraceAudit | null;
  persistedFactFields: string[];
  recoverySources: string[];
};

export type ReaderExperimentCandidateFact = {
  id: string;
  construct: { measure: string; task?: string | null; administration?: string | null };
  value: ClaimValueV4;
  modality: ClaimModality;
  evidenceRefs: EvidenceReferenceV4[];
};

export type FactLevelMatchMetrics = {
  goldenFactCount: number;
  candidateCount: number;
  matchedCount: number;
  precision: number;
  recall: number;
  fullCaseRecall: boolean;
  verificationIncomplete: boolean;
};

function goldenToPageWordRange(fact: GoldenFact): PageWordRange {
  return {
    documentId: fact.documentId,
    pageNumber: fact.pageNumber,
    wordStart: fact.wordRange[0],
    wordEnd: fact.wordRange[1],
  };
}

function resolveDocumentId(sourceDocumentId: string, context: GradeCorpusContext): string | null {
  const mapped = context.sourceDocumentIdToDocumentId?.get(sourceDocumentId);
  if (mapped) {
    return mapped;
  }
  if (context.pageModelsByDocumentId.has(sourceDocumentId)) {
    return sourceDocumentId;
  }
  return null;
}

function resolveEvidenceRefStages(
  ref: EvidenceReferenceV4,
  context: GradeCorpusContext,
): {
  documentId: string | null;
  pageResolved: boolean;
  wordRange: PageWordRange | null;
} {
  const documentId = resolveDocumentId(ref.sourceDocumentId, context);
  if (!documentId) {
    return { documentId: null, pageResolved: false, wordRange: null };
  }
  const pageNumber = ref.page ?? 1;
  const pageModel = context.pageModelsByDocumentId.get(documentId)?.find((p) => p.pageNumber === pageNumber);
  const recoveredPage = context.recoveredPagesByDocumentId
    .get(documentId)
    ?.find((p) => p.pageNumber === pageNumber);
  if (!pageModel || !recoveredPage) {
    return { documentId, pageResolved: false, wordRange: null };
  }
  const quote = ref.quote?.trim() ?? "";
  if (!quote) {
    return { documentId, pageResolved: true, wordRange: null };
  }
  const wordRange = mapV4EvidenceRefToWordRange({
    documentId,
    recoveredPage,
    pageModel,
    ref: {
      sourceDocumentId: ref.sourceDocumentId,
      page: pageNumber,
      extractionId: ref.extractionId,
      snippet: quote,
    },
  });
  return { documentId, pageResolved: true, wordRange };
}

function resolveEvidenceRefToWordRange(
  ref: EvidenceReferenceV4,
  context: GradeCorpusContext,
): PageWordRange | null {
  return resolveEvidenceRefStages(ref, context).wordRange;
}

export function collectReaderGoldenMatchDiagnostics(input: {
  golden: GoldenCase;
  candidates: ReaderExperimentCandidateFact[];
  corpus: GradeCorpusContext;
}): ReaderGoldenMatchDiagnostics {
  const diagnostics: ReaderGoldenMatchDiagnostics = {
    evidenceRefCount: 0,
    documentIdResolvedCount: 0,
    pageResolvedCount: 0,
    quoteMappedToWordRangeCount: 0,
    goldenRangeOverlapCount: 0,
    valueMatchCount: 0,
    modalityMatchCount: 0,
  };
  const sortedGolden = [...input.golden.facts].sort((a, b) => a.id.localeCompare(b.id));
  for (const candidate of input.candidates) {
    for (const ref of candidate.evidenceRefs) {
      diagnostics.evidenceRefCount += 1;
      const stages = resolveEvidenceRefStages(ref, input.corpus);
      if (stages.documentId) {
        diagnostics.documentIdResolvedCount += 1;
      }
      if (stages.pageResolved) {
        diagnostics.pageResolvedCount += 1;
      }
      if (!stages.wordRange) {
        continue;
      }
      diagnostics.quoteMappedToWordRangeCount += 1;
      for (const fact of sortedGolden) {
        const factRange = goldenToPageWordRange(fact);
        if (!wordRangesOverlap(factRange, stages.wordRange)) {
          continue;
        }
        diagnostics.goldenRangeOverlapCount += 1;
        if (claimValuesEquivalent(candidate.value, fact.value)) {
          diagnostics.valueMatchCount += 1;
          if (fact.acceptableModalities.includes(candidate.modality)) {
            diagnostics.modalityMatchCount += 1;
          }
        }
      }
    }
  }
  return diagnostics;
}

export function readerGoldenCorpusMappingFailure(input: {
  candidateCount: number;
  diagnostics: ReaderGoldenMatchDiagnostics;
}): string | null {
  if (input.candidateCount === 0) {
    return null;
  }
  if (input.diagnostics.evidenceRefCount === 0) {
    return "Accepted facts have no evidence references; cannot grade provenance overlap.";
  }
  if (input.diagnostics.documentIdResolvedCount === 0) {
    return "Corpus mapping failed: no accepted-fact sourceDocumentId resolves to a golden corpus document (check UUID → L001 filename map).";
  }
  if (input.diagnostics.pageResolvedCount === 0) {
    return "Corpus mapping failed: no accepted-fact evidence resolves to a golden corpus page.";
  }
  return null;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) {
    return 0;
  }
  return Math.min(1, Math.max(0, n));
}

export function gradeReaderFactsAgainstGolden(input: {
  golden: GoldenCase;
  candidates: ReaderExperimentCandidateFact[];
  corpus: GradeCorpusContext;
  verificationIncomplete?: boolean;
}): FactLevelMatchMetrics {
  const { golden, candidates, corpus } = input;
  const verificationIncomplete = input.verificationIncomplete === true;
  const matchedFactIds = new Set<string>();
  const matchedCandidateIds = new Set<string>();

  for (const fact of [...golden.facts].sort((a, b) => a.id.localeCompare(b.id))) {
    const factRange = goldenToPageWordRange(fact);
    for (const candidate of [...candidates].sort((a, b) => a.id.localeCompare(b.id))) {
      if (matchedCandidateIds.has(candidate.id)) {
        continue;
      }
      let overlaps = false;
      for (const ref of candidate.evidenceRefs) {
        const refRange = resolveEvidenceRefToWordRange(ref, corpus);
        if (refRange && wordRangesOverlap(factRange, refRange)) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) {
        continue;
      }
      const valueMatch = claimValuesEquivalent(candidate.value, fact.value);
      const modalityOk = fact.acceptableModalities.includes(candidate.modality);
      if (valueMatch && modalityOk) {
        matchedFactIds.add(fact.id);
        matchedCandidateIds.add(candidate.id);
        break;
      }
    }
  }

  const matchedCount = matchedFactIds.size;
  const candidateCount = candidates.length;
  const goldenFactCount = golden.facts.length;
  const precision =
    candidateCount === 0 ? (goldenFactCount === 0 ? 1 : 0) : matchedCount / candidateCount;
  const recall =
    goldenFactCount === 0 ? 1 : verificationIncomplete ? matchedCount / goldenFactCount : matchedCount / goldenFactCount;

  return {
    goldenFactCount,
    candidateCount,
    matchedCount,
    precision: clamp01(precision),
    recall: clamp01(recall),
    fullCaseRecall: !verificationIncomplete && matchedCount === goldenFactCount,
    verificationIncomplete,
  };
}

export function readerWireFactToCandidateFact(raw: Record<string, unknown>): ReaderExperimentCandidateFact | null {
  const id = typeof raw.id === "string" ? raw.id : "reader-candidate-unknown";
  const constructRaw = raw.construct;
  if (!constructRaw || typeof constructRaw !== "object") {
    return null;
  }
  const constructRecord = constructRaw as Record<string, unknown>;
  const measure = typeof constructRecord.measure === "string" ? constructRecord.measure : "unspecified";
  const value = raw.value;
  if (!value || typeof value !== "object") {
    return null;
  }
  const modalityRaw = raw.modality;
  const modality =
    typeof modalityRaw === "string" && modalityRaw.trim()
      ? (modalityRaw as ClaimModality)
      : "unknown";
  const evidenceRaw = raw.evidence ?? raw.evidenceRefs;
  if (!Array.isArray(evidenceRaw)) {
    return null;
  }
  const evidenceRefs: EvidenceReferenceV4[] = [];
  for (const item of evidenceRaw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const ev = item as Record<string, unknown>;
    const sourceDocumentId = String(ev.sourceDocumentId ?? ev.documentId ?? "");
    const page = Number(ev.page ?? ev.pageNumber ?? 0);
    const quote = String(ev.quote ?? ev.snippet ?? "").trim();
    if (!sourceDocumentId || page <= 0 || !quote) {
      continue;
    }
    evidenceRefs.push({
      id: typeof ev.id === "string" ? ev.id : `ev-${evidenceRefs.length + 1}`,
      sourceDocumentId,
      page,
      quote,
      sourceType: "document",
    });
  }
  if (!evidenceRefs.length) {
    return null;
  }
  return {
    id,
    construct: {
      measure,
      task: typeof constructRecord.task === "string" ? constructRecord.task : null,
      administration:
        typeof constructRecord.administration === "string" ? constructRecord.administration : null,
    },
    value: value as ClaimValueV4,
    modality,
    evidenceRefs,
  };
}

function candidateOverlapsGolden(
  candidate: ReaderExperimentCandidateFact,
  fact: GoldenFact,
  corpus: GradeCorpusContext,
): boolean {
  const factRange = goldenToPageWordRange(fact);
  for (const ref of candidate.evidenceRefs) {
    const refRange = resolveEvidenceRefToWordRange(ref, corpus);
    if (refRange && wordRangesOverlap(factRange, refRange)) {
      return true;
    }
  }
  return false;
}

export function buildReaderGoldenComparisonReport(input: {
  golden: GoldenCase;
  candidates: ReaderExperimentCandidateFact[];
  corpus: GradeCorpusContext;
  verificationIncomplete?: boolean;
}): ReaderGoldenComparisonReport {
  const { golden, candidates, corpus } = input;
  const verificationIncomplete = input.verificationIncomplete === true;
  const sortedGolden = [...golden.facts].sort((a, b) => a.id.localeCompare(b.id));
  const sortedCandidates = [...candidates].sort((a, b) => a.id.localeCompare(b.id));
  const matchedCandidateIds = new Set<string>();
  const perGoldenFact: PerGoldenFactRow[] = [];

  for (const fact of sortedGolden) {
    const competing: string[] = [];
    let matchedId: string | null = null;
    let status: GoldenFactMatchStatus = "missed";

    for (const candidate of sortedCandidates) {
      if (!candidateOverlapsGolden(candidate, fact, corpus)) {
        continue;
      }
      competing.push(candidate.id);
      const valueMatch = claimValuesEquivalent(candidate.value, fact.value);
      const modalityOk = fact.acceptableModalities.includes(candidate.modality);
      if (!valueMatch) {
        if (status === "missed") {
          status = "overlap_value_mismatch";
        }
        continue;
      }
      if (!modalityOk) {
        if (status === "missed" || status === "overlap_value_mismatch") {
          status = "overlap_modality_mismatch";
        }
        continue;
      }
      if (matchedCandidateIds.has(candidate.id)) {
        continue;
      }
      if (matchedId === null) {
        matchedId = candidate.id;
        matchedCandidateIds.add(candidate.id);
        status = "matched";
      }
    }

    perGoldenFact.push({
      goldenFactId: fact.id,
      documentId: fact.documentId,
      pageNumber: fact.pageNumber,
      status,
      matchedCandidateId: matchedId,
      competingCandidateIds: competing.filter((id) => id !== matchedId),
    });
  }

  const duplicateCandidateIds: string[] = [];
  const unmatchedCandidateIds: string[] = [];

  for (const candidate of sortedCandidates) {
    if (matchedCandidateIds.has(candidate.id)) {
      continue;
    }
    const matchingGoldens = sortedGolden.filter((fact) => candidateOverlapsGolden(candidate, fact, corpus));
    if (matchingGoldens.length === 0) {
      unmatchedCandidateIds.push(candidate.id);
      continue;
    }
    const wouldMatch = matchingGoldens.some((fact) => {
      const valueMatch = claimValuesEquivalent(candidate.value, fact.value);
      const modalityOk = fact.acceptableModalities.includes(candidate.modality);
      return valueMatch && modalityOk;
    });
    if (wouldMatch) {
      duplicateCandidateIds.push(candidate.id);
    } else {
      unmatchedCandidateIds.push(candidate.id);
    }
  }

  const matchedGoldenCount = perGoldenFact.filter((row) => row.status === "matched").length;
  const candidateCount = candidates.length;
  const goldenFactCount = golden.facts.length;
  const precision =
    candidateCount === 0 ? (goldenFactCount === 0 ? 1 : 0) : matchedGoldenCount / candidateCount;
  const recall = goldenFactCount === 0 ? 1 : matchedGoldenCount / goldenFactCount;

  const matchDiagnostics = collectReaderGoldenMatchDiagnostics({ golden, candidates, corpus });
  const corpusMappingBlocked =
    readerGoldenCorpusMappingFailure({ candidateCount, diagnostics: matchDiagnostics }) !== null;

  const byDoc = new Map<string, { golden: number; matched: number }>();
  for (const row of perGoldenFact) {
    const entry = byDoc.get(row.documentId) ?? { golden: 0, matched: 0 };
    entry.golden += 1;
    if (row.status === "matched") {
      entry.matched += 1;
    }
    byDoc.set(row.documentId, entry);
  }
  const perDocumentCoverage: PerDocumentCoverageRow[] = [...byDoc.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([documentId, counts]) => ({
      documentId,
      goldenFactCount: counts.golden,
      matchedCount: counts.matched,
      recall: counts.golden === 0 ? 1 : clamp01(counts.matched / counts.golden),
    }));

  return {
    summary: {
      goldenFactCount,
      candidateCount,
      matchedGoldenCount,
      recall: clamp01(recall),
      precision: clamp01(precision),
      duplicateCandidateCount: duplicateCandidateIds.length,
      unmatchedCandidateCount: unmatchedCandidateIds.length,
      verificationIncomplete,
    },
    matchDiagnostics,
    corpusMappingBlocked,
    perGoldenFact,
    perDocumentCoverage,
    unmatchedCandidateIds,
    duplicateCandidateIds,
  };
}

export function parseAcceptedReaderFactsJson(raw: unknown): ReaderExperimentCandidateFact[] {
  if (!raw || typeof raw !== "object") {
    throw new Error("Accepted facts JSON must be an object");
  }
  const record = raw as Record<string, unknown>;
  if (record.schemaVersion === "reader-accepted-facts/1" && Array.isArray(record.facts)) {
    const facts: ReaderExperimentCandidateFact[] = [];
    for (const item of record.facts) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const mapped = readerWireFactToCandidateFact(item as Record<string, unknown>);
      if (mapped) {
        facts.push(mapped);
      }
    }
    return facts;
  }
  if (record.schemaVersion === "study-reader/1" && Array.isArray(record.candidateFacts)) {
    throw new Error(
      "study-reader/1 candidateFacts are not verifier-accepted only; export reader-accepted-facts/1",
    );
  }
  if (Array.isArray(record.facts)) {
    return record.facts as ReaderExperimentCandidateFact[];
  }
  if (Array.isArray(raw)) {
    return raw as ReaderExperimentCandidateFact[];
  }
  throw new Error("Unrecognized accepted facts JSON shape");
}

export type GoldenMismatchClassification =
  | "TRUE_OMISSION"
  | "VALUE_EXTRACTION_ERROR"
  | "MODALITY_EXTRACTION_ERROR"
  | "EQUIVALENT_VALUE_GRADER_MISMATCH"
  | "EVIDENCE_ALIGNMENT_ERROR"
  | "INDETERMINATE";

export type ClosestCandidateDiagnostics = {
  candidateId: string;
  constructMeasure: string;
  candidateModality: ClaimModality;
  candidateValueKind: ClaimValueV4["kind"];
  resolvedDocumentId: string | null;
  candidatePage: number | null;
  sameDocument: boolean;
  samePage: boolean;
  evidenceOverlap: boolean;
  constructMatch: boolean;
  valueMatch: boolean;
  modalityMatch: boolean;
  rankScore: number;
};

export type GoldenMismatchAuditRow = {
  goldenFactId: string;
  documentId: string;
  pageNumber: number;
  graderStatus: GoldenFactMatchStatus;
  classification: GoldenMismatchClassification;
  classificationReason: string;
  closestCandidate: ClosestCandidateDiagnostics | null;
  alternateCandidateIds: string[];
  proposedValueEquivalence: { rule: string; detail: string } | null;
};

export type ReaderGoldenMismatchAuditReport = {
  schemaVersion: "reader-golden-mismatch-audit/1";
  generatedAt: string;
  documentFilter: string | null;
  officialComparisonSummary: ReaderGoldenComparisonSummary;
  classificationCounts: Record<GoldenMismatchClassification, number>;
  rows: GoldenMismatchAuditRow[];
};

function normalizeTextForStrictEquivalence(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Deterministic near-miss checks only; never fuzzy semantic equivalence. */
export function proposeStrictValueEquivalence(
  candidateValue: ClaimValueV4,
  goldenValue: ClaimValueV4,
): { equivalent: true; rule: string; detail: string } | { equivalent: false } {
  if (claimValuesEquivalent(candidateValue, goldenValue)) {
    return {
      equivalent: true,
      rule: "claimValuesEquivalent",
      detail: "Values already match under official grader equality.",
    };
  }
  if (candidateValue.kind === "text" && goldenValue.kind === "text") {
    const left = normalizeTextForStrictEquivalence(candidateValue.textValue ?? "");
    const right = normalizeTextForStrictEquivalence(goldenValue.textValue ?? "");
    if (left.length > 0 && left === right) {
      return {
        equivalent: true,
        rule: "text_whitespace_case_insensitive",
        detail:
          "Candidate and golden text differ only by outer whitespace and/or letter case; claimValuesEquivalent requires exact textValue.",
      };
    }
  }
  return { equivalent: false };
}

function goldenFactConstructTokens(factId: string): string[] {
  const stem = factId.replace(/^clm_/, "").toLowerCase();
  return stem.split("_").filter((part) => part.length >= 3);
}

export function constructMatchesGoldenFact(factId: string, measure: string): boolean {
  const measureNorm = measure.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const stem = factId.replace(/^clm_/, "").toLowerCase();
  if (measureNorm.includes(stem) || stem.includes(measureNorm.replace(/_/g, ""))) {
    return true;
  }
  const tokens = goldenFactConstructTokens(factId);
  if (tokens.length === 0) {
    return false;
  }
  const matched = tokens.filter((token) => measureNorm.includes(token));
  return matched.length >= Math.min(2, tokens.length);
}

function rankCandidateAgainstGoldenFact(input: {
  fact: GoldenFact;
  candidate: ReaderExperimentCandidateFact;
  corpus: GradeCorpusContext;
}): ClosestCandidateDiagnostics {
  const { fact, candidate, corpus } = input;
  let best: ClosestCandidateDiagnostics = {
    candidateId: candidate.id,
    constructMeasure: candidate.construct.measure,
    candidateModality: candidate.modality,
    candidateValueKind: candidate.value.kind,
    resolvedDocumentId: null,
    candidatePage: null,
    sameDocument: false,
    samePage: false,
    evidenceOverlap: false,
    constructMatch: constructMatchesGoldenFact(fact.id, candidate.construct.measure),
    valueMatch: claimValuesEquivalent(candidate.value, fact.value),
    modalityMatch: fact.acceptableModalities.includes(candidate.modality),
    rankScore: 0,
  };

  for (const ref of candidate.evidenceRefs) {
    const stages = resolveEvidenceRefStages(ref, corpus);
    const factRange = goldenToPageWordRange(fact);
    const overlap =
      stages.wordRange !== null && wordRangesOverlap(factRange, stages.wordRange);
    const sameDocument = stages.documentId === fact.documentId;
    const pageNumber = ref.page ?? 1;
    const samePage = sameDocument && pageNumber === fact.pageNumber;

    const link: ClosestCandidateDiagnostics = {
      candidateId: candidate.id,
      constructMeasure: candidate.construct.measure,
      candidateModality: candidate.modality,
      candidateValueKind: candidate.value.kind,
      resolvedDocumentId: stages.documentId,
      candidatePage: pageNumber,
      sameDocument,
      samePage,
      evidenceOverlap: overlap,
      constructMatch: constructMatchesGoldenFact(fact.id, candidate.construct.measure),
      valueMatch: claimValuesEquivalent(candidate.value, fact.value),
      modalityMatch: fact.acceptableModalities.includes(candidate.modality),
      rankScore: 0,
    };
    link.rankScore =
      (link.sameDocument ? 64 : 0) +
      (link.samePage ? 32 : 0) +
      (link.evidenceOverlap ? 16 : 0) +
      (link.constructMatch ? 8 : 0) +
      (link.valueMatch ? 4 : 0) +
      (link.modalityMatch ? 2 : 0);

    if (link.rankScore > best.rankScore) {
      best = link;
    }
  }

  if (candidate.evidenceRefs.length === 0) {
    best.rankScore =
      (best.constructMatch ? 8 : 0) +
      (best.valueMatch ? 4 : 0) +
      (best.modalityMatch ? 2 : 0);
  }

  return best;
}

export function findClosestCandidateForGoldenFact(input: {
  fact: GoldenFact;
  candidates: ReaderExperimentCandidateFact[];
  corpus: GradeCorpusContext;
}): { closest: ClosestCandidateDiagnostics | null; alternates: string[] } {
  const ranked = [...input.candidates]
    .map((candidate) => rankCandidateAgainstGoldenFact({ fact: input.fact, candidate, corpus: input.corpus }))
    .sort((a, b) => {
      if (b.rankScore !== a.rankScore) {
        return b.rankScore - a.rankScore;
      }
      return a.candidateId.localeCompare(b.candidateId);
    });

  if (ranked.length === 0 || ranked[0]!.rankScore <= 0) {
    return { closest: ranked[0]?.rankScore === 0 ? ranked[0]! : null, alternates: [] };
  }

  const topScore = ranked[0]!.rankScore;
  const top = ranked.filter((row) => row.rankScore === topScore);
  return {
    closest: top[0] ?? null,
    alternates: top.slice(1).map((row) => row.candidateId),
  };
}

export function classifyUnmatchedGoldenFact(input: {
  fact: GoldenFact;
  graderStatus: GoldenFactMatchStatus;
  closest: ClosestCandidateDiagnostics | null;
}): {
  classification: GoldenMismatchClassification;
  reason: string;
  proposedValueEquivalence: { rule: string; detail: string } | null;
} {
  const { fact, graderStatus, closest } = input;
  if (graderStatus === "matched") {
    return {
      classification: "INDETERMINATE",
      reason: "Golden fact is matched; audit applies to unmatched rows only.",
      proposedValueEquivalence: null,
    };
  }

  if (!closest || closest.rankScore <= 0) {
    return {
      classification: "TRUE_OMISSION",
      reason: "No verifier-accepted candidate shares document, page, or provenance overlap with this golden anchor.",
      proposedValueEquivalence: null,
    };
  }

  if (closest.sameDocument && closest.samePage && !closest.evidenceOverlap) {
    return {
      classification: "EVIDENCE_ALIGNMENT_ERROR",
      reason:
        "Candidate cites the same document and page but the mapped quote word range does not overlap the golden wordRange (verifier accepted a different span on-page).",
      proposedValueEquivalence: null,
    };
  }

  if (!closest.evidenceOverlap) {
    return {
      classification: "TRUE_OMISSION",
      reason:
        "Closest candidate is on a different page or document without provenance overlap; no accepted extraction anchors this golden fact.",
      proposedValueEquivalence: null,
    };
  }

  if (closest.valueMatch && closest.modalityMatch) {
    return {
      classification: "INDETERMINATE",
      reason:
        "Closest overlapping candidate matches value and acceptable modality but the one-to-one grader did not assign it (likely consumed by another golden fact or tie order).",
      proposedValueEquivalence: null,
    };
  }

  if (closest.valueMatch && !closest.modalityMatch) {
    return {
      classification: "MODALITY_EXTRACTION_ERROR",
      reason: `Overlapping value matches golden but modality ${closest.candidateModality} is not in acceptableModalities [${fact.acceptableModalities.join(", ")}].`,
      proposedValueEquivalence: null,
    };
  }

  return {
    classification: "VALUE_EXTRACTION_ERROR",
    reason: "Overlapping candidate value differs from golden under claimValuesEquivalent (see classifyUnmatchedGoldenFactWithCandidate for equivalence review).",
    proposedValueEquivalence: null,
  };
}

export function classifyUnmatchedGoldenFactWithCandidate(input: {
  fact: GoldenFact;
  graderStatus: GoldenFactMatchStatus;
  closest: ClosestCandidateDiagnostics | null;
  candidateValue: ClaimValueV4 | null;
}): {
  classification: GoldenMismatchClassification;
  reason: string;
  proposedValueEquivalence: { rule: string; detail: string } | null;
} {
  const base = classifyUnmatchedGoldenFact({
    fact: input.fact,
    graderStatus: input.graderStatus,
    closest: input.closest,
  });
  if (
    !input.closest?.evidenceOverlap ||
    !input.candidateValue ||
    input.closest.valueMatch ||
    base.classification === "INDETERMINATE" ||
    base.classification === "MODALITY_EXTRACTION_ERROR" ||
    base.classification === "TRUE_OMISSION" ||
    base.classification === "EVIDENCE_ALIGNMENT_ERROR"
  ) {
    return base;
  }

  const equivalence = proposeStrictValueEquivalence(input.candidateValue, input.fact.value);
  if (equivalence.equivalent) {
    return {
      classification: "EQUIVALENT_VALUE_GRADER_MISMATCH",
      reason: equivalence.detail,
      proposedValueEquivalence: { rule: equivalence.rule, detail: equivalence.detail },
    };
  }

  return {
    classification: "VALUE_EXTRACTION_ERROR",
    reason: "Overlapping candidate value differs from golden under claimValuesEquivalent.",
    proposedValueEquivalence: null,
  };
}

export function buildReaderGoldenMismatchAuditReport(input: {
  golden: GoldenCase;
  comparison: ReaderGoldenComparisonReport;
  candidates: ReaderExperimentCandidateFact[];
  corpus: GradeCorpusContext;
  documentFilter?: string | null;
  generatedAt?: string;
}): ReaderGoldenMismatchAuditReport {
  const documentFilter = input.documentFilter?.trim() || null;
  const candidatesById = new Map(input.candidates.map((c) => [c.id, c]));
  const rows: GoldenMismatchAuditRow[] = [];

  for (const row of input.comparison.perGoldenFact) {
    if (row.status === "matched") {
      continue;
    }
    if (documentFilter && row.documentId !== documentFilter) {
      continue;
    }
    const fact = input.golden.facts.find((f) => f.id === row.goldenFactId);
    if (!fact) {
      continue;
    }
    const { closest, alternates } = findClosestCandidateForGoldenFact({
      fact,
      candidates: input.candidates,
      corpus: input.corpus,
    });
    const candidateValue = closest ? (candidatesById.get(closest.candidateId)?.value ?? null) : null;
    const classified = classifyUnmatchedGoldenFactWithCandidate({
      fact,
      graderStatus: row.status,
      closest,
      candidateValue,
    });

    rows.push({
      goldenFactId: row.goldenFactId,
      documentId: row.documentId,
      pageNumber: row.pageNumber,
      graderStatus: row.status,
      classification: classified.classification,
      classificationReason: classified.reason,
      closestCandidate: closest,
      alternateCandidateIds: alternates,
      proposedValueEquivalence: classified.proposedValueEquivalence,
    });
  }

  rows.sort((a, b) => a.goldenFactId.localeCompare(b.goldenFactId));

  const classificationCounts: Record<GoldenMismatchClassification, number> = {
    TRUE_OMISSION: 0,
    VALUE_EXTRACTION_ERROR: 0,
    MODALITY_EXTRACTION_ERROR: 0,
    EQUIVALENT_VALUE_GRADER_MISMATCH: 0,
    EVIDENCE_ALIGNMENT_ERROR: 0,
    INDETERMINATE: 0,
  };
  for (const row of rows) {
    classificationCounts[row.classification] += 1;
  }

  return {
    schemaVersion: "reader-golden-mismatch-audit/1",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    documentFilter,
    officialComparisonSummary: { ...input.comparison.summary },
    classificationCounts,
    rows,
  };
}

const TRACE_PERSISTED_FIELDS = [
  "candidateFactId",
  "sourceDocumentId",
  "page",
  "reasonCodes",
  "decisionAuthority",
  "authoritative",
] as const;

const ACCEPTED_FACT_PAYLOAD_FIELDS = [
  "construct",
  "value",
  "modality",
  "sourceDocumentId",
  "page",
  "quote",
  "evidence",
  "evidenceRefs",
] as const;

export function filterTraceEventsForAttempt(
  events: ReaderTraceEventRow[],
  attemptId: string,
): ReaderTraceEventRow[] {
  return events.filter((row) => row.attempt_id === attemptId);
}

/** Prefer artifact attemptId; otherwise the latest COMPLETED attempt (ignores failed retries). */
export function resolveGradeableAttemptId(
  events: ReaderTraceEventRow[],
  preferredAttemptId?: string | null,
): string | null {
  if (preferredAttemptId) {
    const preferred = filterTraceEventsForAttempt(events, preferredAttemptId);
    const hasStarted = preferred.some((row) => row.event_type === "STARTED");
    const hasCompleted = preferred.some((row) => row.event_type === "COMPLETED");
    if (hasStarted && hasCompleted) {
      return preferredAttemptId;
    }
  }

  const completedByAttempt = new Map<string, number>();
  for (const row of events) {
    if (row.event_type !== "COMPLETED") {
      continue;
    }
    const prior = completedByAttempt.get(row.attempt_id);
    if (prior === undefined || row.sequence_number > prior) {
      completedByAttempt.set(row.attempt_id, row.sequence_number);
    }
  }
  if (completedByAttempt.size === 0) {
    return null;
  }

  let chosenAttempt: string | null = null;
  let chosenSequence = -1;
  for (const [attemptId, sequence] of completedByAttempt) {
    const attemptEvents = filterTraceEventsForAttempt(events, attemptId);
    if (!attemptEvents.some((row) => row.event_type === "STARTED")) {
      continue;
    }
    if (sequence > chosenSequence) {
      chosenAttempt = attemptId;
      chosenSequence = sequence;
    }
  }
  return chosenAttempt;
}

export function buildStudyRunTraceAudit(
  studyRunId: string,
  events: ReaderTraceEventRow[],
  attemptId: string,
): StudyRunTraceAudit {
  const scoped = filterTraceEventsForAttempt(events, attemptId);
  const sorted = [...scoped].sort((a, b) => a.sequence_number - b.sequence_number);
  const completed = sorted.find((row) => row.event_type === "COMPLETED");
  const completedPayload = completed?.event_payload ?? null;
  const architectureVariant =
    typeof completedPayload?.readerArchitectureVariant === "string"
      ? completedPayload.readerArchitectureVariant
      : null;
  return {
    studyRunId,
    attemptId,
    traceEventCount: scoped.length,
    acceptedEvidenceEventCount: scoped.filter((row) => row.event_type === "EVIDENCE_ACCEPTED").length,
    factProposedEventCount: scoped.filter((row) => row.event_type === "FACT_PROPOSED").length,
    completedPayload,
    architectureVariant,
  };
}

export function assessStudyRunGradeability(input: {
  studyRunId: string;
  traceEvents: ReaderTraceEventRow[];
  acceptedFactsFilePresent: boolean;
  attemptId?: string | null;
}): StudyRunGradeabilityAssessment {
  const blockers: string[] = [];
  const recoverySources: string[] = [];

  if (input.acceptedFactsFilePresent) {
    recoverySources.push(
      `reader-accepted-facts/1 in private storage or export for studyRunId ${input.studyRunId}`,
    );
  } else {
    blockers.push(
      "No reader-accepted-facts/1 export (accepted CandidateFact payloads are not in agent_run_trace_events).",
    );
    recoverySources.push(
      "Private bucket reader-accepted-facts/1 artifact written by agentic Reader qualification.",
    );
  }

  const gradeableAttemptId = resolveGradeableAttemptId(input.traceEvents, input.attemptId ?? null);
  const traceAudit =
    gradeableAttemptId !== null
      ? buildStudyRunTraceAudit(input.studyRunId, input.traceEvents, gradeableAttemptId)
      : null;

  if (!traceAudit) {
    blockers.push("No agent_run_trace_events rows for this studyRunId.");
  } else if (traceAudit.acceptedEvidenceEventCount < 1) {
    blockers.push("Trace has zero EVIDENCE_ACCEPTED events.");
  }

  if (!input.acceptedFactsFilePresent) {
    blockers.push(
      `Trace has ${TRACE_PERSISTED_FIELDS.join(", ")} only; grading needs ${ACCEPTED_FACT_PAYLOAD_FIELDS.join(", ")} per accepted fact.`,
    );
  }

  const gradeable =
    input.acceptedFactsFilePresent &&
    traceAudit !== null &&
    traceAudit.acceptedEvidenceEventCount >= 1 &&
    !blockers.some((b) => b.startsWith("No agent_run_trace"));

  return {
    studyRunId: input.studyRunId,
    gradeable,
    blockers,
    traceAudit,
    persistedFactFields: [...TRACE_PERSISTED_FIELDS],
    recoverySources,
  };
}
