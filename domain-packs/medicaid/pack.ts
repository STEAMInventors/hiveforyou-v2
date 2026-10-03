import {
  domainPackRecordId,
  genericNarrativeBlock,
  genericProConfig,
  genericStoryConfig,
  type DomainPack,
} from "@hiveforyou/domain-pack";

import { MEDICAID_DOCUMENT_TYPES } from "./document-types.ts";
import { medicaidManifest } from "./manifest";
import { medicaidRulebook } from "./rulebook/index.ts";
import { MEDICAID_RULEBOOK_SLOT_CATALOG } from "./rulebook-slots.ts";

export const medicaidDomainPack = {
  manifest: medicaidManifest,
  narrative: genericNarrativeBlock(),
  story: genericStoryConfig("Notice of Action"),
  pro: genericProConfig(),
  discover: {
    domainId: medicaidManifest.id,
    domainPackId: domainPackRecordId(medicaidManifest.id),
    domainPackVersion: medicaidManifest.version,
    domainLabel: "Medicaid",
    groups: [],
    documentTypes: [...MEDICAID_DOCUMENT_TYPES],
    familyRoles: [],
    relationshipKinds: [],
    catalog: [],
    missingExpectations: [],
  },
  rulebookSlotCatalog: [...MEDICAID_RULEBOOK_SLOT_CATALOG],
  rulebook: medicaidRulebook,
} satisfies DomainPack;
