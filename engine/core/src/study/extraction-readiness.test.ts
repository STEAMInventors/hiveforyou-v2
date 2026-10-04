import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import type { CanonicalStudyProposal } from "@hiveforyou/shared/case-intelligence/3";
import { extractDocument } from "@hiveforyou/intake";

import { loadCanonicalStudyPrompt } from "../prompts/load-canonical-study-prompt";
import { composeCanonicalStudyPromptInputs } from "../prompts/compose-canonical-study-inputs";
import { buildCanonicalStudyUserMessage } from "./openai-engine-v3";
import { buildExtractionReadiness } from "./build-extraction-readiness";
import {
  attachUnreadablePageCaveats,
  extractionMissingInformationRows,
} from "./apply-extraction-readiness";
import { validateCanonicalStudyProposalV3 } from "./validate-proposal-v3";
import type { CanonicalStudyEngineV3, CanonicalStudyEngineV3Runtime } from "./engine-v3";

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../intake/fixtures/extraction/files");

async function extractFixturePdf(name: string) {
  const bytes = new Uint8Array(readFileSync(join(fixtureRoot, name)));
  const sourceHash = createHash("sha256").update(bytes).digest("hex");
  const result = await extractDocument(
    {
      documentId: `fixture-${name}`,
      bytes,
      mimeType: "application/pdf",
      sourceHash,
    },
    { ocrEngine: null },
  );
  if (!result.normalizedExtraction) {
    throw new Error(`No extraction for ${name}`);
  }
  return result.normalizedExtraction;
}

function studyContext(overrides?: Partial<CanonicalStudyContext>): CanonicalStudyContext {
  return {
    schemaVersion: "canonical-study-context/2",
    caseId: "case-fixture",
    studyRunId: "study-fixture-1",
    idempotencyKey: "idem-1",
    createdAt: new Date().toISOString(),
    domainLabel: "Special education records",
    domainId: "iep",
    domainPackId: "domain-pack/iep",
    domainPackVersion: "0.0.0-test",
    domainPackVocabulary: {
      entityTypes: [],
      claimTypes: [],
      relationshipTypes: [],
      eventTypes: [],
    },
    sourceDocuments: [
      {
        stagedDocumentId: "staged-1",
        discoveryDocumentId: "logic-1",
        sourceDocumentId: "src-mixed",
        originalFilename: "10-mixed-native-scanned.pdf",
        sizeBytes: 1000,
        mimeType: "application/pdf",
        sha256: "abc",
        storageBucket: "b",
        storagePath: "p",
      },
    ],
    engine1Result: {
      domainLabel: "Special education records",
      domainResolutionStatus: "resolved",
      groups: [],
      documents: [],
      relationships: [],
      missingDocuments: [],
    },
    questionSetVersion: "qs-1",
    questionSet: { id: "qs-1", questions: [] },
    answerSnapshot: {
      questionSetId: "qs-1",
      answers: {},
      missingNodeStates: {},
      ambiguityNodeStates: {},
      analysisIntent: { choiceIds: [] },
      userContext: null,
    },
    logicalDocuments: [
      {
        id: "logic-1",
        sourceDocumentId: "src-mixed",
        pageStart: 1,
        pageEnd: 2,
        documentType: "IEP",
        title: "IEP",
        groupId: "planning",
        familyRole: "current",
      },
    ],
    processingPolicy: {
      intentAffectsFacts: false,
      providerId: "fixture",
      providerMode: "fixture",
    },
    ...overrides,
  };
}

