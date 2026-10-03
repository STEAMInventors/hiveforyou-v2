import { describe, expect, it } from "vitest";

import {
  decideFromModel,
  signalOnlyDecisions,
  type DocSignals,
} from "../../../scripts/rulebook-audit.decide.ts";

function signals(overrides: Partial<DocSignals> & { docType: string }): DocSignals {
  return {
    slotCount: 1,
    isAnchor: false,
    hasDates: false,
    hasDeadlineSlots: false,
    hasCodedValues: false,
    alreadyHasGuide: false,
    ...overrides,
  };
}

describe("decideFromModel", () => {
  const documentTypes = ["IEP", "Progress report"];
  const slotIds = new Set(["prior.goal.target"]);
  const signalsByDoc = new Map<string, DocSignals>([
    ["IEP", signals({ docType: "IEP", isAnchor: true, slotCount: 2 })],
    ["Progress report", signals({ docType: "Progress report", hasDeadlineSlots: true })],
  ]);

  it("rejects invented docType", () => {
    const { errors } = decideFromModel({
      domain: "iep",
      documentTypes,
      slotIds,
      signalsByDoc,
      existingGuideKinds: new Map(),
      modelDecisions: [
        {
          docType: "Fake doc",
          kind: "none",
          reason: "x",
          proposedSections: [],
          termsNeeded: [],
        },
      ],
    });
    expect(errors.some((e) => e.includes("invented docType"))).toBe(true);
  });

  it("rejects invented slot", () => {
    const { errors } = decideFromModel({
      domain: "iep",
      documentTypes,
      slotIds,
      signalsByDoc,
      existingGuideKinds: new Map(),
      modelDecisions: [
        {
          docType: "IEP",
          kind: "document-guide",
          reason: "x",
          proposedSections: [
            { id: "a", parentTitle: "A", docTitle: "A", slots: ["not.real"] },
          ],
          termsNeeded: [],
        },
      ],
    });
    expect(errors.some((e) => e.includes("invented slot"))).toBe(true);
  });

  it("defaults missing decision to none when no deadline override applies", () => {
    const calmSignals = new Map<string, DocSignals>([
      ["IEP", signals({ docType: "IEP", isAnchor: true, slotCount: 2 })],
      [
        "Progress report",
        signals({ docType: "Progress report", hasDeadlineSlots: false, slotCount: 1 }),
      ],
    ]);
    const { decisions } = decideFromModel({
      domain: "iep",
      documentTypes,
      slotIds,
      signalsByDoc: calmSignals,
      existingGuideKinds: new Map(),
      modelDecisions: [],
    });
    expect(decisions.find((d) => d.docType === "Progress report")?.kind).toBe("none");
    expect(decisions.find((d) => d.docType === "Progress report")?.reason).toBe(
      "no model decision",
    );
  });

  it("overrides deadline doc to notice-guide", () => {
    const { decisions } = decideFromModel({
      domain: "iep",
      documentTypes,
      slotIds,
      signalsByDoc,
      existingGuideKinds: new Map(),
      modelDecisions: [
        {
          docType: "Progress report",
          kind: "none",
          reason: "model said none",
          proposedSections: [],
          termsNeeded: [],
        },
      ],
    });
    const pr = decisions.find((d) => d.docType === "Progress report");
    expect(pr?.kind).toBe("notice-guide");
    expect(pr?.overridden).toBe(true);
  });

  it("signal-only fallback on model failure shape", () => {
    const decisions = signalOnlyDecisions(documentTypes, signalsByDoc);
    expect(decisions.find((d) => d.docType === "IEP")?.kind).toBe("document-guide");
    expect(decisions.find((d) => d.docType === "Progress report")?.kind).toBe(
      "notice-guide",
    );
  });
});
