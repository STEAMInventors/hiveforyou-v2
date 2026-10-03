import type { DomainPack, NarrativeChapter } from "@hiveforyou/domain-pack";
import type { Study } from "@hiveforyou/shared/pack-study";
import type { PackNarrativeOutput, PackNarrativeSentence } from "@hiveforyou/shared/projections";

import { evaluateNarrativeCondition } from "./evaluate-condition";
import { resolveNarrativeSlot } from "./resolve-slot";

export type NarrativeOutput = PackNarrativeOutput;
export type NarrativeSentence = PackNarrativeSentence;

export function composeNarrative(pack: Pick<DomainPack, "narrative">, study: Study): NarrativeOutput {
  const { narrative: block } = pack;
  const skipped: NarrativeOutput["skipped"] = [];
  const byChapter = new Map<NarrativeChapter, NarrativeSentence[]>();
  const usedPerTemplate = new Map<string, number>();

  for (const template of block.templates) {
    const max = template.maxPerStory ?? 1;
    const used = usedPerTemplate.get(template.id) ?? 0;
    if (used >= max) {
      continue;
    }
    if (!evaluateNarrativeCondition(study, template.when)) {
      continue;
    }

    const missingSlots: string[] = [];
    const resolvedParts: ResolvedParts[] = [];
    for (const slot of template.slots) {
      const resolved = resolveNarrativeSlot(block, study, slot);
      if (!resolved) {
        missingSlots.push(slot);
        break;
      }
      resolvedParts.push(resolved);
    }
    if (missingSlots.length) {
      skipped.push({ templateId: template.id, missingSlots });
      continue;
    }

    let text = template.say;
    const factIds: string[] = [];
    for (let i = 0; i < template.slots.length; i++) {
      const slot = template.slots[i]!;
      const part = resolvedParts[i]!;
      text = text.replaceAll(`{${slot}}`, part.text);
      factIds.push(...part.factIds);
    }

    const sentence: NarrativeSentence = {
      templateId: template.id,
      text,
      factIds: [...new Set(factIds)],
    };
    const list = byChapter.get(template.chapter) ?? [];
    list.push(sentence);
    byChapter.set(template.chapter, list);
    usedPerTemplate.set(template.id, used + 1);
  }

  const paragraphs: NarrativeOutput["paragraphs"] = [];
  for (const chapter of block.chapters) {
    const sentences = byChapter.get(chapter);
    if (sentences?.length) {
      paragraphs.push({ chapter, sentences });
    }
  }

  return {
    opening: block.opening,
    paragraphs,
    skipped,
  };
}

type ResolvedParts = {
  text: string;
  factIds: string[];
};
