import { join } from "node:path";

import { validateProposalDomainPack } from "@hiveforyou/domain-pack/pack-driven-reader";
import { describe, expect, it } from "vitest";

import { defaultDeclarativePackRepoRoot } from "../declarative/repo-root.js";
import {
  compileMappingPackStageViews,
  computeMappingPackContentDigest,
  loadNativeMappingPackFromRoot,
  MappingPackResolutionError,
  resolveMappingPackForDomain,
  resolvePinnedMappingPack,
  validateMappingPackStructure,
} from "../mapping-pack/index.js";

const REPO_ROOT = defaultDeclarativePackRepoRoot();

function assertSamePinAcrossViews(resolved: ReturnType<typeof compileMappingPackStageViews>) {
  for (const [stage, view] of Object.entries(resolved.views)) {
    expect(view.packPin.packId, stage).toBe(resolved.pin.packId);
    expect(view.packPin.packVersion, stage).toBe(resolved.pin.packVersion);
    expect(view.packPin.contentDigest, stage).toBe(resolved.pin.contentDigest);
  }
}

describe("mapping pack resolver and compiler (DP-02)", () => {
  it("resolves IEP specialized pack with stable digest", () => {
    const resolved = resolveMappingPackForDomain({
      domainId: "iep",
      domainResolution: "known",
      repoRoot: REPO_ROOT,
      allowPrerelease: true,
    });
    expect(resolved.pin.selection).toBe("specialized");
    expect(resolved.pin.packId).toBe("iep");
    expect(resolved.pin.contentDigest).toMatch(/^[a-f0-9]{64}$/);

    const again = resolveMappingPackForDomain({
      domainId: "iep",
      domainResolution: "known",
      repoRoot: REPO_ROOT,
      allowPrerelease: true,
    });
    expect(again.pin.contentDigest).toBe(resolved.pin.contentDigest);

    const compiled = compileMappingPackStageViews(resolved);
    assertSamePinAcrossViews(compiled);
    expect(compiled.views.reader.recordTypeCount).toBeGreaterThan(20);
    expect(validateProposalDomainPack(compiled.views.reader.compiledProposalPack).valid).toBe(true);
  });

  it("falls back to Generic pack for unknown and unresolved domains", () => {
    for (const domainResolution of ["unknown", "unresolved"] as const) {
      const resolved = resolveMappingPackForDomain({
        domainId: "bankruptcy",
        domainResolution,
        repoRoot: REPO_ROOT,
      });
      expect(resolved.pin.selection).toBe("generic_fallback");
      expect(resolved.pin.packId).toBe("generic");
      expect(resolved.pin.packVersion).toBe("1.0.0");
    }

    const noDomain = resolveMappingPackForDomain({ repoRoot: REPO_ROOT });
    expect(noDomain.pin.packId).toBe("generic");
  });

  it("rejects invalid registered pack domains", () => {
    expect(() =>
      resolveMappingPackForDomain({
        domainId: "fixture-malformed",
        domainResolution: "known",
        repoRoot: REPO_ROOT,
      }),
    ).toThrow(MappingPackResolutionError);
  });

  it("rejects missing pinned pack", () => {
    expect(() =>
      resolvePinnedMappingPack({
        repoRoot: REPO_ROOT,
        pin: {
          packId: "missing-pack",
          packVersion: "9.9.9",
          contentDigest: "0".repeat(64),
        },
      }),
    ).toThrow(MappingPackResolutionError);
  });

  it("rejects pack digest mismatch on pin", () => {
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
          contentDigest: "f".repeat(64),
        },
      }),
    ).toThrow(MappingPackResolutionError);
  });

  it("compiles deterministic stage views", () => {
    const generic = resolveMappingPackForDomain({
      domainId: "unknown-domain",
      domainResolution: "unknown",
      repoRoot: REPO_ROOT,
    });
    const a = compileMappingPackStageViews(generic);
    const b = compileMappingPackStageViews(generic);
    expect(a.views.discover).toEqual(b.views.discover);
    expect(a.views.normalizer.predicateTypeCount).toBe(b.views.normalizer.predicateTypeCount);
  });

  it("changes compiled behavior when mapping changes (IEP vs Generic)", () => {
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
    expect(iep.views.reader.recordTypeCount).not.toBe(generic.views.reader.recordTypeCount);
    expect(iep.views.discover.documentTypes).not.toEqual(generic.views.discover.documentTypes);
  });

  it("preserves unexpected source facts via generic mapping policy", () => {
    const genericRoot = join(REPO_ROOT, "engine/domain-packs/generic/v1.0.0");
    const canonical = loadNativeMappingPackFromRoot(genericRoot);
    expect(canonical.concepts.conceptMappingPolicy?.legacyCanonicalConstructBridge).toBe(
      "domain_neutral_mapping_by_typed_construct_parts_and_context",
    );
    expect(canonical.documents.documentProfiles[0]?.allowAdditionalSourceFacts).toBe(true);

    const compiled = compileMappingPackStageViews(
      resolveMappingPackForDomain({ domainResolution: "unknown", repoRoot: REPO_ROOT }),
    );
    const ctx = compiled.views.normalizer.context;
    const bridged = ctx.resolvePredicateTypeId({
      construct: { measure: "custom_measure_xyz" },
      value: { kind: "text", text: "supported" },
    });
    expect(bridged.ok).toBe(true);
  });

  it("validates native Generic pack structure and digest", () => {
    const packRoot = join(REPO_ROOT, "engine/domain-packs/generic/v1.0.0");
    const canonical = loadNativeMappingPackFromRoot(packRoot);
    const validation = validateMappingPackStructure(canonical);
    expect(validation.errors).toEqual([]);
    const digest = computeMappingPackContentDigest({ packRoot, manifest: canonical.manifest });
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
  });
});
