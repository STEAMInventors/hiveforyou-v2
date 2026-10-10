import type { DocumentPages, PageModel } from "@hiveforyou/core/document/page-model";

import type { TrustedDocumentPageBundle } from "./load-trusted-document-pages.js";

export type StudyReaderPageWordWire = {
  seq: number;
  text: string;
};

export type StudyReaderPageWire = {
  pageNumber: number;
  words: StudyReaderPageWordWire[];
};

export type StudyReaderDocumentWire = {
  sourceDocumentId: string;
  pages: StudyReaderPageWire[];
};

export type StudyReaderLimitsWire = {
  maxToolCalls: number;
  maxReasoningSteps: number;
};

export type StudyReaderRequestWire = {
  caseId: string;
  userId: string;
  domainId: string;
  studyRunId: string;
  attemptId: string;
  documents: StudyReaderDocumentWire[];
  limits?: StudyReaderLimitsWire;
};

function pageToWire(page: PageModel, sourceDocumentId: string): StudyReaderPageWire {
  return {
    pageNumber: page.pageNumber,
    words: page.words.map((word) => ({
      seq: word.seq,
      text: word.text,
    })),
  };
}

export function documentPagesToReaderDocument(
  sourceDocumentId: string,
  documentPages: DocumentPages,
): StudyReaderDocumentWire {
  return {
    sourceDocumentId,
    pages: documentPages.pages.map((page) => pageToWire(page, sourceDocumentId)),
  };
}

export function buildStudyReaderRequestFromTrustedPages(input: {
  caseId: string;
  userId: string;
  domainId: string;
  studyRunId: string;
  attemptId: string;
  bundles: TrustedDocumentPageBundle[];
  limits?: StudyReaderLimitsWire;
}): StudyReaderRequestWire {
  const documents = input.bundles.map((bundle) =>
    documentPagesToReaderDocument(bundle.sourceDocumentId, bundle.documentPages),
  );
  return {
    caseId: input.caseId,
    userId: input.userId,
    domainId: input.domainId,
    studyRunId: input.studyRunId,
    attemptId: input.attemptId,
    documents,
    limits: input.limits,
  };
}
