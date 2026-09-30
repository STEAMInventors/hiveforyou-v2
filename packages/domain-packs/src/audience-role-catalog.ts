/**
 * Audience roles are defined by Domain Packs, or by this fixed generic list
 * before a domain is resolved. A model must not propose or generate them.
 */
export type DomainPackAudienceRole = {
  roleId: string;
  label: string;
};

export const OTHER_AUDIENCE_ROLE_ID = "other";
export const OTHER_AUDIENCE_ROLE_LABEL = "Other";

/** Domain-agnostic choices used only before domain resolution, or when a resolved pack defines none. */
export const GENERIC_AUDIENCE_ROLES: readonly DomainPackAudienceRole[] = [
  { roleId: "generic.professional", label: "Professional" },
  { roleId: "generic.advisor", label: "Advisor" },
  { roleId: "generic.family", label: "Family or caregiver" },
];

export const IEP_AUDIENCE_ROLES: readonly DomainPackAudienceRole[] = [
  { roleId: "school_team", label: "School/team" },
  { roleId: "advocate", label: "Advocate" },
  { roleId: "attorney", label: "Attorney" },
  { roleId: "healthcare_professional", label: "Healthcare professional" },
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
