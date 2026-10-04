import { describe, expect, it } from "vitest";

import { buildCaseMapIndex } from "./case-map-tree";
import { l001CaseMapFixture } from "./fixtures/l001-case-map-fixture";
import {
  attentionsInSubtree,
  findingCount,
  isFallbackZone,
  orderedZoneNodes,
  overviewCards,
} from "./case-map-presentation";
import type { CaseMap } from "@hiveforyou/shared/projections";

describe("case-map presentation", () => {
  it("orders zones from projection metadata and keeps fallback last", () => {
    const map = l001CaseMapFixture();
    const index = buildCaseMapIndex(map);
    const zones = orderedZoneNodes(map, index);
    expect(zones.length).toBeGreaterThan(1);
    expect(isFallbackZone(zones[zones.length - 1]!)).toBe(true);
    expect(isFallbackZone(zones[0]!)).toBe(false);
    const orders = zones
      .filter((zone) => !isFallbackZone(zone))
      .map((zone) => Number(zone.display?.order ?? "0"));
    const sorted = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sorted);
  });

  it("counts findings from fact and decision descendants only", () => {
    const map = l001CaseMapFixture();
    const index = buildCaseMapIndex(map);
    const zones = orderedZoneNodes(map, index);
    const total = zones.reduce((sum, zone) => sum + findingCount(zone.id, index), 0);
    const findings = map.nodes.filter((node) => node.kind === "fact" || node.kind === "decision");
    expect(total).toBe(findings.length);
  });

  it("places root gap nodes after zone cards", () => {
    const map = l001CaseMapFixture();
    const index = buildCaseMapIndex(map);
    const cards = overviewCards(map, index);
    const firstGhost = cards.findIndex((node) => node.kind === "ghost");
    const lastZone = cards.findLastIndex((node) => node.kind === "zone");
    expect(firstGhost).toBeGreaterThan(lastZone);
  });

  it("attaches conflict attention to the zone that contains the anchored fact", () => {
    const map = l001CaseMapFixture();
    const index = buildCaseMapIndex(map);
    const conflict = map.attention.find((item) => item.kind === "conflict");
    expect(conflict).toBeTruthy();
    const zonesWithAttention = orderedZoneNodes(map, index).filter(
      (zone) => attentionsInSubtree(map, zone.id, index).some((item) => item.kind === "conflict"),
    );
    expect(zonesWithAttention.length).toBeGreaterThan(0);
  });

  it("renders a non-IEP hierarchy from the same node kinds", () => {
    const map: CaseMap = {
      schemaVersion: "case-map/1",
      caseId: "bk",
      studyRunId: "bk-run",
      intelligenceVersion: 1,
      domainId: "bankruptcy",
      domainPackId: "hive.domain.bankruptcy",
      domainPackVersion: "0",
      projectionVersion: 1,
      rootNodeId: "root",
      nodes: [
        { id: "root", kind: "root", label: "Case" },
        { id: "zone-debts", kind: "zone", label: "Debts", zoneId: "debts", display: { order: "1" } },
        {
          id: "construct-secured",
          kind: "construct",
          label: "Secured debt",
          zoneId: "debts",
        },
        {
          id: "fact-mortgage",
          kind: "fact",
          label: "Mortgage",
          summary: "A mortgage is listed.",
          claimIds: ["claim-1"],
        },
      ],
      edges: [
        { id: "e1", fromNodeId: "root", toNodeId: "zone-debts", kind: "contains" },
        { id: "e2", fromNodeId: "zone-debts", toNodeId: "construct-secured", kind: "contains" },
        { id: "e3", fromNodeId: "construct-secured", toNodeId: "fact-mortgage", kind: "contains" },
      ],
      attention: [],
      chronology: [],
    };
    const index = buildCaseMapIndex(map);
    expect(orderedZoneNodes(map, index).map((node) => node.label)).toEqual(["Debts"]);
    expect(findingCount("zone-debts", index)).toBe(1);
  });
});
