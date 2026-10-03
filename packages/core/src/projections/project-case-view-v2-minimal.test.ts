import { describe, expect, it } from "vitest";

import type { CanonicalCaseSnapshot } from "@hiveforyou/shared/case-intelligence/3";
import { CASE_VIEW_V2_SCHEMA } from "@hiveforyou/shared/projections";

import { l001LikeCanonicalSnapshot } from "./fixtures/l001-like-canonical-snapshot";
import {
  l001CaseViewV2ProjectionLogicalDocuments,
  l001CaseViewV2ProjectionSnapshot,
} from "./fixtures/l001-case-view-v2-projection";
import { projectCaseViewV2Minimal } from "./project-case-view-v2-minimal";

describe("projectCaseViewV2Minimal", () => {
  it("builds case-view/2 with story and plan surfaces", () => {
    const view = projectCaseViewV2Minimal({
      intelligence: l001CaseViewV2ProjectionSnapshot(),
      logicalDocuments: l001CaseViewV2ProjectionLogicalDocuments(),
    });
    expect(view.schemaVersion).toBe(CASE_VIEW_V2_SCHEMA);
    expect(view.voice.subject).toBeTruthy();
    expect(view.story.length).toBeGreaterThan(0);
    expect(view.plan.cards.length).toBeGreaterThan(0);
    expect(view.timeline.events.length).toBeLessThanOrEqual(
      l001CaseViewV2ProjectionSnapshot().claims.length,
    );
  });

  it("timeline uses canonical events in date order, not one row per claim", () => {
    const intelligence = l001LikeCanonicalSnapshot();
    const view = projectCaseViewV2Minimal({ intelligence });
    expect(view.timeline.events.length).toBe(intelligence.events.length);
    const dates = view.timeline.events.map((e) => e.date?.value ?? "");
    expect(dates).toEqual([...dates].sort((a, b) => a.localeCompare(b)));
    expect(view.timeline.groups).toEqual([
      { label: "", eventIds: view.timeline.events.map((e) => e.eventId) },
    ]);
  });

  it("has no changed items when snapshot reports no changes", () => {
    const intelligence = l001LikeCanonicalSnapshot();
    const noChanges: CanonicalCaseSnapshot = { ...intelligence, changes: [] };
    const view = projectCaseViewV2Minimal({ intelligence: noChanges });
    expect(view.layout.changed).toHaveLength(0);
    expect(view.story.some((s) => s.slotType === "changed" && s.slotId.startsWith("slot_chg_"))).toBe(
      false,
    );
  });
});
