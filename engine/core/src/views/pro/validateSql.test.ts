import { describe, expect, it } from "vitest";

import { validateSql } from "./validateSql";

const EXAMPLES = [
  "SELECT label, display, page, quote\nFROM facts\nWHERE doc_role = 'New IEP'\nORDER BY page, label",
  "SELECT section, label, prior_display, current_display, state\nFROM comparisons\nWHERE state IN ('changed','added','dropped')\nORDER BY section",
  "SELECT asOf, reading, goal_target, unit, doc_role, page\nFROM series_points\nWHERE label = 'Reading fluency'\nORDER BY asOf",
  "SELECT asOf, label, display, doc_role, page\nFROM facts\nWHERE attribute LIKE 'goal.%'\nORDER BY asOf",
  "SELECT kind, label, from_date, to_date, months, doc_role\nFROM gaps",
  "SELECT doc_role, COUNT(*) AS facts\nFROM facts\nGROUP BY doc_role\nORDER BY facts DESC",
];

describe("validateSql", () => {
  it("allows the six example queries", () => {
    for (const sql of EXAMPLES) {
      expect(validateSql(sql)).toBeNull();
    }
  });

  it("rejects dangerous or invalid queries", () => {
    expect(validateSql("DELETE FROM facts")).toMatch(/SELECT/i);
    expect(validateSql("SELECT 1; SELECT 2")).toMatch(/one query/i);
    expect(validateSql("SELECT * FROM CSV('x')")).toMatch(/isn't allowed/i);
    expect(validateSql("SELECT `javascript` FROM facts")).toMatch(/isn't allowed/i);
    expect(validateSql("SELECT * FROM secrets")).toMatch(/Unknown table/i);
  });

  it("allows New IEP inside a string literal", () => {
    expect(
      validateSql("SELECT * FROM facts WHERE doc_role = 'New IEP'"),
    ).toBeNull();
  });
});
