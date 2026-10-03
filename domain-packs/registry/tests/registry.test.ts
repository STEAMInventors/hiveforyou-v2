import { describe, expect, it } from "vitest";

import { GENERIC_DOCUMENT_TYPES } from "@hiveforyou/domain-pack";

import {
  getDiscoverPackByDomainId,
  getRecognitionVocabularyByDomainId,
  listDomainPackManifests,
  listDomainPacksByCapability,
  requireDiscoverPack,
  resolveDomainPackFromDiscoveryLabel,
} from "../index";

describe("domain pack registry", () => {
  it("registers iep, medicaid, and bankruptcy metadata once", () => {
    expect(listDomainPackManifests().map((pack) => pack.id)).toEqual([
      "iep",
      "medicaid",
      "bankruptcy",
    ]);
    for (const manifest of listDomainPackManifests()) {
      expect(manifest).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
          description: expect.any(String),
          version: expect.any(String),
          status: expect.stringMatching(/scaffold|certified/),
          capabilities: expect.any(Array),
        }),
      );
    }
  });

  it("separates routable and executable lifecycle flags", () => {
    const iep = listDomainPackManifests().find((pack) => pack.id === "iep");
    const medicaid = listDomainPackManifests().find((pack) => pack.id === "medicaid");
    expect(iep?.routable).toBe(true);
    expect(iep?.executable).toBe(true);
    expect(iep?.status).toBe("scaffold");
    expect(medicaid?.routable).toBe(true);
    expect(medicaid?.executable).toBe(false);
  });

  it("offers intake work-purpose packs from the registry", () => {
    expect(listDomainPacksByCapability("intake.work-purpose").map((pack) => pack.name)).toEqual([
      "Special Education / IEP",
      "Medicaid",
      "Bankruptcy",
    ]);
  });

  it("keeps Medicaid and Bankruptcy free of invented document rules", () => {
    for (const domainId of ["medicaid", "bankruptcy"]) {
      const pack = requireDiscoverPack(domainId);
      expect(pack.documentTypes).toEqual([...GENERIC_DOCUMENT_TYPES]);
      expect(pack.catalog).toEqual([]);
      expect(pack.missingExpectations).toEqual([]);
      expect(pack.audienceRoles).toBeUndefined();
    }
  });

  it("resolves the IEP presentation label through the registry", () => {
    const resolved = resolveDomainPackFromDiscoveryLabel("Special education records");
    expect(resolved?.domainId).toBe("iep");
    expect(resolved?.domainPackId).toBe("hive.domain.iep");
    expect(getDiscoverPackByDomainId("iep")?.audienceRoles?.map((role) => role.roleId)).toContain(
      "school_team",
    );
  });

  it("exposes IEP recognition vocabulary for Engine 2", () => {
    const terms = getRecognitionVocabularyByDomainId("iep");
    expect(terms.some((term) => term.termId === "plaafp")).toBe(true);
    expect(getRecognitionVocabularyByDomainId("bankruptcy")).toEqual([]);
  });
});
