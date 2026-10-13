import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  assertReaderPackCompatibleWithOverlay,
  hashInterpretationOverlay,
  mergeInterpretationOntoReaderPack,
  parseInterpretationOverlay,
} from "./merge-interpretation.js";

const HERE = fileURLToPath(import.meta.url);
const REPO_ROOT = join(HERE, "../../../../..");
const OVERLAY_PATH = join(
  REPO_ROOT,
  "brain/domain-packs/iep/interpretation/iep-interp-v0.3.1.overlay.json",
);
const L001_READER_SHA = "c2baa0439d32496a3110f5388f6048395a9f4c8fdce79b3d0cec36ae6b9a7775";

describe("interpretation overlay merge", () => {
  it("parses v0.3.1 overlay and hashes deterministically", () => {
    const raw = JSON.parse(readFileSync(OVERLAY_PATH, "utf8"));
    const overlay = parseInterpretationOverlay(raw);
    expect(overlay.manifest.version).toBe("0.3.1");
    const h1 = hashInterpretationOverlay(overlay);
    const h2 = hashInterpretationOverlay(parseInterpretationOverlay(raw));
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("asserts reader pack compatibility", () => {
    const overlay = parseInterpretationOverlay(JSON.parse(readFileSync(OVERLAY_PATH, "utf8")));
    expect(() => assertReaderPackCompatibleWithOverlay(L001_READER_SHA, overlay)).not.toThrow();
    expect(() => assertReaderPackCompatibleWithOverlay("f".repeat(64), overlay)).toThrow(
      "INTERPRETATION_READER_PACK_INCOMPATIBLE",
    );
  });

  it("merges goal and evaluation_plan_item patches onto a minimal reader pack", () => {
    const overlay = parseInterpretationOverlay(JSON.parse(readFileSync(OVERLAY_PATH, "utf8")));
    const readerPack = {
      manifest: { id: "iep", version: "0.3.0" },
      recordTypes: [
        {
          id: "goal",
          identity: { scope: "case" as const, keyFields: ["area"], versionAxis: "document.orderingDate" },
          fields: [{ id: "area", valueKind: "text" as const, source: ["quoted"], modality: ["observed"] }],
        },
        {
          id: "evaluation_plan_item",
          identity: { scope: "case" as const, keyFields: ["area"], versionAxis: "document.orderingDate" },
          fields: [{ id: "area", valueKind: "text" as const, source: ["quoted"], modality: ["observed"] }],
        },
      ],
    } as Parameters<typeof mergeInterpretationOntoReaderPack>[0];

    const merged = mergeInterpretationOntoReaderPack(readerPack, overlay);
    const goal = merged.recordTypes.find((r) => r.id === "goal");
    expect(goal?.identity.keyFields).toEqual(["measure.task", "measure.score_type"]);
    expect(goal?.fields.some((f) => f.id === "designation")).toBe(true);

    const evalItem = merged.recordTypes.find((r) => r.id === "evaluation_plan_item");
    expect(evalItem?.identity.scope).toBe("document");
    expect(evalItem?.identity.keyFields).toEqual(["list_section", "line_text"]);
    expect(evalItem?.fields.some((f) => f.id === "list_section")).toBe(true);
    expect(merged.relationshipRules?.changeRequiresTemporalSuccession).toBe(true);
  });

  it("merges document ordering and field derivation patches (non-IEP synthetic pack)", () => {
    const overlay = parseInterpretationOverlay({
      schemaVersion: "hive.domain-pack.interpretation-overlay/0.1",
      manifest: { id: "synthetic-interp", version: "0.0.1" },
      compatibleReaderPackContentSha256: ["a".repeat(64)],
      documentTypePatches: [{ id: "doc.event", orderingDate: "event.occurred_on" }],
      recordTypePatches: [
        {
          id: "line_item",
          fieldDerivationPatches: [
            {
              fieldId: "total",
              derivation: {
                primitive: "ratePerWeek",
                operands: ["unit_count"],
                alternates: [{ primitive: "explicitTotalPerWeek", operands: ["frequency_text"] }],
              },
            },
          ],
        },
      ],
    });
    const readerPack = {
      manifest: { id: "synthetic", version: "0.0.1" },
      documentTypes: [
        {
          id: "doc.event",
          label: "Event",
          orderingDate: "document_header.document_date",
          checklist: [],
        },
      ],
      recordTypes: [
        {
          id: "line_item",
          fields: [
            {
              id: "total",
              valueKind: "quantity",
              source: ["derived"],
              derivation: { primitive: "ratePerWeek", operands: ["unit_count"] },
            },
          ],
        },
      ],
    } as Parameters<typeof mergeInterpretationOntoReaderPack>[0];

    const merged = mergeInterpretationOntoReaderPack(readerPack, overlay);
    expect(merged.documentTypes.find((d) => d.id === "doc.event")?.orderingDate).toBe(
      "event.occurred_on",
    );
    const totalField = merged.recordTypes.find((r) => r.id === "line_item")?.fields.find((f) => f.id === "total");
    expect(totalField?.derivation?.alternates?.[0]?.primitive).toBe("explicitTotalPerWeek");
  });

  it("leaves insightChecks undefined when reader pack has none", () => {
    const overlay = parseInterpretationOverlay({
      schemaVersion: "hive.domain-pack.interpretation-overlay/0.1",
      manifest: { id: "x", version: "0.0.1" },
      compatibleReaderPackContentSha256: ["a".repeat(64)],
      insightCheckReplacements: [
        { id: "check.new", primitive: "present", question: "New?" },
      ],
    });
    const readerPack = {
      manifest: { id: "synthetic", version: "0.0.1" },
      recordTypes: [],
    } as Parameters<typeof mergeInterpretationOntoReaderPack>[0];

    const merged = mergeInterpretationOntoReaderPack(readerPack, overlay);
    expect(merged.insightChecks).toBeUndefined();
  });

  it("merges insightCheckReplacements when reader checks array is absent", () => {
    const overlay = parseInterpretationOverlay({
      schemaVersion: "hive.domain-pack.interpretation-overlay/0.1",
      manifest: { id: "x", version: "0.0.1" },
      compatibleReaderPackContentSha256: ["a".repeat(64)],
      insightCheckReplacements: [
        { id: "check.overlay", primitive: "present", question: "Overlay only?" },
      ],
    });
    const readerPack = {
      manifest: { id: "synthetic", version: "0.0.1" },
      recordTypes: [],
      insightChecks: { enginePrimitivesRequired: ["compare"] },
    } as Parameters<typeof mergeInterpretationOntoReaderPack>[0];

    const merged = mergeInterpretationOntoReaderPack(readerPack, overlay);
    expect(merged.insightChecks?.enginePrimitivesRequired).toEqual(["compare"]);
    expect(merged.insightChecks?.checks).toEqual([
      { id: "check.overlay", primitive: "present", question: "Overlay only?" },
    ]);
  });

  it("replaces and appends insightCheckReplacements onto existing checks", () => {
    const overlay = parseInterpretationOverlay({
      schemaVersion: "hive.domain-pack.interpretation-overlay/0.1",
      manifest: { id: "x", version: "0.0.1" },
      compatibleReaderPackContentSha256: ["a".repeat(64)],
      insightCheckReplacements: [
        { id: "check.a", primitive: "updated", question: "Updated A?" },
        { id: "check.c", primitive: "present", question: "New C?" },
      ],
    });
    const readerPack = {
      manifest: { id: "synthetic", version: "0.0.1" },
      recordTypes: [],
      insightChecks: {
        checks: [
          { id: "check.a", primitive: "original", question: "Original A?" },
          { id: "check.b", primitive: "keep", question: "Keep B?" },
        ],
      },
    } as Parameters<typeof mergeInterpretationOntoReaderPack>[0];

    const merged = mergeInterpretationOntoReaderPack(readerPack, overlay);
    expect(merged.insightChecks?.checks).toEqual([
      { id: "check.a", primitive: "updated", question: "Updated A?" },
      { id: "check.b", primitive: "keep", question: "Keep B?" },
      { id: "check.c", primitive: "present", question: "New C?" },
    ]);
  });

  it("rejects incompatible reader pack hash (negative)", () => {
    const overlay = parseInterpretationOverlay({
      schemaVersion: "hive.domain-pack.interpretation-overlay/0.1",
      manifest: { id: "x", version: "0.0.1" },
      compatibleReaderPackContentSha256: ["b".repeat(64)],
    });
    expect(() => assertReaderPackCompatibleWithOverlay("a".repeat(64), overlay)).toThrow(
      "INTERPRETATION_READER_PACK_INCOMPATIBLE",
    );
  });
});
