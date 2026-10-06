import { describe, expect, it } from "vitest";

import type { AssembledDocument } from "../document/assembly";
import type { CallModel } from "../model/call-model";
import { runTier1Semantic } from "./semantic";

const assembled: AssembledDocument = {
  documentId: "doc.pdf",
  blocks: [
    {
      id: "b1",
      documentId: "doc.pdf",
      pageNumber: 1,
      seq: 1,
      kind: "line",
      text: "Maya has reading fluency concerns.",
      segments: [
        {
          text: "Maya has reading fluency concerns.",
          bbox: [0, 0, 10, 10],
          wordRange: [0, 6],
        },
      ],
      bbox: [0, 0, 10, 10],
      parentBlockId: null,
      isEmpty: false,
    },
  ],
  cells: [],
  instances: [],
};

describe("runTier1Semantic", () => {
  it("uses fake CallModel and restores masked quotes", async () => {
    const labels: Array<string | undefined> = [];
    const callModel: CallModel = async (req) => {
      labels.push(req.logLabel);
      if (req.textFormat.type === "json_schema" && req.textFormat.name === "atom_document_profile") {
        return {
          outputText: JSON.stringify({
            kind: "iep",
            purpose: null,
            issuedDate: "2024-11-12",
            periodFrom: null,
            periodTo: null,
            parties: [{ name: "Maya Carter", role: "student", quote: "Maya Carter" }],
            references: [],
            requests: [],
            terms: [],
          }),
        };
      }
      return {
        outputText: JSON.stringify({
          statements: [
            {
              subjectLabel: "Maya Carter",
              attributeRaw: "reading concern",
              attributeKey: null,
              valueRaw: "fluency",
              force: "observes",
              appliesFrom: "2024-09-01",
              appliesTo: null,
              conditionRaw: null,
              quote: "reading fluency concerns",
            },
          ],
        }),
      };
    };

    const result = await runTier1Semantic({
      assembled,
      callModel,
      model: "fixture",
    });
    expect(result.profile.kind).toBe("iep");
    expect(result.profile.purpose).toBeNull();
    expect(result.statements.length).toBeGreaterThan(0);
    expect(result.statements[0]!.evidence[0]!.quote).toContain("fluency");
    expect(result.statements[0]!.appliesFrom).toBe("2024-09-01");
    expect(result.statements[0]!.appliesTo).toBeNull();
    expect(result.statements[0]!.conditionRaw).toBeNull();
    expect(result.statements[0]!.attributeKey).toBeNull();
    expect(labels).toEqual(["hive-atoms", "hive-atoms"]);
  });
});
