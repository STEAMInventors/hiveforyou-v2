import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { DomainPack } from "@hiveforyou/domain-pack";
import {
  createDomainPackRegistry,
  domainPackRecordId,
  genericProConfig,
  getDomainPackByDomainId,
} from "@hiveforyou/domain-pack";
import "@hiveforyou/domain-packs";
import {
  assertSafeDomainId,
  buildStudyAgentsExportArtifact,
  defaultRepoRoot,
  resolveStudyAgentsExport,
  serializeStudyAgentsExportJson,
  studyAgentsExportOutputPath,
  STUDY_AGENTS_EXPORT_SCHEMA_VERSION,
  STUDY_AGENT_ROLES,
} from "./pack-export.ts";

const EXTRANEOUS_TOP_LEVEL_KEYS = [
  "vocabulary",
  "studyGuidance",
  "focusConstructs",
  "domainLabel",
  "manifest",
  "narrative",
  "discover",
];

function minimalManifest(id: string) {
  return {
    id,
    name: id,
    description: "",
    version: "1.0.0-test",
    status: "scaffold" as const,
    capabilities: [] as const,
    routable: false,
    executable: false,
  };
}

function minimalPack(overrides: Partial<DomainPack> & Pick<DomainPack, "manifest">): DomainPack {
  return {
    narrative: { opening: "", chapters: [], templates: [], plain: {} },
    story: {
      anchorDocType: "",
      supportingWindowDays: 0,
      gapMonths: 0,
      gapExpectedDocTypes: [],
      gapMissingLabel: "",
      plainLabels: {},
      plainValues: {},
      units: {},
    },
    pro: genericProConfig(),
    ...overrides,
  };
}

