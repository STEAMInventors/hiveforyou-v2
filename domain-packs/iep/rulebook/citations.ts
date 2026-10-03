import type { Citation } from "@hiveforyou/domain-pack-shared/rulebook/schema";

export function citesFromSections(sections: string[]): Citation[] {
  return sections.map((section) => ({
    code: `34 CFR §${section}`,
    ref: `idea:${section}`,
  }));
}
