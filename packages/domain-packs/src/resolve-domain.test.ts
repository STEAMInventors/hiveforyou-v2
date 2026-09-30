import { describe, expect, it } from "vitest";

import { resolveDomainPackFromDiscoveryLabel } from "./resolve-domain";

describe("resolveDomainPackFromDiscoveryLabel", () => {
  it("maps presentation label to stable domainId", () => {
    const resolved = resolveDomainPackFromDiscoveryLabel("Special education records");
    expect(resolved?.domainId).toBe("iep");
    expect(resolved?.domainPackId).toBe("hive.domain.iep");
  });

  it("returns null for unknown labels", () => {
    expect(resolveDomainPackFromDiscoveryLabel("Unknown domain")).toBeNull();
  });
});
