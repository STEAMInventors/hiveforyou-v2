import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

const packsV2Dir = join(dirname(fileURLToPath(import.meta.url)), "../../packs-v2");

const DOMAIN_PACK_TOP_LEVEL_KEYS = [
  "pack",
  "version",
  "anchor",
  "jurisdiction_overlay",
  "questions",
  "behaviors",
  "views",
] as const;

function loadYaml(filename: string): Record<string, unknown> {
  const text = readFileSync(join(packsV2Dir, filename), "utf8");
  const doc = parse(text);
  expect(doc, `${filename} must parse to a mapping`).toBeTypeOf("object");
  expect(doc).not.toBeNull();
  return doc as Record<string, unknown>;
}

describe("packs-v2 YAML data", () => {
  it("parses every file and exposes expected top-level keys", () => {
    for (const filename of [
      "iep.yaml",
      "bankruptcy.yaml",
      "medicaid.yaml",
      "core_default_questions.yaml",
    ] as const) {
      const doc = loadYaml(filename);
      for (const key of DOMAIN_PACK_TOP_LEVEL_KEYS) {
        expect(doc, `${filename} missing top-level key ${key}`).toHaveProperty(key);
      }
    }

    expect(loadYaml("core_defaults.yaml")).toHaveProperty("behaviors");

    const layers = loadYaml("layers.yaml");
    expect(layers).toHaveProperty("pro_layer");
    expect(layers).toHaveProperty("case_layer");
    expect(layers).toHaveProperty("merge");
  });
});
