import { describe, expect, it } from "vitest";

import { l001LikeCanonicalSnapshot } from "./fixtures/l001-like-canonical-snapshot";
import { projectCaseViewV1 } from "./project-case-view-v1";

describe("projectCaseViewV1", () => {
  it("builds case-view/1 from a validated v3 snapshot", () => {
    const intelligence = l001LikeCanonicalSnapshot();
    const view = projectCaseViewV1({ intelligence });
    expect(view.schemaVersion).toBe("case-view/1");
    expect(view.caseId).toBe(intelligence.caseId);
    expect(view.items.length).toBeGreaterThan(0);
    expect(view.layout.changed.length + view.layout.needsDecision.inFocus.length).toBeGreaterThanOrEqual(
      0,
    );
    expect(view.clientSummary.writtenBy).toBeNull();
  });
});
