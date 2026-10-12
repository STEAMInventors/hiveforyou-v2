import type { ProposalDomainPack, ProposalDocumentType } from "./types.js";

export class DiscoverDocumentTypeResolutionError extends Error {
  constructor(
    message: string,
    readonly code: "UNKNOWN_DISCOVER_LABEL" | "AMBIGUOUS_DISCOVER_LABEL" | "MISSING_DISCOVER_LABEL",
  ) {
    super(message);
    this.name = "DiscoverDocumentTypeResolutionError";
  }
}

function normalizeDiscoverLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

function labelsForDocumentType(doc: ProposalDocumentType): string[] {
  const labels = new Set<string>();
  if (doc.label?.trim()) {
    labels.add(normalizeDiscoverLabel(doc.label));
  }
  for (const alias of doc.discoverLabels ?? []) {
    if (alias.trim()) {
      labels.add(normalizeDiscoverLabel(alias));
    }
  }
  return [...labels];
}

export function resolveProposalDocumentTypeIdFromDiscoverLabel(
  pack: ProposalDomainPack,
  discoverLabel: string | null | undefined,
): string {
  const normalized = discoverLabel?.trim() ? normalizeDiscoverLabel(discoverLabel) : "";
  if (!normalized) {
    throw new DiscoverDocumentTypeResolutionError(
      "Discover document classification label is required.",
      "MISSING_DISCOVER_LABEL",
    );
  }

  const matches: ProposalDocumentType[] = [];
  for (const doc of pack.documentTypes) {
    const labels = labelsForDocumentType(doc);
    if (labels.includes(normalized)) {
      matches.push(doc);
    }
  }

  if (matches.length === 0) {
    const labelJson = JSON.stringify(discoverLabel);
    throw new DiscoverDocumentTypeResolutionError(
      `No document type in pack ${pack.manifest.id} matches discover label ${labelJson}.`,
      "UNKNOWN_DISCOVER_LABEL",
    );
  }
  if (matches.length > 1) {
    const ids = matches.map((doc) => doc.id).join(", ");
    const labelJson = JSON.stringify(discoverLabel);
    throw new DiscoverDocumentTypeResolutionError(
      `Discover label ${labelJson} matches multiple document types: ${ids}.`,
      "AMBIGUOUS_DISCOVER_LABEL",
    );
  }
  return matches[0]!.id;
}
