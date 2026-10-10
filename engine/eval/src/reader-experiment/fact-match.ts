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

function resolveEvidenceRefToWordRange(
  ref: EvidenceReferenceV4,
  context: GradeCorpusContext,
): PageWordRange | null {
  const documentId = resolveDocumentId(ref.sourceDocumentId, context);
  if (!documentId) {
    return null;
  }
  const pageNumber = ref.page ?? 1;
  const pageModel = context.pageModelsByDocumentId.get(documentId)?.find((p) => p.pageNumber === pageNumber);
  const recoveredPage = context.recoveredPagesByDocumentId
    .get(documentId)
    ?.find((p) => p.pageNumber === pageNumber);
  if (!pageModel || !recoveredPage) {
    return null;
  }
  const quote = ref.quote?.trim() ?? "";
  if (!quote) {
    return null;
  }
  return mapV4EvidenceRefToWordRange({
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
