/**
 * Authoritative Domain Pack registry.
 *
 * This module is the only place that imports pack implementations.
 * Hive Core, Intake, Jev, and the web UI import this package and read
 * generic metadata or snapshots. They do not import a domain pack directly.
 *
 * To add a pack: create domain-packs/<id>/ and register it here.
 */
import { registerDomainPack } from "@hiveforyou/domain-pack";
import { bankruptcyDomainPack } from "@hiveforyou/domain-pack-bankruptcy";
import { iepDomainPack } from "@hiveforyou/domain-pack-iep";
import { medicaidDomainPack } from "@hiveforyou/domain-pack-medicaid";

registerDomainPack(iepDomainPack);
registerDomainPack(medicaidDomainPack);
registerDomainPack(bankruptcyDomainPack);

/** Intake local identity (server-only callers). Not a general-purpose pack import surface. */
export { classifyIepDocumentLocally } from "@hiveforyou/domain-pack-iep";

export {
  clearPackFileCacheForTests,
  loadAllPacks,
  loadCoreDefaults,
  loadPack,
  packsV2Directory,
} from "./packs-v2/load";
export {
  PACK_PRIMITIVE_MAP,
  PACK_STUDY_PRIMITIVES,
  isPackStudyPrimitive,
  type PackPrimitiveMapEntry,
  type PackStudyPrimitive,
} from "./packs-v2/primitives";
export type { PackValidationWarning } from "./packs-v2/errors";
export type { PackValidationError } from "./packs-v2/errors";
export { PackValidationFailedError } from "./packs-v2/errors";
export {
  validateCoreDefaultsDocument,
} from "./packs-v2/validate-core-defaults";
export { validateDomainPackDocument } from "./packs-v2/validate-domain-pack";
export { validateLayersDocument } from "./packs-v2/validate-layers";
export type {
  CoreDefaultsV2,
  DomainPackV2,
  LayersV2,
  PackQuestion,
} from "./packs-v2/types";

export {
  audienceResolutionFromDiscovery,
  discoverPackForDomain,
  domainPackRecordId,
  DOMAIN_PACK_CAPABILITIES,
  ENGINE2_NEUTRAL_VOCABULARY,
  findSharingAudienceRole,
  GENERIC_AUDIENCE_ROLES,
  GENERIC_DISCOVER_GROUPS,
  GENERIC_DOCUMENT_TYPES,
  GENERIC_FAMILY_ROLES,
  getDiscoverPackByDomainId,
  getDiscoverPackByDomainLabel,
  getDomainPackManifest,
  getStudyPackByDomainId,
  getRecognitionVocabularyByDomainId,
  getCaseMapProjectionByDomainId,
  getNarrativeBlockByDomainId,
  getDomainPackByDomainId,
  isTypeInDomainVocabulary,
  listDiscoverDomainPacks,
  listDomainPackManifests,
  listDomainPacksByCapability,
  listRoutableDomainPackManifests,
  listExecutableDomainPackManifests,
  getIntakePackExecutor,
  isDomainPackExecutable,
  listSharingAudienceRoles,
  listSharingAudienceRolesForPack,
  OTHER_AUDIENCE_ROLE_ID,
  OTHER_AUDIENCE_ROLE_LABEL,
  registerDomainPack,
  requireDiscoverPack,
  resolveDomainPackFromDiscoveryLabel,
  serializeRecognitionVocabularyForPrompt,
  STANDARD_RELATIONSHIP_KINDS,
} from "@hiveforyou/domain-pack";

export type {
  AudienceRoleResolutionInput,
  CanonicalStudyPackSnapshot,
  CaseMapProjectionPackSnapshot,
  CaseMapZoneDefinition,
  CaseMapZoneMatch,
  DiscoverCatalogEntry,
  DiscoverDomainPackSnapshot,
  DiscoverMissingExpectation,
  DiscoverRelationshipKind,
  DomainPack,
  DomainPackAudienceRole,
  DomainPackCapability,
  DomainPackManifest,
  DomainPackRegistry,
  NarrativeBlock,
  NarrativeChapter,
  NarrativeCondition,
  NarrativeTemplate,
  DomainPackStatus,
  DomainPackVocabularyTerm,
  RecognitionVocabularyPromptRow,
  ResolvedDomainPack,
  SharingAudienceRoleOption,
} from "@hiveforyou/domain-pack";
