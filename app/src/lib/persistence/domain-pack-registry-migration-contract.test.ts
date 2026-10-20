import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "../supabase/migrations/20261019140000_domain_pack_registry.sql"),
  "utf8",
);

describe("domain pack registry migration", () => {
  it("defines immutable digest-keyed registry with activation guardrails", () => {
    expect(sql).toContain("create table if not exists hive.domain_pack_registry");
    expect(sql).toContain("unique (content_sha256)");
    expect(sql).toContain("domain_pack_registry_one_active_certified_per_domain");
    expect(sql).toContain("lifecycle_status in ('DRAFT', 'CERTIFIED', 'RETIRED')");
    expect(sql).toContain("activate_domain_pack_registry_entry");
    expect(sql).toContain("DOMAIN_PACK_REGISTRY_ACTIVATION_UNAUTHORIZED");
    expect(sql).toContain("c2baa0439d32496a3110f5388f6048395a9f4c8fdce79b3d0cec36ae6b9a7775");
    expect(sql).toContain("b1bafe209b771a10b55cebd3bf745e476e77e1bcaf3c3cf051aa022ef719f757");
    expect(sql).toContain("domain-pack-snapshots");
  });
});
