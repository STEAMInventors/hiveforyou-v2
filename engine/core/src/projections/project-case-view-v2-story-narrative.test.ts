import { describe, expect, it } from "vitest";

import {
  l001CaseViewV2ProjectionLogicalDocuments,
  l001CaseViewV2ProjectionSnapshot,
} from "./fixtures/l001-case-view-v2-projection";
import { projectCaseViewV2Minimal } from "./project-case-view-v2-minimal";
import { chipLabel } from "./project-case-view-v2-story-narrative";

describe("story/2 narrative (L001)", () => {
  it("builds movements with progress, closer look, would help, and next step", () => {
    const view = projectCaseViewV2Minimal({
      intelligence: l001CaseViewV2ProjectionSnapshot(),
      logicalDocuments: l001CaseViewV2ProjectionLogicalDocuments(),
      userText: "Prepare for my IEP meeting",
    });

    expect(view.header.headline).toMatch(/Here's where things stand before the meeting/i);

    const goingWell = view.storyNarrative.movements.find((m) => m.movementId === "going_well");
    expect(goingWell).toBeTruthy();
    const progress = goingWell!.slots.find((s) => s.slotType === "progress");
    expect(progress?.text).toBe("62→91");
    const chipText = progress!.chips.map((c) => chipLabel(c));
    expect(chipText.some((c) => c.startsWith("02 ") && c.includes("p.1"))).toBe(true);
    expect(chipText.some((c) => c.startsWith("03 ") && c.includes("p.1"))).toBe(true);
    const steady = goingWell!.slots.find((s) => s.slotType === "steady");
    expect(steady?.text).toContain("Specialized reading instruction");
    expect(steady?.text).toContain("Extended time");

    const closer = view.storyNarrative.movements.find((m) => m.movementId === "closer_look");
    expect(closer?.slots[0]?.slotType).toBe("progress_short_of_target");
    expect(closer?.slots[0]?.progressShortOfTarget?.target).toBe(95);
    expect(closer?.slots[1]?.slotType).toBe("changed");
    expect(closer?.slots[1]?.text.toLowerCase()).toContain("comprehension");

    const wouldHelp = view.storyNarrative.movements.find((m) => m.movementId === "would_help");
    expect(wouldHelp?.slots.map((s) => s.text)).toEqual(
      expect.arrayContaining(["IEPs 2024–2025", "Notice"]),
    );

    const next = view.storyNarrative.movements.find((m) => m.movementId === "next_step");
    expect(next?.slots[0]?.slotType).toBe("next_add_files");
  });
});
