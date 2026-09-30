import { describe, expect, it } from "vitest";

import { discoverPackForDomain, IEP_DISCOVER_PACK } from "./discover-pack";
import { IEP_L001_CORPUS_DOCUMENT_TYPES } from "./iep-l001-corpus-document-types";

describe("IEP Discover Domain Pack vocabulary", () => {
  it("includes every L001 corpus document type in documentTypes", () => {
    for (const documentType of IEP_L001_CORPUS_DOCUMENT_TYPES) {
      expect(
        IEP_DISCOVER_PACK.documentTypes,
        `missing L001 corpus documentType: ${documentType}`,
      ).toContain(documentType);
    }
  });

  it("includes Document (unclassified) as the only non-corpus fallback label", () => {
    const corpusSet = new Set<string>(IEP_L001_CORPUS_DOCUMENT_TYPES);
    const nonCorpusTypes = IEP_DISCOVER_PACK.documentTypes.filter(
      (type) => !corpusSet.has(type),
    );
    expect(nonCorpusTypes).toEqual(["Document (unclassified)"]);
  });

  it("rejects vocabulary outside the pack documentTypes list", () => {
    const outsidePack = "Medicaid prior authorization";
    expect(IEP_DISCOVER_PACK.documentTypes).not.toContain(outsidePack);
  });

  it("maps each L001 corpus document type to a catalog entry", () => {
    const catalogTypes = new Set(IEP_DISCOVER_PACK.catalog.map((entry) => entry.documentType));
    for (const documentType of IEP_L001_CORPUS_DOCUMENT_TYPES) {
      expect(catalogTypes.has(documentType)).toBe(true);
    }
  });
});

describe("discoverPackForDomain", () => {
  it("returns the registered pack and an empty scaffold for a proposed domain", () => {
    expect(discoverPackForDomain("iep").domainPackId).toBe(IEP_DISCOVER_PACK.domainPackId);
    const tax = discoverPackForDomain("tax", "Tax");
    expect(tax.domainId).toBe("tax");
    expect(tax.domainLabel).toBe("Tax");
    expect(tax.missingExpectations).toEqual([]);
  });
});
