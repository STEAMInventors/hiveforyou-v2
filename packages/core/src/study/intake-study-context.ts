import { createHash } from "node:crypto";

import { getDiscoverPackByDomainId } from "@hiveforyou/domain-packs";
import type { IntakePackExecutionResult, IntakePackLogicalDocument } from "@hiveforyou/domain-pack";
import type { StartCanonicalStudyRequest } from "@hiveforyou/shared/canonical-study";
import {
  buildIntakeStudyUserContext,
  INTAKE_STUDY_ANSWER_SNAPSHOT,
  INTAKE_STUDY_QUESTION_SET,
} from "@hiveforyou/shared/canonical-study";
import type { StudySourceDocumentRef } from "@hiveforyou/shared/canonical-study";
import type { StructureMap, StructureMapLogicalDocument } from "@hiveforyou/shared/discover";
import { HIVE_STRUCTURE_MAP_SCHEMA } from "@hiveforyou/shared/discover";
import type { DocumentDiscoveryResult } from "@hiveforyou/shared/discovery";
import type { RecognitionStatus } from "@hiveforyou/shared/discovery";

import type { SourceDocumentRecord } from "../persistence/source-document-repository";
import { hashCanonicalJson } from "./fingerprint";

const INTAKE_EVIDENCE_GROUP_ID = "uploaded_evidence";

export type IntakeStudySourceIdentity = {
  sourceDocumentId: string;
  analysisDisposition: "PRESENT" | "DISCARDED";
};

export type AssembleIntakeStudyInput = {
  caseId: string;
  intakeRunId: string;
  domainId: string;
  domainLabel: string;
  domainPackVersion: string;
  packExecution: IntakePackExecutionResult;
  sources: SourceDocumentRecord[];
  identities: IntakeStudySourceIdentity[];
  /** Composer / workspace purpose text (emphasis only — not evidence). */
  statedWorkPurpose?: string | null;
};

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (v as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return v;
  });
}

function recognitionForDisposition(
  disposition: IntakePackLogicalDocument["processingDisposition"],
): RecognitionStatus {
  if (disposition === "NEEDS_REVIEW") {
    return "ambiguous";
  }
  if (disposition === "DO_NOT_PROCESS") {
    return "unrecognized";
  }
  return "recognized";
}

/** Pack-assigned plan role for an IEP. Other families keep their subtype. */
function studyFamilyRole(doc: IntakePackLogicalDocument): string {
  if (
    doc.documentFamily === "IEP" &&
    (doc.temporalRole === "current" ||
      doc.temporalRole === "prior" ||
      doc.temporalRole === "intermediate")
  ) {
    return doc.temporalRole;
  }
  return doc.documentSubtype ?? doc.documentFamily;
}

function planPrecedenceRelationships(
  logical: IntakePackLogicalDocument[],
): StructureMap["relationships"] {
  const families = new Set(logical.map((doc) => doc.documentFamily));
  const relationships: StructureMap["relationships"] = [];
  for (const family of families) {
    const prior = logical.find(
      (doc) => doc.documentFamily === family && doc.temporalRole === "prior",
    );
    const current = logical.find(
      (doc) => doc.documentFamily === family && doc.temporalRole === "current",
    );
    if (!prior || !current) {
      continue;
    }
    relationships.push({
      id: `rel_${prior.logicalDocumentId}_${current.logicalDocumentId}_precedes`,
      fromLogicalDocumentId: prior.logicalDocumentId,
      toLogicalDocumentId: current.logicalDocumentId,
      kind: "precedes",
      label: "Prior plan precedes the current plan",
    });
  }
  return relationships;
}

function activeLogicalDocuments(
  packExecution: IntakePackExecutionResult,
  presentSourceIds: Set<string>,
): IntakePackLogicalDocument[] {
  return packExecution.logicalDocuments.filter(
    (doc) =>
      presentSourceIds.has(doc.sourceDocumentId) &&
      doc.processingDisposition !== "DO_NOT_PROCESS",
  );
}

