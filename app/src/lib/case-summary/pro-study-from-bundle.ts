import { buildAnatomyPlan, buildDocumentIndex } from "@hiveforyou/core/case-view-plan";
import { buildPackStudyFromCaseProjection } from "@hiveforyou/core/pack-study-from-projection";
import type { Study } from "@hiveforyou/shared/pack-study";
import { domainPackViewConfigForDomainId } from "@hiveforyou/shared/projections";

import type { CaseMapViewBundle } from "@/lib/case-map/case-map-view-bundle";

export function buildStudyFromBundle(bundle: CaseMapViewBundle): Study | null {
  if (!bundle.caseView || !bundle.canonicalSnapshot) {
    return null;
  }
  const packView = domainPackViewConfigForDomainId(bundle.canonicalSnapshot.domainId);
  const docIndex = buildDocumentIndex(bundle.caseView.documents);
  const anatomy = buildAnatomyPlan({
    v1: bundle.caseView,
    intelligence: bundle.canonicalSnapshot,
    pack: packView,
    docIndex,
  });
  return buildPackStudyFromCaseProjection({
    v1: bundle.caseView,
    intelligence: bundle.canonicalSnapshot,
    anatomy,
    pack: packView,
  });
}
