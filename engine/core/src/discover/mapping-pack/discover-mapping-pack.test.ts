import { defaultDeclarativePackRepoRoot } from "@hiveforyou/domain-packs/declarative";
import {
  MappingPackResolutionError,
  compileMappingPackStageViews,
  resolveMappingPackForDomain,
  resolvePinnedMappingPack,
} from "@hiveforyou/domain-packs/mapping-pack";
import { describe, expect, it } from "vitest";

import { loadDiscoverPrompt } from "../../prompts/load-discover-prompt.js";
import { composeDiscoverPromptInputsFromMappingPack } from "./compose-discover-prompt-from-mapping-pack.js";
import {
  invalidDocumentTypeProposal,
  qualificationProposalForCase,
  qualificationSourcesForCase,
} from "./qualification-fixtures.js";
import { resolveDiscoverMappingPackContext } from "./resolve-discover-mapping-pack-context.js";
import { runDiscoverQualificationCase } from "./run-discover-qualification-case.js";
import { validateDiscoveryProposalWithMappingPack } from "./validate-discovery-proposal-mapping-pack.js";

const REPO_ROOT = defaultDeclarativePackRepoRoot();

describe("DP-03A — Discover consumes Mapping Pack discover view", () => {
  it("selects IEP specialized pack for L001 qualification case", () => {
    const result = runDiscoverQualificationCase("L001");
    expect(result.packPin.packId).toBe("iep");
    expect(result.packPin.selection).toBe("specialized");
    expect(result.validationOk).toBe(true);
    expect(result.compliance.classifications.every((row) => row.disposition === "accepted")).toBe(
      true,
    );
  });

  it("requires proposed document types to exist in the selected pack", () => {
    const context = resolveDiscoverMappingPackContext({
      domainId: "iep",
      domainResolution: "known",
      repoRoot: REPO_ROOT,
      allowPrerelease: true,
    });
    const allowed = new Set(context.discoverView.documentTypes);
    const proposal = qualificationProposalForCase("L001");
    for (const doc of proposal.logicalDocuments) {
      expect(allowed.has(doc.documentType)).toBe(true);
    }
  });

  it("rejects recognized document types that are not in the compiled pack", () => {
    const context = resolveDiscoverMappingPackContext({
      domainId: "iep",
      domainResolution: "known",
      repoRoot: REPO_ROOT,
      allowPrerelease: true,
    });
    const sources = qualificationSourcesForCase("L001");
    const bad = invalidDocumentTypeProposal("iep");
    const outcome = validateDiscoveryProposalWithMappingPack(bad, sources, context);
    expect(outcome.validation.ok).toBe(false);
    expect(outcome.compliance.classifications[0]?.disposition).toBe("rejected");
  });

  it("selects Generic pack for unknown domain qualification case", () => {
    const result = runDiscoverQualificationCase("unknown");
    expect(result.packPin.packId).toBe("generic");
    expect(result.packPin.selection).toBe("generic_fallback");
    expect(result.validationOk).toBe(true);
  });

  it("selects Generic pack for bankruptcy qualification case", () => {
    const result = runDiscoverQualificationCase("bankruptcy");
    expect(result.packPin.packId).toBe("generic");
    expect(result.validationOk).toBe(true);
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

  it("changes permitted classification when Document Profiles change (IEP vs Generic)", () => {
    const iep = compileMappingPackStageViews(
      resolveMappingPackForDomain({
        domainId: "iep",
        domainResolution: "known",
        repoRoot: REPO_ROOT,
        allowPrerelease: true,
      }),
    );
    const generic = compileMappingPackStageViews(
      resolveMappingPackForDomain({
        domainId: "bankruptcy",
        domainResolution: "unknown",
        repoRoot: REPO_ROOT,
      }),
    );
    expect(iep.views.discover.documentTypes).not.toEqual(generic.views.discover.documentTypes);
    expect(iep.views.discover.documentTypes.length).toBeGreaterThan(generic.views.discover.documentTypes.length);
  });

  it("keeps identical pack identity/digest across resolver, prompt, validator, and compliance", () => {
    const context = resolveDiscoverMappingPackContext({
      domainId: "iep",
      domainResolution: "known",
      repoRoot: REPO_ROOT,
      allowPrerelease: true,
    });
    const prompt = loadDiscoverPrompt("discover-v2");
    const composed = composeDiscoverPromptInputsFromMappingPack(
      prompt,
      qualificationSourcesForCase("L001"),
      context,
    );
    const outcome = validateDiscoveryProposalWithMappingPack(
      qualificationProposalForCase("L001"),
      qualificationSourcesForCase("L001"),
      context,
    );
    const digest = context.pin.contentDigest;
    expect(composed.mappingPackPin.contentDigest).toBe(digest);
    expect(outcome.compliance.packPin.contentDigest).toBe(digest);
    expect(composed.domainPackVocabulary).toContain(digest);
  });

  it("retains source and page identity in compliance classifications", () => {
    const result = runDiscoverQualificationCase("L001");
    const iepDoc = result.compliance.classifications.find((row) => row.logicalDocumentId === "doc-iep");
    expect(iepDoc?.sourceDocumentId).toBe("l001-src-iep-001");
    expect(iepDoc?.pageStart).toBe(1);
    expect(iepDoc?.pageEnd).toBe(42);
  });
});
