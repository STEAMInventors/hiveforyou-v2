import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { parse, stringify } from "yaml";
import { describe, expect, it } from "vitest";

import { PackValidationFailedError } from "../packs-v2/errors.ts";
import { PACK_STUDY_PRIMITIVES } from "../packs-v2/primitives.ts";
import {
  clearPackFileCacheForTests,
  loadAllPacks,
  loadCoreDefaults,
  loadPack,
  packsV2Directory,
} from "../packs-v2/load.ts";
import { validateCoreDefaultsDocument } from "../packs-v2/validate-core-defaults.ts";
import { validateDomainPackDocument } from "../packs-v2/validate-domain-pack.ts";
import { validateLayersDocument } from "../packs-v2/validate-layers.ts";

const packsV2Dir = packsV2Directory();

function loadYamlFile(name: string): unknown {
  return parse(readFileSync(join(packsV2Dir, name), "utf8"));
}

function validPackSkeleton(): Record<string, unknown> {
  return {
    pack: "test",
    version: "1",
    pro: "none",
    anchor: { name: "a", fallback: "b" },
    jurisdiction_overlay: "none",
    questions: [
      {
        id: "q.one",
        ask: "Ask?",
        primitives: ["coverage"],
        weight: 50,
      },
    ],
    behaviors: {},
    views: {
      customer: { tone: "plain", forbidden: ["bad"], sections: ["s"] },
      pro: { templates: {}, export: ["csv"] },
    },
  };
}

function expectError(
  errors: { file: string; path: string; message: string }[],
  file: string,
  path: string,
): void {
  expect(errors.some((e) => e.file === file && e.path === path)).toBe(true);
}

