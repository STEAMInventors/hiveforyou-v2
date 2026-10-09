import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import { CANONICAL_STUDY_CONTEXT_SCHEMA } from "@hiveforyou/shared/canonical-study";

import { findConsecutiveWordQuote } from "@hiveforyou/core/document/find-consecutive-word-quote";
import type { DocumentPages, PageWord } from "@hiveforyou/core/document/page-model";
import {
  documentIdsInContext,
  validateDocumentEvidenceRefs,
  type DocumentEvidenceRef,
} from "@hiveforyou/core/study/validate-document-evidence";

export type ReaderFactEvidenceInput = {
  sourceDocumentId: string;
  page: number;
  quote: string;
  spanStart?: number;
  spanEnd?: number;
};

export type ReaderFactVerifyInput = {
  caseId: string;
  userId: string;
  /** Ignored for acceptance — structure/provenance/quote must pass. */
  verificationStatus?: string;
  evidence: ReaderFactEvidenceInput[];
};

export type VerifiedEvidenceLocation = {
  sourceDocumentId: string;
  page: number;
  quote: string;
  spanStart: number;
  spanEnd: number;
  wordStartIndex: number;
  wordEndIndex: number;
};

export type ReaderFactVerifyResult = {
  accepted: boolean;
  reasons: string[];
  verifiedEvidence: VerifiedEvidenceLocation[];
};

export type ReaderVerifierScope = {
  caseId: string;
  userId: string;
  domainId: string;
  authorizedSourceDocumentIds: string[];
};

export type ReaderVerifierDeps = {
  resolveScope: (
    caseId: string,
    userId: string,
  ) => Promise<ReaderVerifierScope | null>;
  loadDocumentPages: (
    userId: string,
    sourceDocumentId: string,
  ) => Promise<DocumentPages | null>;
};

function reject(reasons: string[]): ReaderFactVerifyResult {
  return { accepted: false, reasons, verifiedEvidence: [] };
}

function accept(verifiedEvidence: VerifiedEvidenceLocation[]): ReaderFactVerifyResult {
  return { accepted: true, reasons: [], verifiedEvidence };
}

function buildVerifyContext(scope: ReaderVerifierScope): CanonicalStudyContext {
  const ids = scope.authorizedSourceDocumentIds;
  return {
    schemaVersion: CANONICAL_STUDY_CONTEXT_SCHEMA,
    caseId: scope.caseId,
    studyRunId: "reader-verifier",
    idempotencyKey: "reader-verifier",
    createdAt: new Date(0).toISOString(),
    domainLabel: scope.domainId,
    domainId: scope.domainId,
    domainPackId: "hive.domain.generic",
    domainPackVersion: "0.0.0",
    domainPackVocabulary: {
      entityTypes: [],
      claimTypes: [],
      relationshipTypes: [],
      eventTypes: [],
    },
    sourceDocuments: ids.map((id) => ({
      stagedDocumentId: id,
      sourceDocumentId: id,
      originalFilename: "document",
      sizeBytes: 1,
    })),
    engine1Result: {
      domainLabel: scope.domainId,
      domainResolutionStatus: "resolved",
      groups: [],
      documents: ids.map((id) => ({
        id,
        stagedDocumentId: id,
        filename: "document",
      })),
      relationships: [],
      missingDocuments: [],
    },
    questionSetVersion: "none",
    questionSet: { id: "reader-verifier", questions: [] },
    answerSnapshot: { answers: [] },
    logicalDocuments: [],
    processingPolicy: {
      intentAffectsFacts: false,
      providerId: "reader-verifier",
      providerMode: "fixture",
    },
  } as unknown as CanonicalStudyContext;
}

function orderedWords(words: readonly PageWord[]): PageWord[] {
  return [...words].sort((a, b) => a.seq - b.seq);
}

function seqSpanFromMatch(
  words: readonly PageWord[],
  match: NonNullable<ReturnType<typeof findConsecutiveWordQuote>>,
): { spanStart: number; spanEnd: number; wordStartIndex: number; wordEndIndex: number } {
  const sorted = orderedWords(words);
  const startWord = sorted[match.wordStartIndex]!;
  const endWord = sorted[match.wordEndIndex]!;
  return {
    spanStart: startWord.seq,
    spanEnd: endWord.seq,
    wordStartIndex: match.wordStartIndex,
    wordEndIndex: match.wordEndIndex,
  };
}

