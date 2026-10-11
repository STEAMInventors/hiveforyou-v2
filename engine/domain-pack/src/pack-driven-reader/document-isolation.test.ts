import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { compilePackDrivenReaderPrompt } from "./compile-prompt.js";
import { parseAndValidatePackDrivenExtraction } from "./parse-extraction.js";
import { selectRecordDefinitions } from "./select-checklist.js";
import type { ProposalDomainPack } from "./types.js";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");
const iepPackPath = join(repoRoot, "brain/domain-packs/iep/iep-pack.v0.3.proposed.json");
const iepPack = JSON.parse(readFileSync(iepPackPath, "utf8")) as ProposalDomainPack;

const manifest = [
  {
    sourceDocumentId: "11111111-1111-4111-8111-111111111111",
    filename: "plan-a.pdf",
    pageCount: 1,
    documentTypeId: "iep.plan",
  },
  {
    sourceDocumentId: "22222222-2222-4222-8222-222222222222",
    filename: "plan-b.pdf",
    pageCount: 1,
    documentTypeId: "iep.plan",
  },
];

function compileFor(sourceDocumentId: string, text: string) {
  return compilePackDrivenReaderPrompt({
    pack: iepPack,
    documentTypeId: "iep.plan",
    caseManifest: manifest,
    document: {
      sourceDocumentId,
      pages: [{ pageNumber: 1, text }],
    },
  });
}

describe("pack-driven reader document isolation", () => {
  it("builds independent requests per sourceDocumentId with shared stable prefix", () => {
    const docA = compileFor("11111111-1111-4111-8111-111111111111", "Alpha-only page text.");
    const docB = compileFor("22222222-2222-4222-8222-222222222222", "Beta-only page text.");

    expect(docA.stableSystemPrefix).toBe(docB.stableSystemPrefix);
    expect(docA.caseUserContent).not.toBe(docB.caseUserContent);

    expect(docA.caseUserContent).toContain("11111111-1111-4111-8111-111111111111");
    expect(docA.caseUserContent).toContain("Alpha-only page text.");
    expect(docA.caseUserContent).not.toContain("Beta-only page text.");

    expect(docB.caseUserContent).toContain("22222222-2222-4222-8222-222222222222");
    expect(docB.caseUserContent).toContain("Beta-only page text.");
    expect(docB.caseUserContent).not.toContain("Alpha-only page text.");

    expect(docA.outputJsonSchema).not.toEqual(docB.outputJsonSchema);
    expect(docA.outputJsonSchema).toMatchObject({
      properties: {
        sourceDocumentId: { const: "11111111-1111-4111-8111-111111111111" },
      },
    });
  });

  it("parse rejects cross-document evidence and derived fields (document-scoped only)", () => {
    const compiled = compileFor("11111111-1111-4111-8111-111111111111", "Speech therapy 2x week.");
    const selected = selectRecordDefinitions(iepPack, compiled.selectedRecordTypeIds);

    const crossDoc = parseAndValidatePackDrivenExtraction({
      expectedSourceDocumentId: "11111111-1111-4111-8111-111111111111",
      selectedRecords: selected,
      raw: {
        schemaVersion: "hive.pack-driven-reader-extraction/0.1.0",
        packId: "iep",
        packVersion: iepPack.manifest.version,
        documentTypeId: "iep.plan",
        sourceDocumentId: "11111111-1111-4111-8111-111111111111",
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
                evidence: {
                  sourceDocumentId: "22222222-2222-4222-8222-222222222222",
                  page: 1,
                  quote: "Speech therapy 2x week.",
                },
              },
            ],
          },
        ],
      },
    });
    expect(crossDoc.ok).toBe(false);
    expect(
      crossDoc.errors.some((e) => e.includes("evidence sourceDocumentId must match document")),
    ).toBe(true);
  });
});
