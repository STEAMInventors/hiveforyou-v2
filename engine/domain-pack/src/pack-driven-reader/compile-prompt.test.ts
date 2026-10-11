import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { compilePackDrivenReaderPrompt } from "./compile-prompt.js";
import { parseAndValidatePackDrivenExtraction } from "./parse-extraction.js";
import {
  PackDrivenReaderDocumentTypeError,
  resolveDocumentTypeSpec,
  selectRecordDefinitions,
} from "./select-checklist.js";
import { validateProposalDomainPack } from "./validate-proposal-pack.js";
import type { ProposalDomainPack } from "./types.js";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");
const iepPackPath = join(repoRoot, "brain/domain-packs/iep/iep-pack.v0.3.proposed.json");
const iepPack = JSON.parse(readFileSync(iepPackPath, "utf8")) as ProposalDomainPack;

const sampleManifest = [
  {
    sourceDocumentId: "doc-a",
    filename: "a.pdf",
    pageCount: 1,
    documentTypeId: "iep.plan",
  },
  {
    sourceDocumentId: "doc-b",
    filename: "b.pdf",
    pageCount: 1,
    documentTypeId: "iep.progress",
  },
];

function compileForType(documentTypeId: string, sourceDocumentId = "doc-a") {
  return compilePackDrivenReaderPrompt({
    pack: iepPack,
    documentTypeId,
    caseManifest: sampleManifest,
    document: {
      sourceDocumentId,
      pages: [{ pageNumber: 1, text: "Sample page text for unit tests." }],
    },
  });
}

