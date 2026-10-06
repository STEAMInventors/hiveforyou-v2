import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { assembleDocument } from "../document/assembly";
import { matchParties } from "./match";
import { linkSectionSubjects } from "./section-subject";
import { extractTier0Structural } from "./structural";
import { restatementFindings } from "../study/primitives/restatement";
import type { Party } from "./types";

const intakeFixtures = join(dirname(fileURLToPath(import.meta.url)), "../../../intake/fixtures/l001");

describe("linkSectionSubjects L001", () => {
  it("groups date of birth across all corpus documents into one restatement fact", () => {
    const snapshotNames = readdirSync(join(intakeFixtures, "document-pages")).filter((n) =>
      n.endsWith(".json"),
    );
    const parties: Party[] = [];
    const statements = [];

    for (const name of snapshotNames) {
      const snap = JSON.parse(readFileSync(join(intakeFixtures, "document-pages", name), "utf8"));
      const pages = snap.documentPages;
      const assembled = assembleDocument(pages);
      const tier0 = extractTier0Structural({ pages, assembled, issuedDate: "2024-11-12" });
      const linked = linkSectionSubjects({ assembled, statements: tier0.statements });
      statements.push(...linked.filter((s) => s.attributeRaw === "Date of Birth"));
      parties.push({
        id: `party:maya carter:${name}`,
        documentId: pages.documentId,
        nameRaw: "Maya Carter",
        nameNorm: "maya carter",
        role: "student",
        evidence: [],
      });
    }

    expect(statements.length).toBe(8);
    expect(statements.every((s) => s.subjectId === "party:maya carter")).toBe(true);
    const partyMatches = matchParties(parties);
    const findings = restatementFindings({ statements, partyMatches });
    const dobFact = findings.find(
      (f) => f.kind === "fact" && f.statementIds.length === 8,
    );
    expect(dobFact).toBeDefined();
  });

  it("groups grade across all corpus documents into one restatement fact (8 sources)", () => {
    const snapshotNames = readdirSync(join(intakeFixtures, "document-pages")).filter((n) =>
      n.endsWith(".json"),
    );
    const parties: Party[] = [];
    const statements = [];

    for (const name of snapshotNames) {
      const snap = JSON.parse(readFileSync(join(intakeFixtures, "document-pages", name), "utf8"));
      const pages = snap.documentPages;
      const assembled = assembleDocument(pages);
      const tier0 = extractTier0Structural({ pages, assembled, issuedDate: "2024-11-12" });
      const linked = linkSectionSubjects({ assembled, statements: tier0.statements });
      statements.push(...linked.filter((s) => s.attributeRaw === "Grade"));
      parties.push({
        id: `party:maya carter:${name}`,
        documentId: pages.documentId,
        nameRaw: "Maya Carter",
        nameNorm: "maya carter",
        role: "student",
        evidence: [],
      });
    }

    expect(statements.length).toBe(8);
    expect(statements.every((s) => s.subjectId === "party:maya carter")).toBe(true);
    expect(statements.every((s) => s.valueNorm === 2 && !s.isEmpty)).toBe(true);
    const partyMatches = matchParties(parties);
    const findings = restatementFindings({ statements, partyMatches });
    const gradeFact = findings.find((f) => f.kind === "fact" && f.statementIds.length === 8);
    expect(gradeFact).toBeDefined();
  });
});
