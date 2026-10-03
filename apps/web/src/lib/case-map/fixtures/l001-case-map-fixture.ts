import {
  buildCaseProvenanceBundleV3,
  l001LikeCanonicalSnapshot,
  projectCaseMapV3,
  projectProViewV3,
} from "@hiveforyou/core";
import { getCaseMapProjectionByDomainId } from "@hiveforyou/domain-packs";
import type { CaseMap, CaseProvenanceBundle, ProView } from "@hiveforyou/shared/projections";

export function l001CaseMapFixture(): CaseMap {
  const intelligence = l001LikeCanonicalSnapshot();
  return projectCaseMapV3({
    intelligence,
    packProjection: getCaseMapProjectionByDomainId("iep"),
  });
}

export function l001CaseMapViewFixture(): {
  caseMap: CaseMap;
  provenance: CaseProvenanceBundle;
  proView: ProView;
} {
  const intelligence = l001LikeCanonicalSnapshot();
  const caseMap = projectCaseMapV3({
    intelligence,
    packProjection: getCaseMapProjectionByDomainId("iep"),
  });
  const proView = projectProViewV3(intelligence);
  const provenance = buildCaseProvenanceBundleV3({ intelligence, structureMap: null });
  return { caseMap, provenance, proView };
}
