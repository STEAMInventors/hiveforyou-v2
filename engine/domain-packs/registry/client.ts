/**
 * Browser-safe Domain Pack registry bootstrap.
 * Registers pack implementations without pulling declarative compilation or Node filesystem APIs.
 */
import { registerDomainPack } from "@hiveforyou/domain-pack";
import { bankruptcyDomainPack } from "@hiveforyou/domain-pack-bankruptcy";
import { iepDomainPack } from "@hiveforyou/domain-pack-iep";
import { medicaidDomainPack } from "@hiveforyou/domain-pack-medicaid";

registerDomainPack(iepDomainPack);
registerDomainPack(medicaidDomainPack);
registerDomainPack(bankruptcyDomainPack);

export {
  audienceResolutionFromDiscovery,
  findSharingAudienceRole,
  listSharingAudienceRoles,
  listSharingAudienceRolesForPack,
} from "@hiveforyou/domain-pack";

export type {
  AudienceRoleResolutionInput,
  SharingAudienceRoleOption,
} from "@hiveforyou/domain-pack";
