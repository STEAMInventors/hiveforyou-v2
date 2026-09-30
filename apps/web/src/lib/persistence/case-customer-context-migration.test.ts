import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "../../supabase/migrations/20260928160000_case_customer_context.sql"),
  "utf8",
);
const domainSql = readFileSync(
  join(process.cwd(), "../../supabase/migrations/20260928170000_case_customer_context_domain.sql"),
  "utf8",
);

describe("case customer context migration", () => {
  it("creates append-only context table with active uniqueness and scoped RLS", () => {
    expect(sql).toContain("create table if not exists hive.case_customer_context");
    expect(sql).toContain("context_type in ('OBJECTIVE', 'SHARE_INTENT', 'INTENDED_AUDIENCE')");
    expect(sql).toContain("source = 'CUSTOMER_ASSERTION'");
    expect(sql).toContain("case_customer_context_active_uniq");
    expect(sql).toContain("where superseded_at is null");
    expect(sql).toContain("before update or delete on hive.case_customer_context");
    expect(sql).toContain("using (user_id = auth.uid())");
  });

  it("scopes the active unique key to case, domain, and context type", () => {
    expect(domainSql).toContain("domain_id");
    expect(domainSql).toContain(
      "on hive.case_customer_context (case_id, domain_id, context_type)",
    );
    expect(domainSql).toContain("old.domain_id is distinct from new.domain_id");
    expect(domainSql).toContain("disable trigger case_customer_context_reject_mutation");
    expect(domainSql).toContain("enable trigger case_customer_context_reject_mutation");
  });
});
