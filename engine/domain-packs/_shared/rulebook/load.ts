import type { DomainPack } from "@hiveforyou/domain-pack";

import { validate } from "./validate";
import type { DocumentGuide, Rulebook, RulebookOverlay } from "./schema";

const validatedPackIds = new Set<string>();
const disabledRulebooks = new Set<string>();

function applyOverlay(base: DocumentGuide, overlay?: RulebookOverlay): DocumentGuide {
  if (!overlay?.sectionAdds) {
    return base;
  }
  return {
    ...base,
    sections: base.sections.map((section) => {
      const add = overlay.sectionAdds?.[section.id];
      return add ? { ...section, ...add } : section;
    }),
  };
}

export function ensureRulebookValidated(pack: DomainPack): void {
  const id = pack.manifest.id;
  if (validatedPackIds.has(id)) {
    return;
  }
  validatedPackIds.add(id);
  if (!pack.rulebook) {
    return;
  }
  const result = validate(pack.rulebook, pack);
  if (result.ok) {
    return;
  }
  const message = `[rulebook] ${id} validation failed:\n${result.errors.map((e) => `  - ${e}`).join("\n")}`;
  if (process.env.NODE_ENV === "production") {
    console.error(message);
    disabledRulebooks.add(id);
    return;
  }
  throw new Error(message);
}

export function getGuide(
  pack: DomainPack,
  docType: string,
  options?: { overlay?: RulebookOverlay; allowDraft?: boolean },
): DocumentGuide | null {
  ensureRulebookValidated(pack);
  if (disabledRulebooks.has(pack.manifest.id)) {
    return null;
  }
  const rulebook = pack.rulebook;
  if (!rulebook) {
    return null;
  }
  const allowDraft =
    options?.allowDraft ?? process.env.ALLOW_DRAFT_RULEBOOKS === "true";
  const docTypeCandidates = new Set<string>([docType]);
  if (docType === pack.story.anchorDocType && pack.story.anchorDocType === "IEP") {
    docTypeCandidates.add("Individualized Education Program");
  }
  const guide = rulebook.guides.find((g) => docTypeCandidates.has(g.docType));
  if (!guide) {
    return null;
  }
  if (guide.reviewStatus === "draft" && !allowDraft) {
    return null;
  }
  return applyOverlay(guide, options?.overlay);
}

export type { Rulebook };

/** @internal vitest */
export function __testResetRulebookLoadState(): void {
  validatedPackIds.clear();
  disabledRulebooks.clear();
}
