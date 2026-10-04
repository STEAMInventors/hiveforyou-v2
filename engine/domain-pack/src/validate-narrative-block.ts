import type { NarrativeBlock, NarrativeTemplate } from "./types";

const HOLE_PATTERN = /\{([^}]+)\}/g;

function holesInSay(say: string): string[] {
  const holes: string[] = [];
  for (const match of say.matchAll(HOLE_PATTERN)) {
    holes.push(match[1]!);
  }
  return holes;
}

export function validateNarrativeTemplate(template: NarrativeTemplate): void {
  const holes = holesInSay(template.say);
  const slotSet = new Set(template.slots);
  const holeSet = new Set(holes);
  if (holes.length !== template.slots.length || holes.some((h) => !slotSet.has(h))) {
    throw new Error(
      `Narrative template "${template.id}": say holes [${holes.join(", ")}] must exactly match slots [${template.slots.join(", ")}].`,
    );
  }
  for (const slot of template.slots) {
    if (!holeSet.has(slot)) {
      throw new Error(`Narrative template "${template.id}": slot "${slot}" is not used in say.`);
    }
  }
}

export function validateNarrativeBlock(block: NarrativeBlock, packId: string): void {
  for (const template of block.templates) {
    validateNarrativeTemplate(template);
    if (!block.chapters.includes(template.chapter)) {
      throw new Error(
        `Narrative template "${template.id}" in pack "${packId}" uses chapter "${template.chapter}" not listed in chapters.`,
      );
    }
  }
}