function verifyQuoteOnPage(
  documentPages: DocumentPages,
  ev: ReaderFactEvidenceInput,
): { ok: true; location: VerifiedEvidenceLocation } | { ok: false; reason: string } {
  if (documentPages.documentId !== ev.sourceDocumentId) {
    return {
      ok: false,
      reason: `Document identity mismatch for ${ev.sourceDocumentId}.`,
    };
  }
  const page = documentPages.pages.find((p) => p.pageNumber === ev.page);
  if (!page) {
    return {
      ok: false,
      reason: `Page ${ev.page} is out of bounds for document ${ev.sourceDocumentId}.`,
    };
  }
  const quote = ev.quote.trim();
  if (!quote) {
    return { ok: false, reason: "Evidence quote is empty." };
  }
  const match = findConsecutiveWordQuote(page.words, quote);
  if (!match) {
    return {
      ok: false,
      reason: `Quote does not match page ${ev.page} word sequence for ${ev.sourceDocumentId}.`,
    };
  }
  const span = seqSpanFromMatch(page.words, match);
  if (ev.spanStart !== undefined && ev.spanStart !== span.spanStart) {
    return { ok: false, reason: "spanStart does not match the quoted word span." };
  }
  if (ev.spanEnd !== undefined && ev.spanEnd !== span.spanEnd) {
    return { ok: false, reason: "spanEnd does not match the quoted word span." };
  }
  return {
    ok: true,
    location: {
      sourceDocumentId: ev.sourceDocumentId,
      page: ev.page,
      quote,
      spanStart: span.spanStart,
      spanEnd: span.spanEnd,
      wordStartIndex: span.wordStartIndex,
      wordEndIndex: span.wordEndIndex,
    },
  };
}

export async function verifyReaderFact(
  input: ReaderFactVerifyInput,
  deps: ReaderVerifierDeps,
): Promise<ReaderFactVerifyResult> {
  const caseId = input.caseId.trim();
  const userId = input.userId.trim();
  if (!caseId || !userId) {
    return reject(["caseId and userId are required."]);
  }
  if (!input.evidence.length) {
    return reject(["At least one evidence reference is required."]);
  }

  let scope: ReaderVerifierScope | null;
  try {
    scope = await deps.resolveScope(caseId, userId);
  } catch {
    return reject(["Failed to resolve authorized case document scope."]);
  }
  if (!scope) {
    return reject(["Unknown case or unauthorized service context."]);
  }
  if (scope.caseId !== caseId || scope.userId !== userId) {
    return reject(["Case scope mismatch."]);
  }

  const context = buildVerifyContext(scope);
  const knownDocs = documentIdsInContext(context);
  const evidenceRefs: DocumentEvidenceRef[] = input.evidence.map((ev, index) => ({
    id: `reader-ev-${index}`,
    sourceDocumentId: ev.sourceDocumentId,
    sourceType: "document",
    page: ev.page,
    snippet: ev.quote,
    spanStart: ev.spanStart,
    spanEnd: ev.spanEnd,
  }));

  const provIssues = validateDocumentEvidenceRefs(
    context,
    "reader-candidate",
    evidenceRefs,
    knownDocs,
    "readerFact",
    { requireAtLeastOne: true, requireLocator: true },
  );
  if (provIssues.length) {
    return reject(provIssues.map((issue) => issue.message));
  }

  const verified: VerifiedEvidenceLocation[] = [];
  for (const ev of input.evidence) {
    if (!scope.authorizedSourceDocumentIds.includes(ev.sourceDocumentId)) {
      return reject([`Document ${ev.sourceDocumentId} is not authorized for case ${caseId}.`]);
    }

    let documentPages: DocumentPages | null;
    try {
      documentPages = await deps.loadDocumentPages(userId, ev.sourceDocumentId);
    } catch {
      return reject(["Failed to load trusted document pages."]);
    }
    if (!documentPages) {
      return reject([`Trusted document pages unavailable for ${ev.sourceDocumentId}.`]);
    }

    const quoteResult = verifyQuoteOnPage(documentPages, ev);
    if (!quoteResult.ok) {
      return reject([quoteResult.reason]);
    }
    verified.push(quoteResult.location);
  }

  return accept(verified);
}
