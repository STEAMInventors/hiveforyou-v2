import type { ResolvedMappingPack } from "@hiveforyou/domain-packs/mapping-pack";

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

export function resolveDocumentProfileForDiscoverLabel(
  resolved: ResolvedMappingPack,
  discoverLabel: string,
): { profileId: string; conceptIds: string[] } | null {
  const normalized = normalizeLabel(discoverLabel);
  for (const profile of resolved.canonical.documents.documentProfiles) {
    const labels = new Set<string>();
    if (profile.label?.trim()) {
      labels.add(normalizeLabel(profile.label));
    }
    for (const hint of profile.recognitionHints ?? []) {
      if (hint.trim()) {
        labels.add(normalizeLabel(hint));
      }
    }
    if (labels.has(normalized)) {
      return {
        profileId: profile.id,
        conceptIds: profile.checklist.map((item) => item.conceptId),
      };
    }
  }
  return null;
}
