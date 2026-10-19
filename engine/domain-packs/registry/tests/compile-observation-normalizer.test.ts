import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { compileDeclarativeObservationNormalizer } from "../declarative/compile-observation-normalizer.js";
import { loadDeclarativePackFromRoot } from "../declarative/load-raw-pack.js";
import { defaultDeclarativePackRepoRoot } from "../declarative/repo-root.js";

const REPO_ROOT = defaultDeclarativePackRepoRoot();

describe("compileDeclarativeObservationNormalizer", () => {
  it("maps explicit pack fact type ids and legacy construct measures", () => {
    const raw = loadDeclarativePackFromRoot(
      join(REPO_ROOT, "engine/domain-packs/_fixtures/synthetic-declarative/v0.1.0"),
    );
    const normalizer = compileDeclarativeObservationNormalizer(raw);
    expect(normalizer.resolvePredicateTypeId({ factTypeId: "entity.name" })).toEqual({
      ok: true,
      predicateTypeId: "entity.name",
    });
    expect(
      normalizer.resolvePredicateTypeId({
        construct: { measure: "entity.name" },
        value: { kind: "text", text: "Acme" },
      }),
    ).toEqual({ ok: true, predicateTypeId: "entity.name" });
  });

  it("uses domain-neutral legacy bridge for IEP pack reader constructs", () => {
    const raw = loadDeclarativePackFromRoot(join(REPO_ROOT, "engine/domain-packs/iep/v0.2.1"));
    const normalizer = compileDeclarativeObservationNormalizer(raw);
    const resolved = normalizer.resolvePredicateTypeId({
      construct: { measure: "reading fluency", task: "oral" },
      modality: "observed",
      value: { kind: "quantity", amount: 42 },
    });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.predicateTypeId.startsWith("legacy.reader.quantity.")).toBe(true);
    }
  });
});
