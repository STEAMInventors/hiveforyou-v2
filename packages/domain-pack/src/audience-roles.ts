import type { DocumentDiscoveryResult } from "@hiveforyou/shared/discovery";
import type { StructureMap } from "@hiveforyou/shared/discover";

import { getDiscoverPackByDomainId, getDiscoverPackByDomainLabel } from "./registry";
import type { DomainPackAudienceRole } from "./types";

export type { DomainPackAudienceRole } from "./types";

export const OTHER_AUDIENCE_ROLE_ID = "other";
export const OTHER_AUDIENCE_ROLE_LABEL = "Other";

/** Domain-agnostic choices used only before domain resolution, or when a resolved pack defines none. */
export const GENERIC_AUDIENCE_ROLES: readonly DomainPackAudienceRole[] = [
  { roleId: "generic.professional", label: "Professional" },
  { roleId: "generic.advisor", label: "Advisor" },
  { roleId: "generic.family", label: "Family or caregiver" },
];

export type SharingAudienceRoleOption = {
  roleId: string;
  label: string;
  domainPackId: string | null;
  domainPackVersion: string | null;
  allowsFreeText: boolean;
};

type AudiencePackRef = {
  domainPackId: string;
  domainPackVersion: string;
  audienceRoles?: readonly DomainPackAudienceRole[];
};

function genericOptions(): SharingAudienceRoleOption[] {
  return [
    ...GENERIC_AUDIENCE_ROLES.map((role) => ({
      roleId: role.roleId,
      label: role.label,
      domainPackId: null,
      domainPackVersion: null,
      allowsFreeText: false,
    })),
    {
      roleId: OTHER_AUDIENCE_ROLE_ID,
      label: OTHER_AUDIENCE_ROLE_LABEL,
      domainPackId: null,
      domainPackVersion: null,
      allowsFreeText: true,
    },
  ];
}

function isPackAudienceRole(role: DomainPackAudienceRole): boolean {
  const roleId = role.roleId.trim();
  const label = role.label.trim();
  return (
    roleId.length > 0 &&
    label.length > 0 &&
    roleId !== OTHER_AUDIENCE_ROLE_ID &&
    !roleId.startsWith("generic.")
  );
}

/**
 * Pack roles when the pack defines them; otherwise the generic fallback.
 * OTHER is always last and is the only free-text choice.
 */
export function listSharingAudienceRolesForPack(
  pack: AudiencePackRef | null,
): SharingAudienceRoleOption[] {
  if (!pack) {
    return genericOptions();
  }
  const seen = new Set<string>();
  const roles: SharingAudienceRoleOption[] = [];
  for (const role of pack.audienceRoles ?? []) {
    if (!isPackAudienceRole(role) || seen.has(role.roleId)) {
      continue;
    }
    seen.add(role.roleId);
    roles.push({
      roleId: role.roleId,
      label: role.label.trim(),
      domainPackId: pack.domainPackId,
      domainPackVersion: pack.domainPackVersion,
      allowsFreeText: false,
    });
  }
  if (roles.length === 0) {
    return genericOptions();
  }
  roles.push({
    roleId: OTHER_AUDIENCE_ROLE_ID,
    label: OTHER_AUDIENCE_ROLE_LABEL,
    domainPackId: pack.domainPackId,
    domainPackVersion: pack.domainPackVersion,
    allowsFreeText: true,
  });
  return roles;
}

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
    !byId && input.domainLabel?.trim() ? getDiscoverPackByDomainLabel(input.domainLabel) : null;
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
