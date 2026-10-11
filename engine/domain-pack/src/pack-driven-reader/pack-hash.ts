import { createHash } from "node:crypto";

import type { ProposalDomainPack } from "./types.js";

/** Deterministic hash of pack content used for prompt prefix (excludes volatile review metadata). */
export function computeProposalPackContentSha256(pack: ProposalDomainPack): string {
  const payload = {
    schemaVersion: pack.schemaVersion,
    manifest: pack.manifest,
    documentTypes: pack.documentTypes,
    recordTypes: pack.recordTypes,
    constructs: pack.constructs ?? {},
    fieldSources: pack.fieldSources ?? {},
    modalities: pack.modalities ?? [],
    missingStates: pack.missingStates ?? [],
    evidencePolicy: pack.evidencePolicy ?? {},
    readingNotes: pack.readingNotes,
    vocabulary: pack.vocabulary ?? {},
    genericUnclassifiedChecklist: pack.genericUnclassifiedChecklist ?? null,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
