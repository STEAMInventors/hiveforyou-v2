import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { computeProposalPackContentSha256, validateProposalDomainPack } from "@hiveforyou/domain-pack/pack-driven-reader";
import { describe, expect, it } from "vitest";

import {
  compileDeclarativePackToProposal,
  compareSemver,
  normalizePackVersionLabel,
  resolveLatestEligibleDeclarativePack,
  validateDeclarativePackStructure,
} from "../declarative/index.js";
import { loadDeclarativePackFromRoot } from "../declarative/load-raw-pack.js";
import { defaultDeclarativePackRepoRoot } from "../declarative/repo-root.js";
import { DECLARATIVE_PACK_REGISTRATIONS } from "../declarative/register.js";

const REPO_ROOT = defaultDeclarativePackRepoRoot();

describe("declarative pack registry", () => {
  it("validates IEP v0.2.1 structure and compiles to proposal pack", () => {
    const packRoot = join(REPO_ROOT, "engine/domain-packs/iep/v0.2.1");
    const raw = loadDeclarativePackFromRoot(packRoot);
    const structure = validateDeclarativePackStructure(raw);
    expect(structure.errors).toEqual([]);
    expect(structure.valid).toBe(true);

    const compiled = compileDeclarativePackToProposal(raw);
    const validation = validateProposalDomainPack(compiled);
    expect(validation.errors).toEqual([]);
    expect(compiled.documentTypes.length).toBe(23);
    expect(compiled.recordTypes.length).toBeGreaterThan(20);
  });

  it("selects highest semver among registered packs", () => {
    const iep = resolveLatestEligibleDeclarativePack({
      domainId: "iep",
      repoRoot: REPO_ROOT,
      allowPrerelease: true,
    });
    expect(iep.semanticVersion).toBe("0.2.1");
    expect(iep.packContractVersion).toBe("domain-pack-declarative/0.2");
    expect(iep.contentDigest).toMatch(/^[a-f0-9]{64}$/);
    const proposalSha = computeProposalPackContentSha256(iep.compiledProposalPack);
    expect(proposalSha).toMatch(/^[a-f0-9]{64}$/);
  });

  it("compares semver numerically", () => {
    const a = normalizePackVersionLabel("0.2.10")!;
    const b = normalizePackVersionLabel("0.2.9")!;
    expect(compareSemver(a, b)).toBeGreaterThan(0);
  });

  it("excludes prerelease latest unless allowed", () => {
    expect(() =>
      resolveLatestEligibleDeclarativePack({
        domainId: "iep",
        repoRoot: REPO_ROOT,
        allowPrerelease: false,
      }),
    ).toThrow(/No valid compatible/);
  });

  it("runs synthetic non-IEP pack through the same compiler", () => {
    const selection = resolveLatestEligibleDeclarativePack({
      domainId: "synthetic-declarative",
      repoRoot: REPO_ROOT,
    });
    expect(selection.compiledProposalPack.manifest.id).toBe("synthetic-declarative");
    expect(validateProposalDomainPack(selection.compiledProposalPack).valid).toBe(true);
  });

  it("keeps only explicitly registered pack paths", () => {
    expect(DECLARATIVE_PACK_REGISTRATIONS.every((entry) => entry.packRootRelative.startsWith("engine/"))).toBe(
      true,
    );
  });
});

describe("L001 v0.2.1 static coverage", () => {
  it("maps eight L001 document filenames to pack document types", () => {
    const raw = loadDeclarativePackFromRoot(join(REPO_ROOT, "engine/domain-packs/iep/v0.2.1"));
    const ids = new Set(raw.documentTypes.documentTypes.map((doc) => doc.id));
    const l001Types = [
      "referral",
      "evaluation_plan",
      "parent_consent",
      "academic_evaluation",
      "psychoeducational_evaluation",
      "speech_language_evaluation",
      "eligibility",
      "iep_initial",
    ];
    for (const docTypeId of l001Types) {
      expect(ids.has(docTypeId)).toBe(true);
    }
  });
});
