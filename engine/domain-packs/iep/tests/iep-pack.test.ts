import { describe, expect, it } from "vitest";

import { iepDocumentInterpreter, iepDomainPack } from "../pack";
import { IEP_L001_CORPUS_DOCUMENT_TYPES } from "../document-types";
import { IEP_VOCABULARY } from "../vocabulary/iep-vocabulary";

describe("IEP recognition vocabulary", () => {
  it("registers terms on the domain pack with unique termIds", () => {
    expect(iepDomainPack.recognitionVocabulary).toBe(IEP_VOCABULARY);
    const ids = IEP_VOCABULARY.map((term) => term.termId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(80);
  });

  it("includes core plan abbreviations with regulation hints", () => {
    const iep = IEP_VOCABULARY.find((term) => term.termId === "iep");
    expect(iep?.abbreviations).toContain("IEP");
    expect(iep?.regulation).toMatch(/300\.320/);
  });
});

describe("IEP discover vocabulary", () => {
  it("includes every L001 corpus document type in documentTypes", () => {
    const documentTypes = iepDomainPack.discover.documentTypes;
    for (const documentType of IEP_L001_CORPUS_DOCUMENT_TYPES) {
      expect(documentTypes, `missing L001 corpus documentType: ${documentType}`).toContain(
        documentType,
      );
    }
  });

  it("includes Document (unclassified) as the only non-corpus fallback label", () => {
    const corpusSet = new Set<string>(IEP_L001_CORPUS_DOCUMENT_TYPES);
    const nonCorpusTypes = iepDomainPack.discover.documentTypes.filter(
      (type) => !corpusSet.has(type),
    );
    expect(nonCorpusTypes).toEqual(["Document (unclassified)"]);
  });

  it("maps each L001 corpus document type to a catalog entry", () => {
    const catalogTypes = new Set(
      iepDomainPack.discover.catalog.map((entry) => entry.documentType),
    );
    for (const documentType of IEP_L001_CORPUS_DOCUMENT_TYPES) {
      expect(catalogTypes.has(documentType)).toBe(true);
    }
  });
});

describe("IEP document interpreter", () => {
  it("classifies a filename only when the catalog stores a hint", () => {
    expect(iepDocumentInterpreter.classifyLogicalDocumentByFilename("annual-iep.pdf")?.catalogId).toBe(
      "iep",
    );
    expect(iepDocumentInterpreter.classifyLogicalDocumentByFilename("notice.pdf")).toBeNull();
  });

  it("returns a single page span for legacy split helper", () => {
    expect(iepDocumentInterpreter.splitLogicalDocuments(4)).toEqual([
      { pageStart: 1, pageEnd: 4 },
    ]);
    expect(iepDocumentInterpreter.splitLogicalDocuments(0)).toEqual([]);
  });

  it("defines no pack-backed missing-document expectations until sourced", () => {
    expect(iepDomainPack.discover.missingExpectations).toEqual([]);
    expect(iepDocumentInterpreter.unmetEvidenceRequirements(["Prior Written Notice"])).toEqual(
      [],
    );
  });

  it("defines no intake questions yet", () => {
    expect(iepDocumentInterpreter.intakeQuestions).toEqual([]);
  });
});

describe("IEP case map projection guidance", () => {
  it("registers construct-driven zones without document-type backbone", () => {
    const guidance = iepDomainPack.caseMapProjection;
    expect(guidance?.zones.length).toBeGreaterThan(0);
    expect(guidance?.zones.some((zone) => zone.zoneId === "goals")).toBe(true);
    expect(guidance?.zones.every((zone) => !zone.label.match(/IEP document/i))).toBe(true);
  });
});
