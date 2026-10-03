import type { DomainPackManifest } from "@hiveforyou/domain-pack";

export const bankruptcyManifest = {
  id: "bankruptcy",
  name: "Bankruptcy",
  description:
    "Bankruptcy schedules, creditors, assets, and court filings. No document rules are defined yet.",
  version: "0.0.0-scaffold",
  status: "scaffold",
  routable: true,
  executable: false,
  capabilities: ["intake.work-purpose"],
} as const satisfies DomainPackManifest;