describe("pack-export", () => {
  it("serializes deterministically with stable property order and trailing newline", () => {
    const artifact = resolveStudyAgentsExport("iep");
    const first = serializeStudyAgentsExportJson(artifact);
    const second = serializeStudyAgentsExportJson(artifact);
    expect(first).toBe(second);
    expect(first.endsWith("\n")).toBe(true);
    expect(first.endsWith("\n\n")).toBe(false);

    const keyOrder = [
      '"schemaVersion"',
      '"domainId"',
      '"domainPackId"',
      '"domainPackVersion"',
      '"readerCoverage"',
      '"agents"',
      '"intake"',
      '"reader"',
      '"investigator"',
      '"writer"',
    ];
    for (let index = 0; index < keyOrder.length - 1; index += 1) {
      const current = first.indexOf(keyOrder[index]!);
      const next = first.indexOf(keyOrder[index + 1]!);
      expect(current).toBeGreaterThanOrEqual(0);
      expect(next).toBeGreaterThan(current);
    }
  });

  it("exports identity and version from the registered IEP study snapshot", () => {
    const artifact = resolveStudyAgentsExport("iep");
    expect(artifact.schemaVersion).toBe(STUDY_AGENTS_EXPORT_SCHEMA_VERSION);
    expect(artifact.domainId).toBe("iep");
    expect(artifact.domainPackId).toBe(domainPackRecordId("iep"));
    expect(artifact.domainPackVersion).toBe("0.0.0-scaffold");
    for (const role of STUDY_AGENT_ROLES) {
      expect(artifact.agents[role].trim().length).toBeGreaterThan(0);
    }
  });

  it("fails on unknown domain", () => {
    expect(() => resolveStudyAgentsExport("not-a-registered-pack")).toThrow(
      'No domain pack is registered for "not-a-registered-pack".',
    );
  });

  it("fails when study.agents is missing or incomplete", () => {
    const registry = createDomainPackRegistry();
    const domainId = "export-test-missing-agents";
    registry.register(
      minimalPack({
        manifest: minimalManifest(domainId),
        study: {
          domainId,
          domainPackId: domainPackRecordId(domainId),
          domainPackVersion: "1.0.0-test",
          domainLabel: "Test",
          vocabulary: {
            entityTypes: [],
            claimTypes: [],
            relationshipTypes: [],
            eventTypes: [],
          },
        },
      }),
    );
    const pack = registry.getDomainPackByDomainId(domainId)!;
    expect(() => buildStudyAgentsExportArtifact(pack, domainId)).toThrow(
      'Domain pack "export-test-missing-agents" has no study.agents instructions.',
    );

    const incompleteDomainId = "export-test-incomplete-agents";
    registry.register(
      minimalPack({
        manifest: minimalManifest(incompleteDomainId),
        study: {
          domainId: incompleteDomainId,
          domainPackId: domainPackRecordId(incompleteDomainId),
          domainPackVersion: "1.0.0-test",
          domainLabel: "Test",
          vocabulary: {
            entityTypes: [],
            claimTypes: [],
            relationshipTypes: [],
            eventTypes: [],
          },
          agents: {
            intake: "ok",
            reader: "   ",
            investigator: "ok",
            writer: "ok",
          },
        },
      }),
    );
    const incomplete = registry.getDomainPackByDomainId(incompleteDomainId)!;
    expect(() => buildStudyAgentsExportArtifact(incomplete, incompleteDomainId)).toThrow(
      'Domain pack "export-test-incomplete-agents" study.agents.reader must be a non-empty string.',
    );
  });

  it("does not serialize extraneous pack fields", () => {
    const artifact = resolveStudyAgentsExport("iep");
    const parsed = JSON.parse(serializeStudyAgentsExportJson(artifact)) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual([
      "agents",
      "domainId",
      "domainPackId",
      "domainPackVersion",
      "readerCoverage",
      "schemaVersion",
    ]);
    expect(Object.keys(parsed.agents as Record<string, unknown>).sort()).toEqual([
      ...STUDY_AGENT_ROLES,
    ].sort());
    for (const key of EXTRANEOUS_TOP_LEVEL_KEYS) {
      expect(parsed).not.toHaveProperty(key);
    }
  });

  it("keeps the committed IEP agents.json synchronized with the registered pack", () => {
    const pack = getDomainPackByDomainId("iep");
    expect(pack).not.toBeNull();

    const generated = serializeStudyAgentsExportJson(resolveStudyAgentsExport("iep"));
    const outputPath = studyAgentsExportOutputPath(defaultRepoRoot(), "iep");
    const committedBytes = readFileSync(outputPath);
    const generatedBytes = Buffer.from(generated, "utf8");
    // Compare the committed file directly. Vitest snapshots can be refreshed with -u and hide drift.
    expect(committedBytes.equals(generatedBytes)).toBe(true);

    const parsed = JSON.parse(committedBytes.toString("utf8")) as Record<string, unknown>;
    expect(parsed.schemaVersion).toBe("study-agents/1");
    expect(parsed.schemaVersion).toBe(STUDY_AGENTS_EXPORT_SCHEMA_VERSION);
    expect(parsed.domainId).toBe("iep");
    expect(parsed.domainId).toBe(pack!.manifest.id);
    expect(parsed.domainPackId).toBe(domainPackRecordId(pack!.manifest.id));
    expect(parsed.domainPackVersion).toBe(pack!.manifest.version);
    expect(Object.keys(parsed)).toEqual([
      "schemaVersion",
      "domainId",
      "domainPackId",
      "domainPackVersion",
      "readerCoverage",
      "agents",
    ]);
    const readerCoverage = parsed.readerCoverage as Record<string, unknown>;
    expect(typeof readerCoverage.domainLabel).toBe("string");
    expect(Array.isArray(readerCoverage.documentTypes)).toBe(true);
    expect((readerCoverage.documentTypes as unknown[]).length).toBeGreaterThan(0);
    expect(Array.isArray(readerCoverage.vocabulary)).toBe(true);
    expect((readerCoverage.vocabulary as unknown[]).length).toBeGreaterThan(0);
    const agents = parsed.agents as Record<string, unknown>;
    expect(Object.keys(agents)).toEqual([...STUDY_AGENT_ROLES]);
    for (const role of STUDY_AGENT_ROLES) {
      expect(typeof agents[role]).toBe("string");
      expect((agents[role] as string).trim().length).toBeGreaterThan(0);
    }
    for (const key of EXTRANEOUS_TOP_LEVEL_KEYS) {
      expect(parsed).not.toHaveProperty(key);
      expect(agents).not.toHaveProperty(key);
    }
  });

  it("rejects unsafe domain identifiers", () => {
    expect(() => assertSafeDomainId("../iep")).toThrow(/path traversal/i);
    expect(() => assertSafeDomainId("iep/extra")).toThrow(/path traversal/i);
    expect(() => assertSafeDomainId(" IEP")).toThrow(/trimmed/i);
  });
});
