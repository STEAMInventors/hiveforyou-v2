import { describe, expect, it } from "vitest";

import { IEP_DISCOVER_PACK } from "./discover-pack";
import {
  GENERIC_AUDIENCE_ROLES,
  IEP_AUDIENCE_ROLES,
  OTHER_AUDIENCE_ROLE_ID,
  listSharingAudienceRolesForPack,
} from "./audience-role-catalog";
import {
  audienceResolutionFromDiscovery,
  listSharingAudienceRoles,
} from "./audience-roles";

describe("sharing audience roles", () => {
  it("uses a small generic list before domain resolution", () => {
    const roles = listSharingAudienceRoles({ domainResolved: false, domainId: "iep" });
    expect(roles.map((role) => role.roleId)).toEqual([
      ...GENERIC_AUDIENCE_ROLES.map((role) => role.roleId),
      OTHER_AUDIENCE_ROLE_ID,
    ]);
    expect(roles.every((role) => role.domainPackId === null && role.domainPackVersion === null)).toBe(
      true,
    );
    expect(roles.some((role) => role.label === "School/team")).toBe(false);
    expect(roles.find((role) => role.roleId === OTHER_AUDIENCE_ROLE_ID)?.allowsFreeText).toBe(true);
  });

  it("renders IEP pack roles once that domain is resolved", () => {
    const roles = listSharingAudienceRoles({
      domainResolved: true,
      domainId: "iep",
      domainLabel: IEP_DISCOVER_PACK.domainLabel,
    });
    expect(roles.map((role) => role.roleId)).toEqual([
      ...IEP_AUDIENCE_ROLES.map((role) => role.roleId),
      OTHER_AUDIENCE_ROLE_ID,
    ]);
    expect(roles[0]).toMatchObject({
      roleId: "school_team",
      label: "School/team",
      domainPackId: "hive.domain.iep",
      domainPackVersion: IEP_DISCOVER_PACK.domainPackVersion,
      allowsFreeText: false,
    });
    expect(roles.at(-1)).toMatchObject({
      roleId: OTHER_AUDIENCE_ROLE_ID,
      label: "Other",
      domainPackId: "hive.domain.iep",
      domainPackVersion: IEP_DISCOVER_PACK.domainPackVersion,
      allowsFreeText: true,
    });
  });

  it("resolves pack roles from a validated domain label", () => {
    const roles = listSharingAudienceRoles({
      domainResolved: true,
      domainLabel: "Special education records",
    });
    expect(roles.some((role) => role.roleId === "attorney")).toBe(true);
  });

  it("keeps the generic list for provisional or unknown domains", () => {
    const provisional = listSharingAudienceRoles(
      audienceResolutionFromDiscovery({
        documentDiscovery: {
          domainResolutionStatus: "provisional",
          domainLabel: "Special education records",
        },
      }),
    );
    expect(provisional.some((role) => role.roleId === "school_team")).toBe(false);

    const unknown = listSharingAudienceRoles({
      domainResolved: true,
      domainId: "medicaid",
      domainLabel: "Medicaid",
    });
    expect(unknown.map((role) => role.roleId)).toEqual(
      listSharingAudienceRoles({ domainResolved: false }).map((role) => role.roleId),
    );
  });

  it("falls back when a resolved pack omits audience roles", () => {
    const roles = listSharingAudienceRolesForPack({
      domainPackId: "hive.domain.example",
      domainPackVersion: "1.0.0",
    });
    expect(roles.map((role) => role.label)).toEqual([
      ...GENERIC_AUDIENCE_ROLES.map((role) => role.label),
      "Other",
    ]);
    expect(roles.every((role) => role.domainPackVersion === null)).toBe(true);
  });

  it("reads resolved structure-map domain identity", () => {
    const resolution = audienceResolutionFromDiscovery({
      structureMap: {
        domainResolution: {
          status: "RESOLVED",
          domainLabel: "Special education records",
          domainId: "iep",
          domainPackId: "hive.domain.iep",
          domainPackVersion: "0.0.0-scaffold",
        },
      },
      documentDiscovery: {
        domainResolutionStatus: "provisional",
        domainLabel: "Something else",
      },
    });
    expect(listSharingAudienceRoles(resolution).some((role) => role.roleId === "advocate")).toBe(
      true,
    );
  });
});
