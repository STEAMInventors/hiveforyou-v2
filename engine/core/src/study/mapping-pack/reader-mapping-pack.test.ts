import { defaultDeclarativePackRepoRoot } from "@hiveforyou/domain-packs/declarative";
import {
  MappingPackResolutionError,
  compileMappingPackStageViews,
  resolveMappingPackForDomain,
  resolvePinnedMappingPack,
} from "@hiveforyou/domain-packs/mapping-pack";
import { describe, expect, it } from "vitest";

import { resolveDiscoverMappingPackContextForQualificationCase } from "../../discover/mapping-pack/resolve-discover-mapping-pack-context.js";
import { composeReaderPromptFromMappingPack } from "./compose-reader-prompt-from-mapping-pack.js";
import { qualificationLogicalDocumentsForCase } from "./qualification-fixtures.js";
import { resolveReaderMappingPackContext } from "./resolve-reader-mapping-pack-context.js";
import { runReaderQualificationCase } from "./run-reader-qualification-case.js";
import { validateReaderExtractionWithMappingPack } from "./validate-reader-extraction-mapping-pack.js";
import { resolveResolvedPackForQualificationCase } from "./validate-reader-extraction-mapping-pack.js";

const REPO_ROOT = defaultDeclarativePackRepoRoot();

describe("DP-03B — Reader consumes Mapping Pack reader view", () => {
  it("selects IEP specialized pack for L001 qualification case", () => {
    const result = runReaderQualificationCase("L001");
    expect(result.packPin.packId).toBe("iep");
    expect(result.packPin.selection).toBe("specialized");
    expect(result.validationOk).toBe(true);
    expect(result.compliance.counts.accepted).toBeGreaterThan(0);
    expect(result.compliance.documents[0]?.rawModelJsonPreserved).toBe(true);
  });

  it("uses the same mapping pack digest as Discover for L001", () => {
    const reader = runReaderQualificationCase("L001");
    const discover = resolveDiscoverMappingPackContextForQualificationCase("L001");
    expect(reader.packPin.contentDigest).toBe(discover.pin.contentDigest);
  });

  it("selects Generic pack for unknown and bankruptcy qualification cases", () => {
    for (const caseId of ["unknown", "bankruptcy"] as const) {
      const result = runReaderQualificationCase(caseId);
      expect(result.packPin.packId).toBe("generic");
      expect(result.packPin.selection).toBe("generic_fallback");
      expect(result.validationOk).toBe(true);
    }
  });

  it("rejects invalid evidence during qualification replay", () => {
    const context = resolveReaderMappingPackContext({
      domainId: "iep",
      domainResolution: "known",
      repoRoot: REPO_ROOT,
      allowPrerelease: true,
    });
    const resolvedPack = resolveResolvedPackForQualificationCase("L001", context);
    const outcome = validateReaderExtractionWithMappingPack({
      caseId: "L001",
      context,
      resolvedPack,
      replayVariant: "invalid_evidence",
    });
    expect(outcome.compliance.counts.rejected).toBeGreaterThan(0);
    expect(outcome.compliance.validationOk).toBe(false);
  });

  it("does not treat expected-but-absent checklist fields as extracted facts", () => {
    const result = runReaderQualificationCase("L001");
    const inventedAbsence = result.compliance.facts.filter((fact) =>
      fact.fieldId.includes("not_found"),
    );
    expect(inventedAbsence).toHaveLength(0);
    expect(result.compliance.coverageGaps.length).toBeGreaterThan(0);
  });

  it("retains source document, page, and quote on accepted facts", () => {
    const result = runReaderQualificationCase("L001");
    const accepted = result.compliance.facts.filter((fact) => fact.disposition === "accepted");
    expect(accepted.length).toBeGreaterThan(0);
    for (const fact of accepted) {
      expect(fact.evidence?.sourceDocumentId).toBe("l001-src-8");
      expect(fact.evidence?.page).toBeGreaterThan(0);
      expect(fact.evidence?.quote?.trim().length).toBeGreaterThan(0);
      expect(fact.packPin.contentDigest).toBe(result.packPin.contentDigest);
    }
  });

  it("changes reader stable prefix when IEP vs Generic mapping pack applies", () => {
    const iep = resolveReaderMappingPackContext({
      domainId: "iep",
      domainResolution: "known",
      repoRoot: REPO_ROOT,
      allowPrerelease: true,
    });
    const generic = resolveReaderMappingPackContext({
      domainId: "bankruptcy",
      domainResolution: "unknown",
      repoRoot: REPO_ROOT,
    });
    const manifest = qualificationLogicalDocumentsForCase("bankruptcy");
    const pages = [{ pageNumber: 1, text: "SYNTHETIC bankruptcy qualification fixture text." }];
    const iepPrompt = composeReaderPromptFromMappingPack(iep, {
      caseManifest: manifest.map((doc) => ({
        sourceDocumentId: doc.sourceDocumentId,
        pageCount: 1,
      })),
      document: { sourceDocumentId: manifest[0]!.sourceDocumentId, pages },
    });
    const genericPrompt = composeReaderPromptFromMappingPack(generic, {
      caseManifest: manifest.map((doc) => ({
        sourceDocumentId: doc.sourceDocumentId,
        pageCount: 1,
      })),
      document: { sourceDocumentId: manifest[0]!.sourceDocumentId, pages },
    });
    expect(iepPrompt.stableSystemPrefix).not.toBe(genericPrompt.stableSystemPrefix);
  });

  it("fails explicitly for invalid registered mapping pack domain", () => {
    expect(() =>
      resolveMappingPackForDomain({
        domainId: "fixture-malformed",
        domainResolution: "known",
        repoRoot: REPO_ROOT,
      }),
    ).toThrow(MappingPackResolutionError);
  });

  it("fails explicitly on pinned pack digest mismatch", () => {
    const iep = resolveMappingPackForDomain({
      domainId: "iep",
      domainResolution: "known",
      repoRoot: REPO_ROOT,
      allowPrerelease: true,
    });
    expect(() =>
      resolvePinnedMappingPack({
        repoRoot: REPO_ROOT,
        pin: {
          packId: iep.pin.packId,
          packVersion: iep.pin.packVersion,
          contentDigest: "0".repeat(64),
        },
      }),
    ).toThrow(MappingPackResolutionError);
  });

  it("keeps identical pack identity/digest across resolver, prompt, and compliance", () => {
    const context = resolveReaderMappingPackContext({
      domainId: "iep",
      domainResolution: "known",
      repoRoot: REPO_ROOT,
      allowPrerelease: true,
    });
    const digest = context.pin.contentDigest;
    const result = runReaderQualificationCase("L001");
    expect(result.compliance.packPin.contentDigest).toBe(digest);
    expect(result.compliance.documents[0]?.prompt.packId).toBe(context.pin.packId);
  });

  it("documents type → mapping → extraction → verification inspectable trace", () => {
    const result = runReaderQualificationCase("L001");
    const doc = result.compliance.documents[0]!;
    expect(doc.discoverDocumentTypeLabel).toBe("Initial individualized education program");
    expect(doc.resolvedDocumentTypeId).toBe("iep_initial");
    expect(doc.conceptMappingsApplied.length).toBeGreaterThan(0);
    expect(result.compliance.facts.some((fact) => fact.disposition === "accepted")).toBe(true);
  });

  it("compiled reader view matches mapping pack stage contract", () => {
    const iep = compileMappingPackStageViews(
      resolveMappingPackForDomain({
        domainId: "iep",
        domainResolution: "known",
        repoRoot: REPO_ROOT,
        allowPrerelease: true,
      }),
    );
    expect(iep.views.reader.schemaVersion).toBe("hive.mapping-pack-reader-view/1");
  });
});
