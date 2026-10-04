import type { DomainPack } from "@hiveforyou/domain-pack";
import { getGuide } from "@hiveforyou/domain-pack";
import type { DocumentGuide } from "@hiveforyou/domain-pack-shared/rulebook/schema";

const KEYISH = /\|/;
const KEY_PARTS = /^[a-z]+(\s[a-z]+){3,}$/;

export class UnlabelledAttributeError extends Error {
  constructor(public attributeId: string) {
    super(`UnlabelledAttributeError: no display label for "${attributeId}"`);
    this.name = "UnlabelledAttributeError";
  }
}

export class InvalidDisplayLabelError extends Error {
  constructor(public label: string) {
    super(`InvalidDisplayLabelError: label "${label}" looks like an engine key`);
    this.name = "InvalidDisplayLabelError";
  }
}

function titleCase(label: string): string {
  if (!label) {
    return label;
  }
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function labelFromGuide(guide: DocumentGuide, attributeId: string): string | null {
  for (const section of guide.sections) {
    if (section.slots.includes(attributeId)) {
      return section.docTitle;
    }
  }
  return null;
}

export function resolveProLabel(
  pack: DomainPack,
  attributeId: string,
  guide: DocumentGuide | null,
  devMode: boolean,
): string | null {
  const fromStory = pack.story.plainLabels[attributeId];
  let label = fromStory ? titleCase(fromStory) : labelFromGuide(guide!, attributeId);
  if (!label && guide) {
    for (const section of guide.sections) {
      if (section.id === attributeId.split(".")[0]) {
        label = section.docTitle;
        break;
      }
    }
  }
  if (!label) {
    if (devMode) {
      throw new UnlabelledAttributeError(attributeId);
    }
    return null;
  }
  if (KEYISH.test(label) || label.includes("_") || KEY_PARTS.test(label.toLowerCase())) {
    if (devMode) {
      throw new InvalidDisplayLabelError(label);
    }
    return null;
  }
  return label;
}

export function loadAnchorGuide(pack: DomainPack): DocumentGuide | null {
  const anchor = pack.story?.anchorDocType;
  if (!anchor) {
    return null;
  }
  return getGuide(pack, anchor);
}