/** Deterministic hash of intake evidence set + pack execution (idempotency input). */
export function fingerprintIntakeStudyMaterial(input: {
  intakeRunId: string;
  packExecution: IntakePackExecutionResult;
  identities: IntakeStudySourceIdentity[];
  sources: SourceDocumentRecord[];
}): string {
  const presentIds = new Set(
    input.identities
      .filter((row) => row.analysisDisposition === "PRESENT")
      .map((row) => row.sourceDocumentId),
  );
  const sources = input.sources
    .filter((doc) => presentIds.has(doc.id))
    .map((doc) => ({
      sourceDocumentId: doc.id,
      sha256: doc.sha256,
      sizeBytes: doc.sizeBytes,
    }))
    .sort((a, b) => a.sourceDocumentId.localeCompare(b.sourceDocumentId));

  const logical = activeLogicalDocuments(input.packExecution, presentIds)
    .map((doc) => ({
      logicalDocumentId: doc.logicalDocumentId,
      sourceDocumentId: doc.sourceDocumentId,
      pageStart: doc.pageStart,
      pageEnd: doc.pageEnd,
      documentFamily: doc.documentFamily,
      processingDisposition: doc.processingDisposition,
      customerLabel: doc.customerLabel,
      documentDate: doc.documentDate ?? null,
      temporalRole: doc.temporalRole ?? null,
    }))
    .sort((a, b) => a.logicalDocumentId.localeCompare(b.logicalDocumentId));

  const payload = {
    intakeRunId: input.intakeRunId,
    domainPackId: input.packExecution.domainPackId,
    domainPackVersion: input.packExecution.domainPackVersion,
    sources,
    logicalDocuments: logical,
    completeness: input.packExecution.completeness,
  };
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

export function buildEngine1ResultFromIntakePack(input: {
  domainId: string;
  domainLabel: string;
  packExecution: IntakePackExecutionResult;
  presentSourceIds: Set<string>;
}): DocumentDiscoveryResult {
  const logical = activeLogicalDocuments(input.packExecution, input.presentSourceIds);
  const documents = logical.map((doc, index) => ({
    id: doc.logicalDocumentId,
    stagedDocumentId: doc.sourceDocumentId,
    documentType: doc.customerLabel,
    title: doc.customerLabel,
    documentDate: doc.documentDate ?? undefined,
    originalFilename: doc.sourceFilename?.trim() || doc.customerLabel,
    sizeBytes: 0,
    groupId: INTAKE_EVIDENCE_GROUP_ID,
    sequenceOrder: index + 1,
    familyRole: studyFamilyRole(doc),
    recognitionStatus: recognitionForDisposition(doc.processingDisposition),
  }));

  return {
    domainLabel: input.domainLabel,
    domainResolutionStatus: "resolved",
    groups: [
      {
        id: INTAKE_EVIDENCE_GROUP_ID,
        label: "Uploaded evidence",
        description: "Logical documents from Intake pack execution",
        sequenceOrder: 1,
      },
    ],
    documents,
    relationships: planPrecedenceRelationships(logical).map((rel) => ({
      id: rel.id,
      fromDocumentId: rel.fromLogicalDocumentId,
      toDocumentId: rel.toLogicalDocumentId,
      kind: rel.kind,
      label: rel.label,
    })),
    missingDocuments: [],
    domainSections: [
      {
        domainId: input.domainId,
        domainLabel: input.domainLabel,
        groups: [
          {
            id: INTAKE_EVIDENCE_GROUP_ID,
            label: "Uploaded evidence",
            sequenceOrder: 1,
          },
        ],
        documents,
        missingDocuments: [],
      },
    ],
  };
}

export function intakePackExecutionToStructureMap(input: {
  caseId: string;
  intakeRunId: string;
  domainId: string;
  domainLabel: string;
  domainPackId: string;
  domainPackVersion: string;
  packExecution: IntakePackExecutionResult;
  sources: SourceDocumentRecord[];
  presentSourceIds: Set<string>;
}): StructureMap {
  const logical = activeLogicalDocuments(input.packExecution, input.presentSourceIds);
  const logicalDocuments: StructureMapLogicalDocument[] = logical.map((doc, index) => {
    const source = input.sources.find((row) => row.id === doc.sourceDocumentId);
    return {
      id: doc.logicalDocumentId,
      domainId: input.domainId,
      sourceDocumentId: doc.sourceDocumentId,
      pageStart: doc.pageStart,
      pageEnd: doc.pageEnd,
      documentType: doc.documentFamily,
      title: doc.customerLabel,
      documentDate: doc.documentDate ?? undefined,
      familyRole: studyFamilyRole(doc),
      groupId: INTAKE_EVIDENCE_GROUP_ID,
      recognitionStatus: recognitionForDisposition(doc.processingDisposition),
      sequenceOrder: index + 1,
      provenance: "UPLOADED_EVIDENCE" as const,
    };
  });

  const expectations = input.packExecution.completeness.expectations.map((row) => ({
    packExpectationId: row.packExpectationId,
    requirementClass: row.requirementClass as "REQUIRED" | "EXPECTED" | "CONDITIONAL" | "OPTIONAL",
    expectedDocumentType: row.expectedDocumentType,
    state:
      row.state === "OPEN"
        ? ("MISSING" as const)
        : row.state === "SATISFIED"
          ? ("SATISFIED" as const)
          : row.state === "NOT_APPLICABLE"
            ? ("NOT_APPLICABLE" as const)
            : ("DISPOSITIONED" as const),
    disposition: row.disposition,
  }));

  const completenessStatus =
    input.packExecution.completeness.collectionNeedsReview ||
    expectations.some((row) => row.state === "MISSING")
      ? ("missing_evidence" as const)
      : ("complete" as const);

  const producedAt = new Date().toISOString();

  return {
    schemaVersion: HIVE_STRUCTURE_MAP_SCHEMA,
    discoverRunId: input.intakeRunId,
    caseId: input.caseId,
    producedAt,
    domainResolution: {
      status: "SINGLE_DOMAIN",
      domainLabel: input.domainLabel,
      domainId: input.domainId,
      domainPackId: input.domainPackId,
      domainPackVersion: input.domainPackVersion,
    },
    domainGroups: [
      {
        id: `${input.domainId}-intake`,
        domainId: input.domainId,
        domainLabel: input.domainLabel,
        logicalDocumentIds: logicalDocuments.map((doc) => doc.id),
        description: "Evidence organized during Intake",
        completeness: {
          status: completenessStatus,
          expectations,
        },
      },
    ],
    sourceDocuments: input.sources
      .filter((doc) => input.presentSourceIds.has(doc.id))
      .map((doc) => ({
        sourceDocumentId: doc.id,
        originalFilename: doc.originalFilename,
        sizeBytes: doc.sizeBytes,
        sha256: doc.sha256,
      })),
    logicalDocuments,
    relationships: planPrecedenceRelationships(logical),
    chronology: [...logicalDocuments]
      .sort((a, b) => {
        const aKey = a.documentDate ?? "9999-99-99";
        const bKey = b.documentDate ?? "9999-99-99";
        return aKey.localeCompare(bKey) || a.id.localeCompare(b.id);
      })
      .map((doc) => ({
        logicalDocumentId: doc.id,
        orderingKey: doc.documentDate ?? `undated:${doc.id}`,
        source: doc.documentDate ? ("MODEL" as const) : ("PACK" as const),
      })),
    discoveryAnswers: [],
    unresolved: [],
    completeness: {
      status: completenessStatus,
      expectations,
    },
    provenance: {
      promptVersion: "intake-pack-execution",
      promptSha256: hashCanonicalJson(input.packExecution),
      providerId: "intake-domain-pack",
    },
  };
}

export function assembleIntakeStudyRequest(input: AssembleIntakeStudyInput): StartCanonicalStudyRequest {
  const presentSourceIds = new Set(
    input.identities
      .filter((row) => row.analysisDisposition === "PRESENT")
      .map((row) => row.sourceDocumentId),
  );

  const sourceDocuments: StudySourceDocumentRef[] = input.sources
    .filter((doc) => presentSourceIds.has(doc.id))
    .map((doc) => ({
      stagedDocumentId: doc.id,
      discoveryDocumentId: doc.id,
      sourceDocumentId: doc.id,
      originalFilename: doc.originalFilename,
      sizeBytes: doc.sizeBytes,
      mimeType: doc.mimeType ?? undefined,
      sha256: doc.sha256,
      storageBucket: doc.storageBucket,
      storagePath: doc.storagePath,
    }));

  const engine1Result = buildEngine1ResultFromIntakePack({
    domainId: input.domainId,
    domainLabel: input.domainLabel,
    packExecution: input.packExecution,
    presentSourceIds,
  });

  const intakeStudyMaterialFingerprint = fingerprintIntakeStudyMaterial({
    intakeRunId: input.intakeRunId,
    packExecution: input.packExecution,
    identities: input.identities,
    sources: input.sources,
  });

  return {
    caseId: input.caseId,
    intakeRunId: input.intakeRunId,
    intakeStudyMaterialFingerprint,
    sourceDocuments,
    engine1Result,
    questionSet: INTAKE_STUDY_QUESTION_SET,
    answerSnapshot: {
      ...INTAKE_STUDY_ANSWER_SNAPSHOT,
      userContext: buildIntakeStudyUserContext(input.statedWorkPurpose),
    },
  };
}

export function resolveIntakeStudyDomain(input: {
  resolvedDomainId: string | null;
  domainLabel: string;
}): { domainId: string; domainLabel: string; domainPackId: string; domainPackVersion: string } | null {
  if (!input.resolvedDomainId?.trim()) {
    return null;
  }
  const pack = getDiscoverPackByDomainId(input.resolvedDomainId);
  if (!pack) {
    return null;
  }
  return {
    domainId: pack.domainId,
    domainLabel: pack.domainLabel,
    domainPackId: pack.domainPackId,
    domainPackVersion: pack.domainPackVersion,
  };
}