describe("proposal pack structural validation", () => {
  it("validates iep v0.3 proposed pack with zero errors", () => {
    const result = validateProposalDomainPack(iepPack);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe("compilePackDrivenReaderPrompt", () => {
  it("selects checklist records and fields for iep.plan", () => {
    const compiled = compileForType("iep.plan");
    expect(compiled.selectedRecordTypeIds).toContain("goal");
    expect(compiled.selectedRecordTypeIds).toContain("service");
    expect(compiled.selectedFieldCount).toBeGreaterThan(80);
    for (const recordId of compiled.selectedRecordTypeIds) {
      expect(compiled.blocks.D_documentTypeChecklist).toContain(`"${recordId}"`);
    }
  });

  it("uses the same stable prefix for multiple documents with the same pack", () => {
    const plan = compileForType("iep.plan", "doc-a");
    const progress = compileForType("iep.progress", "doc-b");
    expect(plan.stableSystemPrefix).toBe(progress.stableSystemPrefix);
    expect(plan.caseUserContent).not.toBe(progress.caseUserContent);
  });

  it("selects different checklists for different document types", () => {
    const plan = compileForType("iep.plan");
    const progress = compileForType("iep.progress");
    expect(plan.selectedRecordTypeIds).not.toEqual(progress.selectedRecordTypeIds);
    expect(progress.selectedRecordTypeIds).toContain("progress_entry");
    expect(plan.selectedRecordTypeIds).toContain("service");
  });

  it("allows distinct repeatable service/goal instances in parser", () => {
    const compiled = compileForType("iep.plan");
    const selected = selectRecordDefinitions(iepPack, compiled.selectedRecordTypeIds);
    const parsed = parseAndValidatePackDrivenExtraction({
      expectedSourceDocumentId: "doc-a",
      selectedRecords: selected,
      raw: {
        schemaVersion: "hive.pack-driven-reader-extraction/0.1.0",
        packId: "iep",
        packVersion: iepPack.manifest.version,
        documentTypeId: "iep.plan",
        sourceDocumentId: "doc-a",
        recordInstances: [
          {
            recordTypeId: "service",
            instanceIndex: 0,
            fields: [
              {
                fieldId: "service_type",
                provenance: "quoted",
                valueKind: "text",
                value: "Speech",
                modality: "planned",
                missingState: null,
                evidence: { sourceDocumentId: "doc-a", page: 1, quote: "Speech therapy 2x week" },
              },
            ],
          },
          {
            recordTypeId: "service",
            instanceIndex: 1,
            fields: [
              {
                fieldId: "service_type",
                provenance: "quoted",
                valueKind: "text",
                value: "OT",
                modality: "planned",
                missingState: null,
                evidence: { sourceDocumentId: "doc-a", page: 1, quote: "OT 1x week" },
              },
            ],
          },
        ],
      },
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.recordInstances).toHaveLength(2);
  });

  it("enforces evidence source/page/quote requirements", () => {
    const compiled = compileForType("iep.plan");
    const selected = selectRecordDefinitions(iepPack, compiled.selectedRecordTypeIds);
    const parsed = parseAndValidatePackDrivenExtraction({
      expectedSourceDocumentId: "doc-a",
      selectedRecords: selected,
      raw: {
        sourceDocumentId: "doc-a",
        recordInstances: [
          {
            recordTypeId: "goal",
            instanceIndex: 0,
            fields: [
              {
                fieldId: "statement",
                provenance: "quoted",
                valueKind: "text",
                value: "Read fluently",
                modality: "planned",
                missingState: null,
                evidence: { sourceDocumentId: "doc-a", page: 1, quote: "Different quote" },
              },
            ],
          },
        ],
      },
    });
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.some((e) => e.includes("quoted value must appear"))).toBe(true);
  });

  it("rejects derived field emissions from the model", () => {
    const compiled = compileForType("iep.plan");
    const selected = selectRecordDefinitions(iepPack, compiled.selectedRecordTypeIds);
    const parsed = parseAndValidatePackDrivenExtraction({
      expectedSourceDocumentId: "doc-a",
      selectedRecords: selected,
      raw: {
        sourceDocumentId: "doc-a",
        recordInstances: [
          {
            recordTypeId: "goal",
            instanceIndex: 0,
            fields: [
              {
                fieldId: "statement",
                provenance: "derived",
                valueKind: "text",
                value: "x",
                modality: "planned",
                missingState: null,
                evidence: null,
              },
            ],
          },
        ],
      },
    });
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.some((e) => e.includes("derived"))).toBe(true);
  });

  it("uses generic fallback for unknown types when allowed", () => {
    const spec = resolveDocumentTypeSpec({
      pack: iepPack,
      documentTypeId: "not.a.real.type",
      allowGenericUnclassifiedFallback: true,
    });
    expect(spec.resolution).toBe("generic_fallback");
    expect(spec.checklistRecordTypeIds.length).toBeGreaterThan(0);
  });

  it("fail-closes unknown types when fallback disabled", () => {
    expect(() =>
      resolveDocumentTypeSpec({
        pack: iepPack,
        documentTypeId: "not.a.real.type",
        allowGenericUnclassifiedFallback: false,
      }),
    ).toThrow(PackDrivenReaderDocumentTypeError);
  });

  it("does not embed requirements, insight checks, or plain explainers in prompts", () => {
    const compiled = compileForType("iep.plan");
    const combined = compiled.stableSystemPrefix + compiled.caseUserContent;
    expect(combined).not.toContain("insightChecks");
    expect(combined).not.toContain("plainExplainers");
    expect(combined).not.toContain('"requirements"');
    expect(combined).not.toContain("\"requirements\":");
  });

  it("generic compiler sources contain no IEP-specific conditionals", () => {
    const compilerDir = resolve(fileURLToPath(new URL(".", import.meta.url)));
    const sources = ["compile-prompt.ts", "select-checklist.ts", "constants.ts", "output-schema.ts"];
    for (const file of sources) {
      const text = readFileSync(join(compilerDir, file), "utf8");
      expect(text).not.toMatch(/domain\s*===\s*["']iep["']/);
      expect(text).not.toMatch(/if\s*\(.*iep\./);
    }
  });
});
