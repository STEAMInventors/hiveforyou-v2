import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  compileDeclarativeCanonicalReasonerContext,
  hashCompiledCanonicalReasonerContext,
} from "../declarative/compile-canonical-reasoner-context.js";
import { defaultDeclarativePackRepoRoot, loadDeclarativePackFromRoot } from "../declarative/index.js";

describe("compileDeclarativeCanonicalReasonerContext", () => {
  it("compiles IEP v0.2.1 pack graph context with relationship endpoints", () => {
    const raw = loadDeclarativePackFromRoot(
      join(defaultDeclarativePackRepoRoot(), "engine/domain-packs/iep/v0.2.1"),
    );
    const context = compileDeclarativeCanonicalReasonerContext(raw);
    expect(context.predicateTypes.length).toBeGreaterThan(10);
    expect(context.relationships.length).toBeGreaterThan(0);
    expect(context.observableTypeCatalog.status).toBe(
      "derived_from_relationship_endpoints_and_predicate_identity",
    );
    const sha = hashCompiledCanonicalReasonerContext(context);
    expect(sha).toHaveLength(64);
    expect(hashCompiledCanonicalReasonerContext(context)).toBe(sha);
  });
});
