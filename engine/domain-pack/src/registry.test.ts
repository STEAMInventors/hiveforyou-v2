import { describe, expect, it } from "vitest";

import {
  createDomainPackRegistry,
  domainPackRecordId,
  genericNarrativeBlock,
  genericProConfig,
  genericStoryConfig,
} from "./index";
import type { DomainPack } from "./types";

const samplePack: DomainPack = {
  manifest: {
    id: "example",
    name: "Example",
    description: "Example pack used by the registry test.",
    version: "1.0.0",
    status: "certified",
    capabilities: ["intake.work-purpose"],
  },
  narrative: genericNarrativeBlock(),
  story: genericStoryConfig(),
  pro: genericProConfig(),
};

describe("domain pack registry", () => {
  it("exposes manifest metadata and an empty discover scaffold when a pack defines no rules", () => {
    const registry = createDomainPackRegistry();
    registry.register(samplePack);

    expect(registry.listManifests()).toEqual([
      {
        id: "example",
        name: "Example",
        description: "Example pack used by the registry test.",
        version: "1.0.0",
        status: "certified",
        capabilities: ["intake.work-purpose"],
      },
    ]);
    expect(registry.listByCapability("intake.work-purpose").map((pack) => pack.id)).toEqual([
      "example",
    ]);
    expect(registry.listByCapability("discover")).toEqual([]);

    const discover = registry.getDiscoverPackByDomainId("example");
    expect(discover).toMatchObject({
      domainId: "example",
      domainPackId: domainPackRecordId("example"),
      domainPackVersion: "1.0.0",
      domainLabel: "Example",
      documentTypes: ["Document (unclassified)"],
      familyRoles: ["Uploaded file"],
      catalog: [],
      missingExpectations: [],
    });
  });

  it("builds an unregistered scaffold without treating it as a certified pack", () => {
    const registry = createDomainPackRegistry();
    const tax = registry.discoverPackForDomain("tax", "Tax");
    expect(tax.domainId).toBe("tax");
    expect(tax.domainLabel).toBe("Tax");
    expect(tax.domainPackVersion).toBe("none");
    expect(tax.catalog).toEqual([]);
    expect(registry.getManifest("tax")).toBeNull();
  });

  it("rejects a discover snapshot whose identity does not match the manifest", () => {
    const registry = createDomainPackRegistry();
    expect(() =>
      registry.register({
        manifest: samplePack.manifest,
        discover: {
          domainId: "other",
          domainPackId: domainPackRecordId("example"),
          domainPackVersion: "1.0.0",
          domainLabel: "Example",
          groups: [],
          documentTypes: [],
          familyRoles: [],
          relationshipKinds: [],
          catalog: [],
          missingExpectations: [],
        },
      }),
    ).toThrow(/domainId/);
  });
});
