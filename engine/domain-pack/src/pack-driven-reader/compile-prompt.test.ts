import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  PACK_DRIVEN_CLASSIFICATION_AMBIGUOUS,
  PACK_DRIVEN_CLASSIFICATION_UNKNOWN,
} from "./constants.js";
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

const l001EightTypes = [
  "iep.referral",
  "iep.evaluation.plan",
  "iep.consent",
  "iep.evaluation.psychoeducational",
  "iep.evaluation.academic",
  "iep.evaluation.speech_language",
  "iep.eligibility",
  "iep.plan",
] as const;

const sampleManifest = l001EightTypes.map((documentTypeId, index) => ({
  sourceDocumentId: `l001-doc-${index + 1}`,
  filename: `${index + 1}.pdf`,
  pageCount: 1,
  documentTypeId,
}));

function compileForDocument(sourceDocumentId: string, text: string, manifest = sampleManifest) {
  return compilePackDrivenReaderPrompt({
    pack: iepPack,
    caseManifest: manifest,
    document: {
      sourceDocumentId,
      pages: [{ pageNumber: 1, text }],
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

describe("self-classifying compilePackDrivenReaderPrompt", () => {
  it("uses one shared stable prefix for eight L001-style document types", () => {
    const compiledByType = l001EightTypes.map((_, index) =>
      compileForDocument(`l001-doc-${index + 1}`, `Synthetic page for doc ${index + 1}.`),
    );
    const prefix = compiledByType[0]!.stableSystemPrefix;
    for (const row of compiledByType) {
      expect(row.stableSystemPrefix).toBe(prefix);
      expect(row.promptVersion).toContain("0.2.0");
      expect(row.blocks.B_packDefinitionAndContract).toContain("Document-type catalog");
    }
    const userContents = new Set(compiledByType.map((row) => row.caseUserContent));
    expect(userContents.size).toBe(8);
  });

  it("does not require document classification input at compile time", () => {
    const compiled = compileForDocument("doc-a", "Sample page text.");
    expect(compiled.blocks.D_documentTask).toContain("Classify");
    expect(compiled.stableSystemPrefix).toContain("iep.plan");
    expect(compiled.stableSystemPrefix).toContain("iep.referral");
  });

  it("ignores incorrect Engine 1 manifest documentTypeId hints for prompt compilation", () => {
    const wrongManifest = sampleManifest.map((entry) => ({
      ...entry,
      documentTypeId: "iep.plan" as string,
    }));
    const withWrong = compileForDocument("l001-doc-1", "Referral-only text.", wrongManifest);
    const withCorrect = compileForDocument("l001-doc-1", "Referral-only text.", sampleManifest);
    expect(withWrong.stableSystemPrefix).toBe(withCorrect.stableSystemPrefix);
    expect(withWrong.caseUserContent).not.toBe(withCorrect.caseUserContent);
  });

  it("does not embed requirements, insight checks, or plain explainers in prompts", () => {
    const compiled = compileForDocument("doc-a", "Sample.");
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

describe("parseAndValidatePackDrivenExtraction (model-selected type)", () => {
  it("enforces checklist after iep.plan classification", () => {
    const parsed = parseAndValidatePackDrivenExtraction({
      pack: iepPack,
      expectedSourceDocumentId: "doc-a",
      raw: {
        schemaVersion: "hive.pack-driven-reader-extraction/0.2.0",
        packId: "iep",
        packVersion: iepPack.manifest.version,
        documentTypeId: "iep.plan",
        sourceDocumentId: "doc-a",
        recordInstances: [
          {
            recordTypeId: "progress_entry",
            instanceIndex: 0,
            fields: [
              {
                fieldId: "reporting_period_start",
                provenance: "quoted",
                valueKind: "date",
                value: "2024-01-01",
                modality: "observed",
                missingState: null,
                evidence: { sourceDocumentId: "doc-a", page: 1, quote: "2024-01-01" },
              },
            ],
          },
        ],
      },
    });
    expect(parsed.ok).toBe(false);
    expect(parsed.documentTypeId).toBe("iep.plan");
    expect(parsed.errors.some((e) => e.includes("recordTypeId invalid"))).toBe(true);
  });

  it("allows distinct repeatable service instances for iep.plan", () => {
    const parsed = parseAndValidatePackDrivenExtraction({
      pack: iepPack,
      expectedSourceDocumentId: "doc-a",
      raw: {
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

  it("fail-closes UNKNOWN and AMBIGUOUS to NEEDS_REVIEW without records", () => {
    for (const disposition of [PACK_DRIVEN_CLASSIFICATION_UNKNOWN, PACK_DRIVEN_CLASSIFICATION_AMBIGUOUS]) {
      const parsed = parseAndValidatePackDrivenExtraction({
        pack: iepPack,
        expectedSourceDocumentId: "doc-a",
        raw: {
          documentTypeId: disposition,
          sourceDocumentId: "doc-a",
          recordInstances: [
            {
              recordTypeId: "goal",
              instanceIndex: 0,
              fields: [],
            },
          ],
        },
      });
      expect(parsed.needsReview).toBe(true);
      expect(parsed.ok).toBe(false);
      expect(parsed.recordInstances).toHaveLength(0);
      expect(parsed.errors.some((e) => e.includes("NEEDS_REVIEW"))).toBe(true);
    }
  });

  it("enforces evidence source/page/quote requirements", () => {
    const parsed = parseAndValidatePackDrivenExtraction({
      pack: iepPack,
      expectedSourceDocumentId: "doc-a",
      raw: {
        documentTypeId: "iep.plan",
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
    const parsed = parseAndValidatePackDrivenExtraction({
      pack: iepPack,
      expectedSourceDocumentId: "doc-a",
      raw: {
        documentTypeId: "iep.plan",
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

  it("uses generic fallback only via resolveDocumentTypeSpec helper (not model output)", () => {
    const spec = resolveDocumentTypeSpec({
      pack: iepPack,
      documentTypeId: "not.a.real.type",
      allowGenericUnclassifiedFallback: true,
    });
    expect(spec.resolution).toBe("generic_fallback");
    expect(spec.checklistRecordTypeIds.length).toBeGreaterThan(0);
  });

  it("fail-closes unknown types when fallback disabled in resolveDocumentTypeSpec", () => {
    expect(() =>
      resolveDocumentTypeSpec({
        pack: iepPack,
        documentTypeId: "not.a.real.type",
        allowGenericUnclassifiedFallback: false,
      }),
    ).toThrow(PackDrivenReaderDocumentTypeError);
  });

  it("selectRecordDefinitions still resolves iep.plan checklist", () => {
    const spec = resolveDocumentTypeSpec({
      pack: iepPack,
      documentTypeId: "iep.plan",
      allowGenericUnclassifiedFallback: false,
    });
    const selected = selectRecordDefinitions(iepPack, spec.checklistRecordTypeIds);
    expect(selected.some((r) => r.recordTypeId === "goal")).toBe(true);
    expect(selected.some((r) => r.recordTypeId === "service")).toBe(true);
  });
});
