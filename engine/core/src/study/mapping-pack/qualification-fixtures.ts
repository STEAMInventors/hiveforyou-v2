import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { DocumentPages } from "../../document/page-model.js";
import type { ReaderQualificationLogicalDocument } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "../../../../..");
const L001_PAGES_DIR = join(REPO_ROOT, "engine/intake/fixtures/l001/document-pages");

export function qualificationLogicalDocumentsForCase(caseId: string): ReaderQualificationLogicalDocument[] {
  const normalized = caseId.trim().toLowerCase();
  if (normalized === "l001") {
    return [
      {
        logicalDocumentId: "doc-l001-initial-iep",
        sourceDocumentId: "l001-src-8",
        pageStart: 1,
        pageEnd: 3,
        discoverDocumentTypeLabel: "Initial individualized education program",
      },
    ];
  }
  if (normalized === "bankruptcy" || normalized === "unknown") {
    const sourceDocumentId =
      normalized === "bankruptcy" ? "bankruptcy-src-petition-001" : "unknown-src-misc-001";
    return [
      {
        logicalDocumentId: "doc-unclassified",
        sourceDocumentId,
        pageStart: 1,
        pageEnd: 1,
        discoverDocumentTypeLabel: "Document (unclassified)",
      },
    ];
  }
  throw new Error(`Unknown reader qualification case: ${caseId}`);
}

export function loadQualificationDocumentPages(
  caseId: string,
  sourceDocumentId: string,
): DocumentPages | null {
  const normalized = caseId.trim().toLowerCase();
  if (normalized === "l001" && sourceDocumentId === "l001-src-8") {
    const raw = JSON.parse(readFileSync(join(L001_PAGES_DIR, "08_initial_iep.json"), "utf8")) as {
      documentPages: DocumentPages;
    };
    return {
      ...raw.documentPages,
      documentId: sourceDocumentId,
    };
  }
  if (normalized === "bankruptcy" || normalized === "unknown") {
    return syntheticPages(sourceDocumentId, "SYNTHETIC bankruptcy qualification fixture text.");
  }
  return null;
}

function syntheticPages(sourceDocumentId: string, text: string): DocumentPages {
  return {
    documentId: sourceDocumentId,
    pages: [
      {
        documentId: sourceDocumentId,
        pageNumber: 1,
        width: 612,
        height: 792,
        rotation: 0,
        route: "native",
        imageRef: null,
        quality: { garbageRatio: 0, illegibleRegions: [], meanConfidence: null, textCoverage: null },
        words: text.split(/\s+/).map((word, seq) => ({
          seq,
          text: word,
          bbox: [0, 0, 1, 1] as [number, number, number, number],
          confidence: null,
          fontName: null,
          fontSize: null,
          bold: null,
          italic: null,
          source: "native" as const,
        })),
      },
    ],
    formFields: [],
    sha256: "0".repeat(64),
  };
}

export function replayParsedModelJsonForDocument(input: {
  caseId: string;
  sourceDocumentId: string;
  documentTypeId: string;
  variant?: "valid" | "invalid_evidence" | "invented_absence";
}): Record<string, unknown> {
  const { caseId, sourceDocumentId, documentTypeId, variant = "valid" } = input;
  const normalized = caseId.trim().toLowerCase();

  if (normalized === "l001" && sourceDocumentId === "l001-src-8") {
    if (variant === "invalid_evidence") {
      return {
        sourceDocumentId,
        documentTypeId,
        recordInstances: [
          {
            recordTypeId: "document",
            instanceIndex: 0,
            fields: [
              {
                fieldId: "document.date",
                provenance: "quoted",
                valueKind: "date",
                value: "2099-01-01",
                modality: "observed",
                missingState: null,
                evidence: {
                  sourceDocumentId,
                  page: 1,
                  quote: "this quote does not appear on the page",
                },
              },
            ],
          },
        ],
      };
    }
    return {
      sourceDocumentId,
      documentTypeId,
      recordInstances: [
        {
          recordTypeId: "document",
          instanceIndex: 0,
          fields: [
            {
              fieldId: "document.date",
              provenance: "quoted",
              valueKind: "date",
              value: "2024-11-12",
              modality: "observed",
              missingState: null,
              evidence: { sourceDocumentId, page: 1, quote: "2024-11-12" },
            },
          ],
        },
        {
          recordTypeId: "student",
          instanceIndex: 0,
          fields: [
            {
              fieldId: "student.name",
              provenance: "quoted",
              valueKind: "text",
              value: "Maya Carter",
              modality: "observed",
              missingState: null,
              evidence: { sourceDocumentId, page: 1, quote: "Maya Carter" },
            },
          ],
        },
      ],
    };
  }

  if (normalized === "bankruptcy" || normalized === "unknown") {
    return {
      sourceDocumentId,
      documentTypeId,
      recordInstances: [
        {
          recordTypeId: "document",
          instanceIndex: 0,
          fields: [
            {
              fieldId: "document.title",
              provenance: "quoted",
              valueKind: "text",
              value: "SYNTHETIC",
              modality: "observed",
              missingState: null,
              evidence: { sourceDocumentId, page: 1, quote: "SYNTHETIC" },
            },
          ],
        },
      ],
    };
  }

  throw new Error(`No replay fixture for ${caseId}/${sourceDocumentId}`);
}

export function replayRawAssistantText(parsed: Record<string, unknown>): string {
  return JSON.stringify(parsed);
}
