import {
  domainPackRecordId,
  genericNarrativeBlock,
  genericStoryConfig,
  INTAKE_PACK_EXECUTION_SCHEMA_VERSION,
  registerDomainPack,
} from "@hiveforyou/domain-pack";

const iepManifest = {
  id: "iep",
  name: "Special Education / IEP",
  description: "Test IEP pack registration for intake unit tests.",
  version: "0.0.0-test",
  status: "scaffold" as const,
  routable: true,
  executable: true,
  capabilities: ["intake.work-purpose" as const],
};

let registered = false;

export function ensureTestIepPackRegistered(): void {
  if (registered) {
    return;
  }
  registerDomainPack({
    manifest: iepManifest,
    discover: {
      domainId: iepManifest.id,
      domainPackId: domainPackRecordId(iepManifest.id),
      domainPackVersion: iepManifest.version,
      domainLabel: iepManifest.name,
      groups: [{ id: "uploads", label: "Uploaded documents", description: "", sequenceOrder: 1 }],
      documentTypes: ["Document (unclassified)"],
      familyRoles: ["Uploaded file"],
      relationshipKinds: ["precedes"],
      catalog: [],
      missingExpectations: [],
    },
    narrative: genericNarrativeBlock(),
    story: genericStoryConfig("Individualized Education Program"),
    intakeExecutor: {
      domainId: "iep",
      execute: () => ({
        schemaVersion: INTAKE_PACK_EXECUTION_SCHEMA_VERSION,
        domainPackId: domainPackRecordId("iep"),
        domainPackVersion: iepManifest.version,
        logicalDocuments: [
          {
            logicalDocumentId: "doc-1:1-1",
            sourceDocumentId: "doc-1",
            pageStart: 1,
            pageEnd: 1,
            documentFamily: "IEP",
            documentSubtype: null,
            processingDisposition: "PROCESS",
            classificationConfidence: 0.9,
            classificationReason: "test",
            customerLabel: "Initial IEP",
          },
        ],
        completeness: { expectations: [], collectionNeedsReview: false },
      }),
    },
  });
  registered = true;
}
