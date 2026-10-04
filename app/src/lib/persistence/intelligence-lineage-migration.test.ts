import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "../supabase/migrations/20260928200000_intelligence_lineage_logical_document_id.sql",
  ),
  "utf8",
);

describe("intelligence lineage logical document migration", () => {
  it("stores logical document ids as text, not uuid", () => {
    expect(sql).toContain("logical_document_id text");
    expect(sql).toContain("intelligence_lineage_logical_document_idx");
    expect(sql).not.toContain("logical_document_id uuid");
  });
});
