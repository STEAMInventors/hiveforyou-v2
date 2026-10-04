import { getDiscoverPackByDomainId } from "@hiveforyou/domain-packs";

const DOMAIN_PALETTE = [
  "#4A6B8C",
  "#77A38D",
  "#3B82F6",
  "#B8922E",
  "#6B5B95",
  "#2D7D5E",
] as const;

export function domainLabel(domainId: string): string {
  return getDiscoverPackByDomainId(domainId)?.domainLabel ?? humanizeDomainId(domainId);
}

function humanizeDomainId(domainId: string): string {
  return domainId
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function domainAccentColor(domainId: string): string {
  let hash = 0;
  for (let i = 0; i < domainId.length; i += 1) {
    hash = (hash * 31 + domainId.charCodeAt(i)) >>> 0;
  }
  return DOMAIN_PALETTE[hash % DOMAIN_PALETTE.length] ?? DOMAIN_PALETTE[0];
}
