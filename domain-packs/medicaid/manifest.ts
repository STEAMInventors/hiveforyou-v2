import type { DomainPackManifest } from "@hiveforyou/domain-pack";

export const medicaidManifest = {
  id: "medicaid",
  name: "Medicaid",
  description:
    "Medicaid eligibility, benefits, and related evidence. No document rules are defined yet.",
  version: "0.0.0-scaffold",
  status: "scaffold",
  routable: true,
  executable: false,
  capabilities: ["intake.work-purpose"],
} as const satisfies DomainPackManifest;
