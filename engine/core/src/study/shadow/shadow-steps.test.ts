import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { CallModel } from "../../model/call-model";
import { runShadowStudy } from "./run-shadow-study";
import { shadowAssembleDocument } from "./shadow-steps";

const intakeFixtures = join(import.meta.dirname, "../../../../intake/fixtures/l001");

function fakeCallModel(): CallModel {
  let call = 0;
  return async () => {
    call += 1;
    const profile = {
      kind: "iep",
      purpose: "planning",
      periodFrom: null,
      periodTo: null,
      requests: [],
      parties: [],
      references: [],
      terms: [],
    };
    const payload = call === 1 ? profile : { statements: [] };
    return {
      outputText: JSON.stringify(payload),
      usage: { inputTokens: 1, outputTokens: 1 },
    };
  };
}

describe("shadowAssembleDocument", () => {
  it("assembles L001 initial IEP snapshot without tier1", () => {
    const snap = JSON.parse(
      readFileSync(join(intakeFixtures, "document-pages/08_initial_iep.json"), "utf8"),
    );
    const { tier0Statements } = shadowAssembleDocument(snap.documentPages);
    expect(tier0Statements.length).toBeGreaterThan(0);
  });
});

describe("runShadowStudy stepped parity", () => {
  it("runs with fake CallModel on one L001 document", async () => {
    const snap = JSON.parse(
      readFileSync(join(intakeFixtures, "document-pages/08_initial_iep.json"), "utf8"),
    );
    const result = await runShadowStudy({
      documents: [
        {
          pages: snap.documentPages,
          recoveredPages: [],
        },
      ],
      callModel: fakeCallModel(),
      model: "fixture",
    });
    expect(result.statements.length).toBeGreaterThan(0);
    expect(result.usage.tier1InputTokens).toBeGreaterThan(0);
  });
});
