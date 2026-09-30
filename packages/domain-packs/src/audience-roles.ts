import type { DocumentDiscoveryResult } from "@hiveforyou/shared/discovery";
import type { StructureMap } from "@hiveforyou/shared/discover";

import {
  listSharingAudienceRolesForPack,
  type SharingAudienceRoleOption,
} from "./audience-role-catalog";
import { getDiscoverPackByDomainId, getDiscoverPackByDomainLabel } from "./discover-pack";

export type AudienceRoleResolutionInput = {
  /** True only after validated domain resolution. Provisional labels stay on the generic list. */
  domainResolved: boolean;
  domainId?: string | null;
  domainLabel?: string | null;
};

export function audienceResolutionFromDiscovery(input: {
  structureMap?: Pick<StructureMap, "domainResolution"> | null;
  documentDiscovery?: Pick<DocumentDiscoveryResult, "domainResolutionStatus" | "domainLabel"> | null;
}): AudienceRoleResolutionInput {
  const structure = input.structureMap?.domainResolution;
  if (structure?.status === "RESOLVED" || structure?.status === "SINGLE_DOMAIN") {
    return {
      domainResolved: true,
      domainId: structure.domainId,
      domainLabel: structure.domainLabel,
    };
  }
  const discovery = input.documentDiscovery;
  if (discovery?.domainResolutionStatus === "resolved" && discovery.domainLabel.trim()) {
    return {
      domainResolved: true,
      domainLabel: discovery.domainLabel,
    };
  }
  return { domainResolved: false };
}

/** Resolved pack roles, or the generic fallback before resolution and when a pack defines none. */
export function listSharingAudienceRoles(
  input: AudienceRoleResolutionInput,
): SharingAudienceRoleOption[] {
  if (!input.domainResolved) {
    return listSharingAudienceRolesForPack(null);
  }
  const domainId = input.domainId?.trim();
  const byId = domainId ? getDiscoverPackByDomainId(domainId) : null;
  const byLabel =
    !byId && input.domainLabel?.trim()
      ? getDiscoverPackByDomainLabel(input.domainLabel)
      : null;
  return listSharingAudienceRolesForPack(byId ?? byLabel);
}

export function findSharingAudienceRole(
  input: AudienceRoleResolutionInput,
  roleId: string,
): SharingAudienceRoleOption | null {
  const normalized = roleId.trim();
  if (!normalized) {
    return null;
  }
  return listSharingAudienceRoles(input).find((role) => role.roleId === normalized) ?? null;
}
