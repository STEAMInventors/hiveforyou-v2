import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  PACK_DRIVEN_CLASSIFICATION_AMBIGUOUS,
  PACK_DRIVEN_CLASSIFICATION_UNKNOWN,
  PACK_DRIVEN_READER_EXTRACTION_SCHEMA_VERSION,
  PACK_DRIVEN_READER_EXTRACTION_SCHEMA_VERSION_LEGACY,
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

const sampleManifest = l001EightTypes.map((discoverDocumentTypeId, index) => ({
  sourceDocumentId: `l001-doc-${index + 1}`,
  filename: `${index + 1}.pdf`,
  pageCount: 1,
  discoverDocumentTypeId,
  discoverDocumentTypeLabel: discoverDocumentTypeId,
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
      expect(row.promptVersion).toContain("0.3.0");
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

  it("keeps stable prefix identical when advisory Discover hints differ per document", () => {
    const wrongManifest = sampleManifest.map((entry) => ({
      ...entry,
      discoverDocumentTypeId: "iep.plan" as string,
      discoverDocumentTypeLabel: "iep.plan",
    }));
    const withWrong = compileForDocument("l001-doc-1", "Referral-only text.", wrongManifest);
    const withCorrect = compileForDocument("l001-doc-1", "Referral-only text.", sampleManifest);
    expect(withWrong.stableSystemPrefix).toBe(withCorrect.stableSystemPrefix);
    expect(withWrong.caseUserContent).not.toBe(withCorrect.caseUserContent);
  });

  it("places output JSON schema in per-document user content, not the stable prefix", () => {
    const compiled = compileForDocument("doc-a", "Sample page text.");
    expect(compiled.stableSystemPrefix).not.toContain("Output contract (JSON Schema");
    expect(compiled.caseUserContent).toContain("Output contract (JSON Schema");
    expect(compiled.blocks.F_outputContract).toContain("hive.pack-driven-reader-extraction/0.3.0");
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

const miniCoveragePack: ProposalDomainPack = {
  schemaVersion: "hive.domain-pack.proposal/0.3.0",
  manifest: { id: "mini", version: "1.0.0" },
  readingNotes: { global: "", byDocumentType: {} },
  documentTypes: [
    {
      id: "doc.simple",
      checklist: ["header_row"],
      checklistPolicy: "look_for_all_listed; never_invent_if_absent",
    },
  ],
  recordTypes: [
    {
      id: "header_row",
      repeatable: false,
      fields: [
        {
          id: "title",
          valueKind: "text",
          source: ["quoted"],
          modality: ["observed"],
        },
      ],
    },
  ],
};

function miniExtractionRaw(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "hive.pack-driven-reader-extraction/0.3.0",
    packId: "mini",
    packVersion: "1.0.0",
    documentTypeId: "doc.simple",
    sourceDocumentId: "doc-a",
    checklistCoverage: [{ recordTypeId: "header_row", disposition: "extracted", instanceIndexes: [0] }],
    recordInstances: [
      {
        recordTypeId: "header_row",
        instanceIndex: 0,
        fields: [
          {
            fieldId: "title",
            provenance: "quoted",
            valueKind: "text",
            value: "Hello",
            modality: "observed",
            missingState: null,
            evidence: { sourceDocumentId: "doc-a", page: 1, quote: "Hello world" },
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("parseAndValidatePackDrivenExtraction (model-selected type)", () => {
  it("accepts checklist-complete extraction", () => {
    const parsed = parseAndValidatePackDrivenExtraction({
      pack: miniCoveragePack,
      expectedSourceDocumentId: "doc-a",
      raw: miniExtractionRaw(),
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.documentTypeId).toBe("doc.simple");
  });

  it("fail-closes omitted checklist field coverage", () => {
    const parsed = parseAndValidatePackDrivenExtraction({
      pack: miniCoveragePack,
      expectedSourceDocumentId: "doc-a",
      raw: miniExtractionRaw({
        recordInstances: [
          {
            recordTypeId: "header_row",
            instanceIndex: 0,
            fields: [],
          },
        ],
      }),
    });
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.some((e) => e.includes("not emitted"))).toBe(true);
  });

  it("rejects unknown document type ids against pinned pack", () => {
    const parsed = parseAndValidatePackDrivenExtraction({
      pack: miniCoveragePack,
      expectedSourceDocumentId: "doc-a",
      raw: miniExtractionRaw({ documentTypeId: "not.a.real.type" }),
    });
    expect(parsed.ok).toBe(false);
    expect(parsed.needsReview).toBe(true);
    expect(parsed.errors.some((e) => e.includes("not in pack documentTypes"))).toBe(true);
  });

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

  it("reports parseOk=false semantics for invalid record shape", () => {
    const parsed = parseAndValidatePackDrivenExtraction({
      pack: miniCoveragePack,
      expectedSourceDocumentId: "doc-a",
      raw: miniExtractionRaw({
        recordInstances: [
          {
            recordTypeId: "header_row",
            instanceIndex: 0,
            fields: [
              {
                fieldId: "title",
                provenance: "quoted",
                valueKind: "text",
                value: "Mismatch",
                modality: "observed",
                missingState: null,
                evidence: { sourceDocumentId: "doc-a", page: 1, quote: "Different quote" },
              },
            ],
          },
        ],
      }),
    });
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.some((e) => e.includes("quoted value must appear"))).toBe(true);
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

const serviceCoveragePack: ProposalDomainPack = {
  schemaVersion: "hive.domain-pack.proposal/0.3.0",
  manifest: { id: "service-test", version: "1.0.0" },
  readingNotes: { global: "", byDocumentType: {} },
  documentTypes: [
    {
      id: "doc.plan",
      checklist: ["service"],
      checklistPolicy: "look_for_all_listed; never_invent_if_absent",
    },
  ],
  recordTypes: [
    {
      id: "service",
      repeatable: true,
      fields: [
        {
          id: "minutes_per_week",
          valueKind: "quantity",
          source: ["quoted"],
          modality: ["planned"],
        },
      ],
    },
  ],
};

function serviceExtractionRaw(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: PACK_DRIVEN_READER_EXTRACTION_SCHEMA_VERSION,
    packId: "service-test",
    packVersion: "1.0.0",
    documentTypeId: "doc.plan",
    sourceDocumentId: "svc-1",
    checklistCoverage: [{ recordTypeId: "service", disposition: "extracted", instanceIndexes: [0] }],
    recordInstances: [
      {
        recordTypeId: "service",
        instanceIndex: 0,
        fields: [
          {
            fieldId: "minutes_per_week",
            provenance: "quoted",
            valueKind: "quantity",
            value: "150",
            modality: "planned",
            missingState: null,
            evidence: { sourceDocumentId: "svc-1", page: 1, quote: "150 minutes weekly" },
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("parseAndValidatePackDrivenExtraction — DP-03B checklistCoverage", () => {
  it("accepts explicit 150 minutes weekly as quoted minutes_per_week", () => {
    const parsed = parseAndValidatePackDrivenExtraction({
      pack: serviceCoveragePack,
      expectedSourceDocumentId: "svc-1",
      raw: serviceExtractionRaw(),
    });
    expect(parsed.ok).toBe(true);
    const field = parsed.recordInstances[0]?.fields.find((row) => row.fieldId === "minutes_per_week");
    expect(field?.provenance).toBe("quoted");
    expect(field?.value).toBe("150");
  });

  it("marks absent repeatable checklist record not_found without fake instances", () => {
    const parsed = parseAndValidatePackDrivenExtraction({
      pack: serviceCoveragePack,
      expectedSourceDocumentId: "svc-1",
      raw: serviceExtractionRaw({
        checklistCoverage: [{ recordTypeId: "service", disposition: "not_found" }],
        recordInstances: [],
      }),
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.recordInstances).toHaveLength(0);
  });

  it("fails contradictory checklist coverage", () => {
    const parsed = parseAndValidatePackDrivenExtraction({
      pack: serviceCoveragePack,
      expectedSourceDocumentId: "svc-1",
      raw: serviceExtractionRaw({
        checklistCoverage: [{ recordTypeId: "service", disposition: "not_found" }],
      }),
    });
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.some((error) => error.includes("cannot coexist"))).toBe(true);
  });

  it("still parses legacy 0.2.0 extractions without checklistCoverage", () => {
    const parsed = parseAndValidatePackDrivenExtraction({
      pack: miniCoveragePack,
      expectedSourceDocumentId: "doc-a",
      raw: {
        schemaVersion: PACK_DRIVEN_READER_EXTRACTION_SCHEMA_VERSION_LEGACY,
        documentTypeId: "doc.simple",
        sourceDocumentId: "doc-a",
        recordInstances: miniExtractionRaw().recordInstances,
      },
    });
    expect(parsed.extractionSchemaVersion).toBe(PACK_DRIVEN_READER_EXTRACTION_SCHEMA_VERSION_LEGACY);
    expect(parsed.ok).toBe(true);
  });
});
