import type { DomainPack } from "@hiveforyou/domain-pack";
import type { StudyFact } from "@hiveforyou/shared/pack-study";

import { plainValue } from "../../study/story/raw-key";

const ENTITY_ID = /^entity_|_/;

export function formatStudyDisplayValue(
  pack: DomainPack,
  slot: string,
  fact: StudyFact | null | undefined,
): string | null {
  if (!fact) {
    return null;
  }
  const raw = fact.display?.trim() || fact.raw?.trim() || "";
  if (!raw || ENTITY_ID.test(raw)) {
    return null;
  }
  if (raw === "yes" || raw === "no") {
    return null;
  }
  try {
    return plainValue(pack.story.plainValues, slot, raw);
  } catch {
    return raw;
  }
}
