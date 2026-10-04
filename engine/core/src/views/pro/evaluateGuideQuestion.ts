import type { GuideSection } from "@hiveforyou/domain-pack-shared/rulebook/schema";
import type { StudyRowState } from "@hiveforyou/shared/pack-study";

export function firstGuideQuestion(
  section: GuideSection | undefined,
  state: StudyRowState | "gap",
): string | null {
  if (!section?.questions?.length) {
    return null;
  }
  for (const template of section.questions) {
    const when = template.when.trim().toLowerCase();
    if (when === "always") {
      return template.ask;
    }
    if (when === "changed" && state === "changed") {
      return template.ask;
    }
    if (when === "added" && state === "added") {
      return template.ask;
    }
    if (when === "dropped" && state === "dropped") {
      return template.ask;
    }
    if (when === "gap" && state === "gap") {
      return template.ask;
    }
  }
  return null;
}
