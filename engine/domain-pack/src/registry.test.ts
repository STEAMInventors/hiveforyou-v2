import { describe, expect, it } from "vitest";

import {
  createDomainPackRegistry,
  domainPackRecordId,
  genericNarrativeBlock,
  genericProConfig,
  genericStoryConfig,
} from "./index";
import type { CanonicalStudyPackSnapshot, DomainPack, StudyAgentInstructions } from "./types";

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

describe("StudyAgentInstructions contract", () => {
  it("accepts a complete agents block on a study pack snapshot", () => {
    const agents: StudyAgentInstructions = {
      intake: "intake instructions",
      reader: "reader instructions",
      investigator: "investigator instructions",
      writer: "writer instructions",
    };

    const snapshot: CanonicalStudyPackSnapshot = {
      domainId: "domain",
      domainPackId: "pack",
      domainPackVersion: "0.0.0",
      domainLabel: "Label",
      vocabulary: {
        entityTypes: [],
        claimTypes: [],
        relationshipTypes: [],
        eventTypes: [],
      },
      agents,
    };

    expect(snapshot.agents?.reader).toBe("reader instructions");
  });
});

// Compile-time: partial agent definitions must not typecheck.
// @ts-expect-error StudyAgentInstructions requires all four roles
const _rejectPartialAgents: StudyAgentInstructions = { intake: "only intake" };

const _rejectPartialOnSnapshot: CanonicalStudyPackSnapshot = {
  domainId: "domain",
  domainPackId: "pack",
  domainPackVersion: "0.0.0",
  domainLabel: "Label",
  vocabulary: {
    entityTypes: [],
    claimTypes: [],
    relationshipTypes: [],
    eventTypes: [],
  },
  // @ts-expect-error agents on snapshot must be complete when provided
  agents: { intake: "only intake" },
};
