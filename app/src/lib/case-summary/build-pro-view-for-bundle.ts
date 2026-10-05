import { buildProViewModel } from "@hiveforyou/core/pro-view-model";
import type { ProViewModel } from "@hiveforyou/core/pro-view-model/types";
import { getDomainPackByDomainId } from "@hiveforyou/domain-packs";

import type { CaseMapViewBundle } from "@/lib/case-map/case-map-view-bundle";

import type { CaseSummaryModel } from "./case-summary-presentation";
import { documentFactStatsFromCaseView } from "./pro-document-fact-stats";
import { buildStudyFromBundle } from "./pro-study-from-bundle";

export function buildProViewModelForBundle(input: {
  bundle: CaseMapViewBundle;
  summary: Pick<CaseSummaryModel, "documentCount" | "domainLabel">;
  quotesByFactId?: Record<string, string>;
}): ProViewModel | null {
  const { bundle, summary } = input;
  const { caseView, canonicalSnapshot } = bundle;
  if (!caseView || !canonicalSnapshot) {
    return null;
  }
  const pack = getDomainPackByDomainId(canonicalSnapshot.domainId);
  if (!pack) {
    return null;
  }
  const study = buildStudyFromBundle(bundle);
  if (!study) {
    return null;
  }
  const recordStart = caseView.documents
    .map((d) => d.documentDate)
    .filter(Boolean)
    .sort()[0];
  const recordEnd = caseView.documents
    .map((d) => d.documentDate)
    .filter(Boolean)
    .sort()
    .at(-1);
  const recordSpan =
    recordStart && recordEnd ? `${recordStart.slice(0, 7)} – ${recordEnd.slice(0, 7)}` : "";
  const documents = caseView.documents.map((doc) => ({
    sourceDocumentId: doc.sourceDocumentId,
    logicalDocumentId: doc.logicalDocumentId,
    fileName: doc.fileName,
    documentType: doc.documentType,
    documentDate: doc.documentDate,
  }));

  const documentFactStats = documentFactStatsFromCaseView(caseView);

  return buildProViewModel(pack, study, {
    documentCount: summary.documentCount,
    caseTypeLabel: summary.domainLabel.includes("IEP") ? "IEP meeting" : summary.domainLabel,
    recordSpan,
    documents,
    documentFactStats,
    quotesByFactId: input.quotesByFactId,
  });
}