describe("packs-v2 validation", () => {
  it("validateDomainPackDocument is pure (no fs/yaml imports in validate modules)", () => {
    const validateDir = join(dirname(fileURLToPath(import.meta.url)), "../packs-v2");
    const files = [
      "validate-domain-pack.ts",
      "validate-behaviors.ts",
      "validate-core-defaults.ts",
      "validate-layers.ts",
      "validate-legal-numbers.ts",
      "errors.ts",
      "primitives.ts",
      "util.ts",
      "types.ts",
    ];
    for (const file of files) {
      const text = readFileSync(join(validateDir, file), "utf8");
      expect(text, file).not.toMatch(/from\s+["']node:fs["']/);
      expect(text, file).not.toMatch(/from\s+["']yaml["']/);
    }
  });

  it("packs-v2 types subpath has no fs/yaml dependency edge", () => {
    const text = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../packs-v2/types.ts"),
      "utf8",
    );
    expect(text).not.toMatch(/node:fs/);
    expect(text).not.toMatch(/yaml/);
  });

  it("loadPack reads YAML from disk and returns typed pack", () => {
    const pack = loadPack("iep");
    expect(pack.pack).toBe("iep");
    expect(pack.version).toBe("0.5");
  });

  it("loadPack(core_defaults) loads core_default_questions.yaml", () => {
    const pack = loadPack("core_defaults");
    expect(pack.pack).toBe("core_defaults");
    expect(pack.questions.length).toBeGreaterThan(0);
  });

  it("loadCoreDefaults loads core_defaults.yaml behaviors file", () => {
    const core = loadCoreDefaults();
    expect(core.behaviors["person.name"]).toBeDefined();
  });

  it("loadAllPacks returns three domain packs", () => {
    const packs = loadAllPacks();
    expect(packs.map((p) => p.pack).sort()).toEqual(["bankruptcy", "iep", "long_term_care_medicaid"]);
  });

  it("loadPack uses cache until file hash changes", () => {
    clearPackFileCacheForTests();
    const dir = mkdtempSync(join(tmpdir(), "packs-v2-cache-"));
    const filename = "iep.yaml";
    writeFileSync(join(dir, filename), readFileSync(join(packsV2Dir, filename)));
    const first = loadPack("iep", dir);
    const mutated = readFileSync(join(packsV2Dir, filename), "utf8").replace("version: 0.5", "version: 0.6");
    writeFileSync(join(dir, filename), mutated);
    clearPackFileCacheForTests();
    const second = loadPack("iep", dir);
    expect(second.version).toBe("0.6");
    expect(first.version).toBe("0.5");
  });

  it("rejects unknown top-level pack key", () => {
    const doc = validPackSkeleton();
    doc.extra = true;
    const r = validateDomainPackDocument(doc, "bad.yaml");
    expect(r.ok).toBe(false);
    if (!r.ok) expectError(r.errors, "bad.yaml", "extra");
  });

  it("normalizes numeric version to string", () => {
    const doc = validPackSkeleton();
    doc.version = 1.2;
    const r = validateDomainPackDocument(doc, "v.yaml");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pack.version).toBe("1.2");
  });

  it("loads iep, medicaid, bankruptcy, core_default_questions with zero errors", () => {
    for (const file of ["iep.yaml", "medicaid.yaml", "bankruptcy.yaml", "core_default_questions.yaml"]) {
      const r = validateDomainPackDocument(loadYamlFile(file), file);
      expect(r.ok, file).toBe(true);
    }
  });

  it("loadCoreDefaults returns behaviors with zero errors", () => {
    const r = validateCoreDefaultsDocument(loadYamlFile("core_defaults.yaml"), "core_defaults.yaml");
    expect(r.ok).toBe(true);
  });

  it("validateLayersDocument accepts committed layers.yaml with zero errors", () => {
    const doc = loadYamlFile("layers.yaml");
    const r = validateLayersDocument(doc, "layers.yaml");
    expect(r.ok).toBe(true);
  });

  it("validateLayersDocument rejects numeric case_layer.anchor.value", () => {
    const doc = loadYamlFile("layers.yaml") as Record<string, unknown>;
    const caseLayer = { ...(doc.case_layer as Record<string, unknown>) };
    caseLayer.anchor = { value: 14, source: "intent", status: "confirmed" };
    const r = validateLayersDocument({ ...doc, case_layer: caseLayer }, "layers.yaml");
    expect(r.ok).toBe(false);
    if (!r.ok) expectError(r.errors, "layers.yaml", "case_layer.anchor.value");
  });

  it("accepts requires string and structured when/overlay forms in iep required_parts", () => {
    const iep = loadYamlFile("iep.yaml") as Record<string, unknown>;
    const questions = iep.questions as unknown[];
    const required = questions.find((q) => (q as { id: string }).id === "q.required_parts");
    expect(required).toBeDefined();
    const r = validateDomainPackDocument(iep, "iep.yaml");
    expect(r.ok).toBe(true);
  });

  it("rejects unknown primitive", () => {
    const doc = validPackSkeleton();
    (doc.questions as unknown[])[0] = {
      id: "q.one",
      ask: "A?",
      primitives: ["not_a_primitive"],
      weight: 1,
    };
    const r = validateDomainPackDocument(doc, "f.yaml");
    expect(r.ok).toBe(false);
    if (!r.ok) expectError(r.errors, "f.yaml", "questions[0].primitives[0]");
  });

  it("rejects number in window", () => {
    const doc = validPackSkeleton();
    (doc.questions as unknown[])[0] = {
      id: "q.one",
      ask: "A?",
      primitives: ["window_filter"],
      weight: 1,
      window: { from: "jurisdiction_overlay", key: "k", months: 6 },
    };
    const r = validateDomainPackDocument(doc, "f.yaml");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.path === "questions[0].window.months")).toBe(true);
    }
  });

  it("rejects numeric string in when", () => {
    const doc = validPackSkeleton();
    (doc.questions as unknown[])[0] = {
      id: "q.one",
      ask: "A?",
      primitives: ["requirement_coverage"],
      weight: 1,
      requires: [{ my_part: { when: { field: "x", equals: "42" } } }],
    };
    const r = validateDomainPackDocument(doc, "f.yaml");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.path.includes("equals"))).toBe(true);
    }
  });

  it("rejects applies_when on undeclared attribute", () => {
    const doc = validPackSkeleton();
    doc.case_attributes = { stage: { values: ["a"] } };
    (doc.questions as unknown[])[0] = {
      id: "q.one",
      ask: "A?",
      primitives: ["coverage"],
      weight: 1,
      applies_when: { missing_attr: ["a"] },
    };
    const r = validateDomainPackDocument(doc, "f.yaml");
    expect(r.ok).toBe(false);
    if (!r.ok) expectError(r.errors, "f.yaml", "questions[0].applies_when.missing_attr");
  });

  it("rejects applies_when value not in values", () => {
    const doc = validPackSkeleton();
    doc.case_attributes = { stage: { values: ["filed"] } };
    (doc.questions as unknown[])[0] = {
      id: "q.one",
      ask: "A?",
      primitives: ["coverage"],
      weight: 1,
      applies_when: { stage: ["denied"] },
    };
    const r = validateDomainPackDocument(doc, "f.yaml");
    expect(r.ok).toBe(false);
    if (!r.ok) expectError(r.errors, "f.yaml", "questions[0].applies_when.stage[0]");
  });

  it("rejects duplicate question id", () => {
    const doc = validPackSkeleton();
    doc.questions = [
      { id: "q.dup", ask: "A?", primitives: ["coverage"], weight: 1 },
      { id: "q.dup", ask: "B?", primitives: ["coverage"], weight: 2 },
    ];
    const r = validateDomainPackDocument(doc, "f.yaml");
    expect(r.ok).toBe(false);
    if (!r.ok) expectError(r.errors, "f.yaml", "questions[1].id");
  });

  it("rejects unknown question field", () => {
    const doc = validPackSkeleton();
    (doc.questions as unknown[])[0] = {
      id: "q.one",
      ask: "A?",
      primitives: ["coverage"],
      weight: 1,
      not_a_field: true,
    };
    const r = validateDomainPackDocument(doc, "f.yaml");
    expect(r.ok).toBe(false);
    if (!r.ok) expectError(r.errors, "f.yaml", "questions[0].not_a_field");
  });

  it("rejects unknown behavior property", () => {
    const doc = validPackSkeleton();
    doc.behaviors = { "entity.attr": { mystery: true } };
    const r = validateDomainPackDocument(doc, "f.yaml");
    expect(r.ok).toBe(false);
    if (!r.ok) expectError(r.errors, "f.yaml", "behaviors.entity.attr.mystery");
  });

  it("rejects weight 120", () => {
    const doc = validPackSkeleton();
    (doc.questions as unknown[])[0] = {
      id: "q.one",
      ask: "A?",
      primitives: ["coverage"],
      weight: 120,
    };
    const r = validateDomainPackDocument(doc, "f.yaml");
    expect(r.ok).toBe(false);
    if (!r.ok) expectError(r.errors, "f.yaml", "questions[0].weight");
  });

  it("rejects duplicate distinctive document_types across packs", () => {
    const owner = new Map<string, string>();
    const a = validPackSkeleton();
    a.document_types = { distinctive: ["shared_key"], shared: [] };
    validateDomainPackDocument(a, "a.yaml", { distinctiveOwner: owner });
    const b = validPackSkeleton();
    b.document_types = { distinctive: ["shared_key"], shared: [] };
    const r = validateDomainPackDocument(b, "b.yaml", { distinctiveOwner: owner });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.message.includes("a.yaml"))).toBe(true);
    }
  });

  it("rejects document_types key not matching pattern", () => {
    const doc = validPackSkeleton();
    doc.document_types = { distinctive: ["Bad-Key"], shared: [] };
    const r = validateDomainPackDocument(doc, "f.yaml");
    expect(r.ok).toBe(false);
    if (!r.ok) expectError(r.errors, "f.yaml", "document_types.distinctive[0]");
  });

  it("fixture with three errors reports all three", () => {
    const doc = validPackSkeleton();
    doc.unknown_root = 1;
    (doc.questions as unknown[])[0] = {
      id: "q.one",
      ask: "A?",
      primitives: ["nope"],
      weight: 200,
    };
    const r = validateDomainPackDocument(doc, "f.yaml");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects numeric literal outside weight/version", () => {
    const doc = validPackSkeleton();
    doc.anchor = { name: "a", fallback: "b", extra: 3 };
    const r = validateDomainPackDocument(doc, "f.yaml");
    expect(r.ok).toBe(false);
    if (!r.ok) expectError(r.errors, "f.yaml", "anchor.extra");
  });

  it("rejects as_of.case_attribute not declared", () => {
    const doc = validPackSkeleton();
    (doc.questions as unknown[])[0] = {
      id: "q.one",
      ask: "A?",
      primitives: ["as_of_value"],
      weight: 1,
      as_of: { case_attribute: "snapshot_date" },
    };
    const r = validateDomainPackDocument(doc, "f.yaml");
    expect(r.ok).toBe(false);
    if (!r.ok) expectError(r.errors, "f.yaml", "questions[0].as_of.case_attribute");
  });

  it("rejects behavior key without a dot", () => {
    const doc = validPackSkeleton();
    doc.behaviors = { nodot: { stable: true } };
    const r = validateDomainPackDocument(doc, "f.yaml");
    expect(r.ok).toBe(false);
    if (!r.ok) expectError(r.errors, "f.yaml", "behaviors.nodot");
  });

  it("rejects missing views.customer.forbidden", () => {
    const doc = validPackSkeleton();
    doc.views = {
      customer: { tone: "plain", sections: ["s"] },
      pro: { templates: {}, export: [] },
    };
    const r = validateDomainPackDocument(doc, "f.yaml");
    expect(r.ok).toBe(false);
    if (!r.ok) expectError(r.errors, "f.yaml", "views.customer.forbidden");
  });

  it("loadPack throws PackValidationFailedError with file and path on failure", () => {
    const dir = mkdtempSync(join(tmpdir(), "packs-v2-bad-"));
    const bad = validPackSkeleton();
    bad.pack = "iep";
    bad.views = { pro: { templates: {}, export: [] } };
    writeFileSync(join(dir, "iep.yaml"), stringify(bad));
    clearPackFileCacheForTests();
    expect(() => loadPack("iep", dir)).toThrow(PackValidationFailedError);
  });

  it("exports primitive catalog", () => {
    expect(PACK_STUDY_PRIMITIVES).toContain("threshold");
    expect(PACK_STUDY_PRIMITIVES.length).toBe(18);
  });
});
