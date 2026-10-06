import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { assembleDocument } from "../document/assembly";
import { extractTier0Structural } from "./structural";

const intakeFixtures = join(dirname(fileURLToPath(import.meta.url)), "../../../intake/fixtures/l001");

describe("extractTier0Structural L001", () => {
  it("extracts deterministic field statements from 08_initial_iep", () => {
    const snap = JSON.parse(
      readFileSync(join(intakeFixtures, "document-pages/08_initial_iep.json"), "utf8"),
    );
    const pages = snap.documentPages;
    const assembled = assembleDocument(pages);
    const { statements } = extractTier0Structural({ pages, assembled, issuedDate: "2024-11-12" });
    expect(statements.length).toBeGreaterThan(5);
    const dob = statements.find((s) => s.attributeRaw === "Date of Birth");
    expect(dob?.valueNorm).toBe("2017-04-18");
    const grade = statements.find((s) => s.attributeRaw === "Grade");
    expect(grade?.valueNorm).toBe(2);
  });
});
