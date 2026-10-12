import { describe, expect, it } from "vitest";

import {
  DiscoverDocumentTypeResolutionError,
  resolveProposalDocumentTypeIdFromDiscoverLabel,
} from "./resolve-discover-document-type.js";
import type { ProposalDomainPack } from "./types.js";

const pack: ProposalDomainPack = {
  schemaVersion: "hive.domain-pack.proposal/0.3.0",
  manifest: { id: "iep", version: "0.0.0-test" },
  readingNotes: { global: "", byDocumentType: {} },
  documentTypes: [
    {
      id: "iep.plan",
      label: "Individualized Education Program",
      discoverLabels: ["IEP document"],
      checklist: [],
    },
  ],
  recordTypes: [],
};

describe("resolveProposalDocumentTypeIdFromDiscoverLabel", () => {
  it("resolves primary label and discover alias", () => {
    expect(
      resolveProposalDocumentTypeIdFromDiscoverLabel(pack, "Individualized Education Program"),
    ).toBe("iep.plan");
    expect(resolveProposalDocumentTypeIdFromDiscoverLabel(pack, "iep document")).toBe("iep.plan");
  });

  it("throws on unknown label", () => {
    expect(() => resolveProposalDocumentTypeIdFromDiscoverLabel(pack, "Unknown")).toThrow(
      DiscoverDocumentTypeResolutionError,
    );
  });
});
