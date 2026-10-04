import { genericNarrativeBlock, genericProConfig, genericStoryConfig, type DomainPack } from "@hiveforyou/domain-pack";

import { bankruptcyManifest } from "./manifest";

/** Manifest only. Document types and interpreter rules are intentionally absent. */
export const bankruptcyDomainPack = {
  manifest: bankruptcyManifest,
  narrative: genericNarrativeBlock(),
  story: genericStoryConfig("Bankruptcy filing"),
  pro: genericProConfig(),
} satisfies DomainPack;
