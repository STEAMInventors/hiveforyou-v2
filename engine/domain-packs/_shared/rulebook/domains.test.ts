import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { listDomainPackManifests } from "@hiveforyou/domain-pack";
import "@hiveforyou/domain-packs";

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const packsRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("rulebook domains", () => {
  it("rulebook folders match registered domains exactly", () => {
    const registered = new Set(listDomainPackManifests().map((m) => m.id));
    const withRulebook = new Set(
      listDomainPackManifests()
        .map((m) => m.id)
        .filter((id) => existsSync(join(packsRoot, id, "rulebook"))),
    );
    expect(withRulebook).toEqual(registered);
  });
});
