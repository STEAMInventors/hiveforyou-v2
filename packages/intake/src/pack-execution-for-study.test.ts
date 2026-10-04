import { INTAKE_PACK_EXECUTION_SCHEMA_VERSION } from "@hiveforyou/domain-pack";
import { describe, expect, it } from "vitest";

import { parsePackExecution } from "./pack-execution-for-study";

describe("parsePackExecution", () => {
  it("returns null for empty or missing json", () => {
    expect(parsePackExecution(null)).toBeNull();
    expect(parsePackExecution("")).toBeNull();
    expect(parsePackExecution("   ")).toBeNull();
  });

  it("returns null for invalid json or wrong schema version", () => {
    expect(parsePackExecution("{")).toBeNull();
    expect(parsePackExecution(JSON.stringify({ schemaVersion: "other/1" }))).toBeNull();
  });

  it("parses a valid persisted pack execution snapshot", () => {
    const payload = {
      schemaVersion: INTAKE_PACK_EXECUTION_SCHEMA_VERSION,
      domainPackId: "iep",
      domainPackVersion: "1",
      logicalDocuments: [],
      completeness: {
        expectations: [],
        collectionNeedsReview: false,
      },
    };
    expect(parsePackExecution(JSON.stringify(payload))).toEqual(payload);
  });
});
