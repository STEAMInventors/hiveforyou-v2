import type { DomainPackManifest } from "@hiveforyou/domain-pack";

export const iepManifest = {
  id: "iep",
  name: "Special Education / IEP",
  description:
    "Special education planning and compliance evidence, including evaluations, plans, and progress.",
  version: "0.0.0-scaffold",
  status: "scaffold",
  routable: true,
  executable: true,
  capabilities: [
    "discover",
    "intake.work-purpose",
    "audience-roles",
    "study-context",
    "evidence-requirements",
    "document-interpretation",
  ],
} as const satisfies DomainPackManifest;