describe("extraction readiness", () => {
  it("fixture 10 (PARTIAL) produces one readiness row with dual page numbering", async () => {
    const normalized = await extractFixturePdf("10-mixed-native-scanned.pdf");
    const context = studyContext();
    const extractions = new Map([["src-mixed", normalized]]);
    const readiness = buildExtractionReadiness({ context, extractionsBySourceId: extractions });
    expect(readiness?.documents).toHaveLength(1);
    expect(readiness?.documents[0]?.status).toBe("PARTIAL");
    expect(readiness?.documents[0]?.unreadableRanges).toHaveLength(1);
    const range = readiness!.documents[0]!.unreadableRanges[0]!;
    expect(range.sourcePageStart).toBe(2);
    expect(range.sourcePageEnd).toBe(2);
    expect(range.reasonCodes).toContain("OCR_UNAVAILABLE");
    expect(range.logicalDocuments).toEqual([
      { logicalDocumentId: "logic-1", pageStart: 2, pageEnd: 2 },
    ]);
    const rows = extractionMissingInformationRows(readiness!, context);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.description).toContain("pages 2 of the upload = pages 2 of the IEP");
  });

  it("fixture 01 (NEEDS_OCR) produces a could-not-be-read-at-all row", async () => {
    const normalized = await extractFixturePdf("01-scanned-image-only.pdf");
    const context = studyContext({
      sourceDocuments: [
        {
          stagedDocumentId: "staged-1",
          discoveryDocumentId: "logic-1",
          sourceDocumentId: "src-scan",
          originalFilename: "01-scanned-image-only.pdf",
          sizeBytes: 1000,
          mimeType: "application/pdf",
          sha256: "abc",
          storageBucket: "b",
          storagePath: "p",
        },
      ],
      logicalDocuments: [],
    });
    const readiness = buildExtractionReadiness({
      context,
      extractionsBySourceId: new Map([["src-scan", normalized]]),
    });
    expect(readiness?.documents[0]?.status).toBe("NEEDS_OCR");
    const rows = extractionMissingInformationRows(readiness!, context);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.description).toMatch(/couldn't be read at all/i);
  });

  it("attaches a caveat when the model claims not found on unreadable pages", () => {
    const readiness = buildExtractionReadiness({
      context: studyContext(),
      extractionsBySourceId: new Map([
        [
          "src-mixed",
          {
            schemaVersion: "nestiep-recovered-document/1",
            extractorVersion: "nestiep-extractor/4",
            sourceDocumentId: "src-mixed",
            sourceHash: "x",
            mimeType: "application/pdf",
            detectedKind: "pdf",
            statistics: { pageCount: 2, nativePageCount: 2, ocrPageCount: 0 },
            sourceIssues: [],
            unreadablePageRanges: [{ start: 2, end: 2 }],
            pages: [],
          },
        ],
      ]),
    });
    const baseValidation = validateCanonicalStudyProposalV3(studyContext(), {
      schemaVersion: "canonical-study-proposal/3",
      domainId: "iep",
      entities: [],
      claims: [],
      conflicts: [],
      missingInformation: [
        {
          id: "gap-goal",
          description: "Annual goal not found in the IEP.",
          proposalLineage: { proposalItemId: "gap-goal", studyRunId: "study-fixture-1" },
        },
      ],
      modelMetadata: { providerId: "fake", proposalMode: "fixture" },
      proposedAt: new Date().toISOString(),
    });
    const enriched = attachUnreadablePageCaveats(
      baseValidation,
      readiness!,
      studyContext(),
    );
    expect(enriched.accepted.missingInformation[0]?.description).toContain(
      "[Unreadable pages caveat]",
    );
  });

  it("leaves the Engine 2 user message unchanged when there are no unreadable pages", () => {
    const prompt = loadCanonicalStudyPrompt("canonical-study-v4");
    const context = studyContext({ logicalDocuments: [] });
    const composed = composeCanonicalStudyPromptInputs(prompt, context);
    const baseline = buildCanonicalStudyUserMessage(composed, context, {
      extractionLocatorCatalog: null,
      extractionReadiness: null,
      recognitionVocabulary: null,
    });
    const withEmptyReadiness = buildCanonicalStudyUserMessage(composed, context, {
      extractionLocatorCatalog: null,
      extractionReadiness: null,
      recognitionVocabulary: null,
    });
    expect(withEmptyReadiness).toBe(baseline);
  });
});

class FakeProposalEngine implements CanonicalStudyEngineV3 {
  constructor(private readonly proposal: CanonicalStudyProposal) {}

  async study(
    _context: CanonicalStudyContext,
    _runtime?: CanonicalStudyEngineV3Runtime,
  ): Promise<CanonicalStudyProposal> {
    return this.proposal;
  }
}

describe("FakeProposalEngine hook", () => {
  it("exposes injected proposals for orchestration tests", async () => {
    const engine = new FakeProposalEngine({
      schemaVersion: "canonical-study-proposal/3",
      domainId: "iep",
      entities: [],
      claims: [],
      conflicts: [],
      missingInformation: [],
      modelMetadata: { providerId: "fake", proposalMode: "fixture" },
      proposedAt: new Date().toISOString(),
    });
    const proposal = await engine.study(studyContext());
    expect(proposal.modelMetadata.providerId).toBe("fake");
  });
});
