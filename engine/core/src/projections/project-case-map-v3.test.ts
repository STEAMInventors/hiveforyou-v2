import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getCaseMapProjectionByDomainId } from "@hiveforyou/domain-packs";
import { validateCaseMap } from "@hiveforyou/shared/projections";
import { describe, expect, it } from "vitest";

import type { CaseProjectionRepository } from "../persistence/case-projection-repository";
import { buildCaseProjectionsV3, persistCaseProjectionsV3 } from "./build-and-persist-projections-v3";
import { l001LikeCanonicalSnapshot } from "./fixtures/l001-like-canonical-snapshot";
import { projectCaseMapV3 } from "./project-case-map-v3";

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "fixtures" || entry.endsWith(".test.ts")) {
      continue;
    }
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (entry.endsWith(".ts")) {
      files.push(path);
    }
  }
  return files;
}

describe("projectCaseMapV3", () => {
  it("validates case-map/1 schema for L001-like snapshot", () => {
    const intelligence = l001LikeCanonicalSnapshot();
    const pack = getCaseMapProjectionByDomainId("iep");
    const map = projectCaseMapV3({ intelligence, packProjection: pack });
    const validated = validateCaseMap(map);
    expect(validated.ok, JSON.stringify(validated.issues)).toBe(true);
    expect(map.schemaVersion).toBe("case-map/1");
  });

  it("is deterministic for node ids and ordering", () => {
    const intelligence = l001LikeCanonicalSnapshot();
    const pack = getCaseMapProjectionByDomainId("iep");
    const first = projectCaseMapV3({ intelligence, packProjection: pack });
    const second = projectCaseMapV3({ intelligence, packProjection: pack });
    expect(first.nodes.map((node) => node.id)).toEqual(second.nodes.map((node) => node.id));
    expect(first.edges.map((edge) => edge.id)).toEqual(second.edges.map((edge) => edge.id));
    expect(first.chronology.map((row) => row.id)).toEqual(second.chronology.map((row) => row.id));
  });

  it("places IEP constructs in pack zones and unknown constructs in fallback", () => {
    const intelligence = l001LikeCanonicalSnapshot();
    const pack = getCaseMapProjectionByDomainId("iep");
    const map = projectCaseMapV3({ intelligence, packProjection: pack });
    const zoneIds = new Set(
      map.nodes.filter((node) => node.kind === "zone").map((node) => node.zoneId),
    );
    expect(zoneIds.has("goals")).toBe(true);
    expect(zoneIds.has("services_supports")).toBe(true);
    expect(zoneIds.has("fallback")).toBe(true);
    const novelFact = map.nodes.find((node) => node.id === "fact:claim-novel");
    expect(novelFact?.zoneId).toBe("fallback");
  });

  it("preserves claim linkage and roles on fact nodes", () => {
    const intelligence = l001LikeCanonicalSnapshot();
    const map = projectCaseMapV3({
      intelligence,
      packProjection: getCaseMapProjectionByDomainId("iep"),
    });
    const current = map.nodes.find((node) => node.id === "fact:claim-eligibility");
    const historical = map.nodes.find((node) => node.id === "fact:claim-service-old");
    expect(current?.claimIds).toEqual(["claim-eligibility"]);
    expect(current?.claimRole).toBe("current");
    expect(current?.disclosureLevel).toBe("prominent");
    expect(historical?.claimRole).toBe("superseded");
    expect(historical?.disclosureLevel).toBe("quiet");
  });

  it("projects snapshot changes without inferring new ones", () => {
    const intelligence = l001LikeCanonicalSnapshot();
    const map = projectCaseMapV3({
      intelligence,
      packProjection: getCaseMapProjectionByDomainId("iep"),
    });
    expect(map.nodes.filter((node) => node.kind === "change")).toHaveLength(1);
    expect(map.nodes.find((node) => node.kind === "change")?.fromClaimId).toBe("claim-service-old");
  });

  it("creates conflict attention and evidence-gap ghost nodes", () => {
    const intelligence = l001LikeCanonicalSnapshot();
    const map = projectCaseMapV3({
      intelligence,
      packProjection: getCaseMapProjectionByDomainId("iep"),
    });
    expect(map.nodes.some((node) => node.kind === "ghost" && node.unresolvedId === "gap-minutes-total")).toBe(
      true,
    );
    expect(
      map.attention.some(
        (item) => item.kind === "conflict" && item.conflictId === "conflict-minutes",
      ),
    ).toBe(true);
    expect(map.attention.some((item) => item.kind === "evidence_gap")).toBe(true);
  });

  it("projects chronology from snapshot events", () => {
    const intelligence = l001LikeCanonicalSnapshot();
    const map = projectCaseMapV3({
      intelligence,
      packProjection: getCaseMapProjectionByDomainId("iep"),
    });
    expect(map.chronology.map((row) => row.eventId)).toEqual([
      "event-referral",
      "event-iep-meeting",
    ]);
    expect(map.chronology[0]?.occurredOn).toBe("2023-11-01");
  });

  it("persists case_map projection kind", async () => {
    const intelligence = l001LikeCanonicalSnapshot();
    const saved: Array<{ projectionKind: string; schemaVersion: string }> = [];
    const repo: CaseProjectionRepository = {
      async save(record) {
        saved.push({
          projectionKind: record.projectionKind,
          schemaVersion: record.schemaVersion,
        });
      },
      async get() {
        return null;
      },
    };
    await persistCaseProjectionsV3(repo, {
      intelligence,
      caseMapProjection: getCaseMapProjectionByDomainId("iep"),
    });
    expect(saved.some((row) => row.projectionKind === "case_map" && row.schemaVersion === "case-map/1")).toBe(
      true,
    );
  });

  it("generic builder does not embed IEP-specific strings", () => {
    const projectionsDir = dirname(fileURLToPath(import.meta.url));
    const forbidden = [/Individualized Education/, /\bIEP\b/, /Special education/];
    for (const file of sourceFiles(projectionsDir)) {
      if (file.endsWith("project-case-map-v3.test.ts")) {
        continue;
      }
      const text = readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        expect(text, file).not.toMatch(pattern);
      }
    }
    expect(readFileSync(join(projectionsDir, "project-case-map-v3.ts"), "utf8")).not.toMatch(
      /domain-packs\/iep/,
    );
  });

  it("buildCaseProjectionsV3 includes case map", () => {
    const built = buildCaseProjectionsV3({
      intelligence: l001LikeCanonicalSnapshot(),
      caseMapProjection: getCaseMapProjectionByDomainId("iep"),
    });
    expect(built.caseMap.nodes.length).toBeGreaterThan(0);
  });
});
