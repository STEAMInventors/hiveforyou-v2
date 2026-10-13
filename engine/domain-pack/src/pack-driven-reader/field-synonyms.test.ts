import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  applyFieldSynonymNormalization,
  collectFieldSynonymValidationErrors,
  PackVocabularySchemaError,
  parseFieldSynonyms,
} from "./field-synonyms.js";
import type { ProposalDomainPack } from "./types.js";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");
const iepPackPath = join(repoRoot, "brain/domain-packs/iep/iep-pack.v0.3.proposed.json");
const iepPack = JSON.parse(readFileSync(iepPackPath, "utf8")) as ProposalDomainPack;

describe("field-synonyms", () => {
  it("parses real IEP pack fieldSynonyms vocabulary (terms shape)", () => {
    const entries = parseFieldSynonyms(iepPack.vocabulary?.fieldSynonyms);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((entry) => entry.terms.length > 0)).toBe(true);
  });

  it("rejects legacy synonyms key with a clear diagnostic", () => {
    const errors = collectFieldSynonymValidationErrors([
      { field: "measure.score_type", synonyms: ["WCPM"] },
    ]);
    expect(errors.some((message) => message.includes('"terms" not "synonyms"'))).toBe(true);
    expect(() =>
      parseFieldSynonyms([{ field: "measure.score_type", synonyms: ["WCPM"] }]),
    ).toThrow(PackVocabularySchemaError);
  });

  it("maps measure score_type terms to declared canonical values", () => {
    const entries = parseFieldSynonyms(iepPack.vocabulary?.fieldSynonyms);
    expect(applyFieldSynonymNormalization("WCPM", entries)).toBe("words_correct_per_minute");
    expect(applyFieldSynonymNormalization("WCPM", entries, "measure.score_type")).toBe(
      "words_correct_per_minute",
    );
  });
});
