import type { ReaderExperimentCandidateFact } from "../../../engine/eval/src/reader-experiment/fact-match.js";

export type DedupStats = {
  preMergeCount: number;
  postMergeCount: number;
  removedCount: number;
};

function valueSignature(value: ReaderExperimentCandidateFact["value"]): string {
  return JSON.stringify(value);
}

function constructSignature(construct: ReaderExperimentCandidateFact["construct"]): string {
  return JSON.stringify({
    measure: construct.measure,
    task: construct.task ?? null,
    administration: construct.administration ?? null,
  });
}

function primaryEvidenceKey(
  fact: ReaderExperimentCandidateFact,
): { sourceDocumentId: string; page: number; quote: string } | null {
  const ref = fact.evidenceRefs[0];
  if (!ref?.sourceDocumentId || ref.page == null) {
    return null;
  }
  const quote = (ref.snippet ?? "").trim();
  if (!quote) {
    return null;
  }
  return { sourceDocumentId: ref.sourceDocumentId, page: ref.page, quote };
}

function factsSemanticallyDuplicate(
  a: ReaderExperimentCandidateFact,
  b: ReaderExperimentCandidateFact,
): boolean {
  if (constructSignature(a.construct) !== constructSignature(b.construct)) {
    return false;
  }
  if (a.modality !== b.modality) {
    return false;
  }
  if (valueSignature(a.value) !== valueSignature(b.value)) {
    return false;
  }
  const keyA = primaryEvidenceKey(a);
  const keyB = primaryEvidenceKey(b);
  if (!keyA || !keyB) {
    return false;
  }
  if (
    keyA.sourceDocumentId === keyB.sourceDocumentId &&
    keyA.page === keyB.page &&
    keyA.quote === keyB.quote
  ) {
    return true;
  }
  if (
    keyA.sourceDocumentId === keyB.sourceDocumentId &&
    keyA.page === keyB.page &&
    keyA.quote !== keyB.quote
  ) {
    return false;
  }
  return false;
}

/** Drop only exact semantic duplicates with identical primary evidence (T3.9 reader_dedup parity). */
export function conservativeDeduplicateCandidateFacts(
  facts: ReaderExperimentCandidateFact[],
): { facts: ReaderExperimentCandidateFact[]; stats: DedupStats } {
  const preMergeCount = facts.length;
  const kept: ReaderExperimentCandidateFact[] = [];
  for (const fact of facts) {
    if (kept.some((existing) => factsSemanticallyDuplicate(fact, existing))) {
      continue;
    }
    kept.push(fact);
  }
  const postMergeCount = kept.length;
  return {
    facts: kept,
    stats: {
      preMergeCount,
      postMergeCount,
      removedCount: preMergeCount - postMergeCount,
    },
  };
}
