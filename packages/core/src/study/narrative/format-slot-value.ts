import type { NarrativeBlock } from "@hiveforyou/domain-pack";
import { IEP_CODE_LABELS } from "@hiveforyou/shared/projections";

import type { StudyFact } from "@hiveforyou/shared/pack-study";

const RAW_KEY_PATTERN = /^[A-Z_]+$/;

export function assertCustomerFacingText(text: string, slot: string): void {
  if (text.includes("_")) {
    throw new Error(`Narrative slot "${slot}" resolved to raw key text: ${text}`);
  }
  if (RAW_KEY_PATTERN.test(text.trim())) {
    throw new Error(`Narrative slot "${slot}" resolved to raw key text: ${text}`);
  }
}

function plainParentKey(slot: string): string | null {
  const parts = slot.split(".");
  if (parts.length < 2) {
    return null;
  }
  return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
}

export function formatFactForNarrative(
  block: NarrativeBlock,
  slot: string,
  fact: StudyFact,
): string {
  const parent = plainParentKey(slot);
  const plain =
    (parent && block.plain[parent]?.[fact.raw]) ||
    block.plain[slot]?.[fact.raw] ||
    null;
  let display = plain ?? fact.display;
  if (!plain && fact.raw in IEP_CODE_LABELS) {
    display = IEP_CODE_LABELS[fact.raw] ?? display;
  }
  if (!plain && display.includes("_")) {
    display = display.replace(/_/g, " ");
  }
  assertCustomerFacingText(display, slot);
  return display;
}
