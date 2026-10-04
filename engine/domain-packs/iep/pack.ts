import {
  domainPackRecordId,
  STANDARD_RELATIONSHIP_KINDS,
  type DomainPack,
} from "@hiveforyou/domain-pack";

import { classifyLogicalDocumentByFilename } from "./document-interpreter/classify-logical-document";
import { splitLogicalDocuments } from "./document-interpreter/split-logical-documents";
import { iepIntakeExecutor } from "./execute-intake";
import {
  IEP_DISCOVER_CATALOG,
  IEP_DISCOVER_GROUPS,
  IEP_DOCUMENT_TYPES,
  IEP_FAMILY_ROLES,
} from "./document-types";
import { unmetIepEvidenceRequirements } from "./evidence-requirements/completeness";
import { IEP_EVIDENCE_REQUIREMENTS } from "./evidence-requirements/requirements";
import { IEP_INTAKE_QUESTIONS } from "./intake/questions";
import { iepManifest } from "./manifest";
import { IEP_AUDIENCE_ROLES } from "./vocabulary/audience-roles";
import { IEP_CASE_MAP_PROJECTION } from "./case-map/projection-guidance";
import { IEP_FOCUS_CONSTRUCTS } from "./study/focus-constructs";
import { IEP_NARRATIVE_BLOCK } from "./narrative";
import { iepRulebook } from "./rulebook/index";
import { IEP_RULEBOOK_SLOT_CATALOG } from "./rulebook-slots";
import { IEP_PRO_CONFIG } from "./pro";
import { IEP_STORY_CONFIG } from "./story";
import { IEP_STUDY_VOCABULARY, IEP_VOCABULARY } from "./vocabulary/index";

const domainLabel = "Special education records";

export const iepDomainPack = {
  manifest: iepManifest,
  intakeExecutor: iepIntakeExecutor,
  recognitionVocabulary: IEP_VOCABULARY,
  discover: {
    domainId: iepManifest.id,
    domainPackId: domainPackRecordId(iepManifest.id),
    domainPackVersion: iepManifest.version,
    domainLabel,
    groups: IEP_DISCOVER_GROUPS,
    documentTypes: IEP_DOCUMENT_TYPES,
    familyRoles: IEP_FAMILY_ROLES,
    relationshipKinds: [...STANDARD_RELATIONSHIP_KINDS],
    catalog: IEP_DISCOVER_CATALOG,
    missingExpectations: IEP_EVIDENCE_REQUIREMENTS,
    audienceRoles: [...IEP_AUDIENCE_ROLES],
  },
  study: {
    domainId: iepManifest.id,
    domainPackId: domainPackRecordId(iepManifest.id),
    domainPackVersion: iepManifest.version,
    domainLabel,
    vocabulary: IEP_STUDY_VOCABULARY,
    focusConstructs: [...IEP_FOCUS_CONSTRUCTS],
  },
  caseMapProjection: IEP_CASE_MAP_PROJECTION,
  narrative: IEP_NARRATIVE_BLOCK,
  story: IEP_STORY_CONFIG,
  pro: IEP_PRO_CONFIG,
  rulebookSlotCatalog: IEP_RULEBOOK_SLOT_CATALOG,
  rulebook: iepRulebook,
} satisfies DomainPack;

export { classifyIepDocumentLocally } from "./document-interpreter/classify-local";

export const iepDocumentInterpreter = {
  classifyLogicalDocumentByFilename,
  splitLogicalDocuments,
  unmetEvidenceRequirements: unmetIepEvidenceRequirements,
  intakeQuestions: IEP_INTAKE_QUESTIONS,
};
