import { describe, expect, it } from "vitest";

import { CASE_VIEW_V2_SCHEMA } from "@hiveforyou/shared/projections";

import {
  l001CaseViewV2ProjectionLogicalDocuments,
  l001CaseViewV2ProjectionSnapshot,
} from "./fixtures/l001-case-view-v2-projection";
import { projectCaseViewV2Minimal } from "./project-case-view-v2-minimal";

function renderBlob(view: ReturnType<typeof projectCaseViewV2Minimal>): string {
  return JSON.stringify({
    cards: view.plan.cards,
    story: view.story,
    header: view.header,
  });
}

describe("projectCaseViewV2Minimal anatomy plan (L001-shaped)", () => {
  it("groups facts into components with card-level status and display", () => {
    const view = projectCaseViewV2Minimal({
      intelligence: l001CaseViewV2ProjectionSnapshot(),
      logicalDocuments: l001CaseViewV2ProjectionLogicalDocuments(),
      userText: "Help me prepare for the IEP meeting",
    });
    expect(view.schemaVersion).toBe(CASE_VIEW_V2_SCHEMA);
    expect(view.plan.cards.length).toBeLessThanOrEqual(7);
    expect(view.plan.cards.length).toBeGreaterThan(0);

    const blob = renderBlob(view);
    expect(blob).not.toMatch(/date_of_birth|date of birth/i);
    expect(blob).not.toMatch(/entity_synthetic|entity-student/i);
    expect(blob).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(blob).not.toMatch(/primary_educational_need/);

    const goalCard = view.plan.cards.find((c) => c.status === "worth_a_question");
    expect(goalCard).toBeTruthy();

    const looksClearCount = view.plan.cards.filter((c) => c.status === "looks_clear").length;
    expect(view.header.statusCounts.looksClear).toBe(looksClearCount);

    for (const card of view.plan.cards) {
      if (card.sectionId === "goals" || card.sectionId === "services") {
        expect(card.oneLiner).not.toMatch(/sessions\/week from 2023/i);
      }
    }

    expect(view.header.askedText).toContain("IEP meeting");
    expect(view.header.askedText).not.toBe("your documents");
    const echo = view.storyNarrative.movements
      .find((m) => m.movementId === "orientation")
      ?.slots.find((s) => s.slotType === "echo");
    expect(echo?.text).toContain("IEP meeting");
  });
});
