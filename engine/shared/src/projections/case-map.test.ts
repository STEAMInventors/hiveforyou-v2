import { describe, expect, it } from "vitest";

import { CASE_MAP_SCHEMA } from "./case-map";
import { validateCaseMap } from "./case-map-validate";

describe("case-map/1 contract", () => {
  it("rejects missing fact claimIds", () => {
    const result = validateCaseMap({
      schemaVersion: CASE_MAP_SCHEMA,
      caseId: "c",
      studyRunId: "r",
      intelligenceVersion: 1,
      domainId: "d",
      domainPackId: "p",
      domainPackVersion: "1",
      projectionVersion: 1,
      rootNodeId: "root:c",
      nodes: [
        { id: "root:c", kind: "root", label: "Case" },
        { id: "fact:1", kind: "fact", label: "x" },
      ],
      edges: [],
      attention: [],
      chronology: [],
    });
    expect(result.ok).toBe(false);
  });
});
