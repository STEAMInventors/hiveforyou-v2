import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  bindDocumentPagesToSourceDocumentId,
  parseDocumentPagesPayload,
} from "../../document/trusted-document-pages.js";
import type { DocumentPages } from "../../document/page-model.js";
import {
  buildCanonicalStudyFoundation,
  explicitTotalPerWeek,
  unitsEquivalent,
} from "../canonical-study-foundation/index.js";
import {
  buildCanonicalStudy,
  CANONICAL_STUDY_RULESET_CONTENT_SHA256,
} from "./index.js";
import { evaluateWhenClause } from "./evaluate-primitives.js";
import { buildIndexedFoundation } from "./indexed-foundation.js";
import { computeCanonicalStudyRulesetContentSha256 } from "./hash-body.js";
import {
  applyCanonicalStudyInterpretationIfCompatible,
} from "../resolve-canonical-study-interpretation.js";
import {
  proposalPackSnapshotPathForHash,
  resolveDebugCanonicalStudyDomainPack,
} from "../resolve-approved-proposal-domain-pack.js";
import {
  computeProposalPackContentSha256,
  validateProposalDomainPack,
} from "@hiveforyou/domain-pack/pack-driven-reader";
import type { ProposalDomainPack } from "@hiveforyou/domain-pack";
import type { IndexedRecordVersion } from "./indexed-foundation.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(HERE, "../../../fixtures/arch06-l001");
type Arch06FixtureManifest = {
  studyRunId: string;
  attemptId: string;
  caseId: string;
  packContentSha256: string;
  exportedAt: string;
  documents: Array<{
    sourceDocumentId: string;
    documentTypeId: string | null;
    envelopePath: string;
    pagesPath: string | null;
    filename: string;
  }>;
};

function loadArch06SnapshotPack(contentSha256: string): ProposalDomainPack {
  const path = proposalPackSnapshotPathForHash(contentSha256);
  if (!existsSync(path)) {
    throw new Error(`ARCH06_L001_PACK_SNAPSHOT_MISSING:${path}`);
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as ProposalDomainPack;
  const validation = validateProposalDomainPack(parsed);
  if (!validation.valid) {
    throw new Error(`ARCH06_L001_PACK_SNAPSHOT_INVALID:${path}`);
  }
  const hash = computeProposalPackContentSha256(parsed).toLowerCase();
  if (hash !== contentSha256.toLowerCase()) {
    throw new Error(`ARCH06_L001_PACK_SNAPSHOT_HASH_MISMATCH:${path}:${hash}`);
  }
  return parsed;
}

function loadArch06FixtureManifest(): Arch06FixtureManifest | null {
  const path = join(FIXTURE_ROOT, "manifest.json");
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(readFileSync(path, "utf8")) as Arch06FixtureManifest;
}

function loadArch06Study(asOfDate: string) {
  const manifest = loadArch06FixtureManifest();
  if (!manifest) {
    throw new Error("ARCH06_L001_FIXTURES_MISSING");
  }
  const readerPackSha = manifest.packContentSha256;
  const readerPack = loadArch06SnapshotPack(readerPackSha);
  const interpretation = applyCanonicalStudyInterpretationIfCompatible({
    readerPack,
    readerPackContentSha256: readerPackSha,
    domainId: "iep",
  });
  const foundationDocuments = manifest.documents.map((doc) => {
    const envelope = JSON.parse(readFileSync(join(FIXTURE_ROOT, doc.envelopePath), "utf8"));
    let documentPages: DocumentPages | null = null;
    if (doc.pagesPath && existsSync(join(FIXTURE_ROOT, doc.pagesPath))) {
      const bytes = readFileSync(join(FIXTURE_ROOT, doc.pagesPath));
      const payload = parseDocumentPagesPayload(bytes);
      if (payload) {
        documentPages = bindDocumentPagesToSourceDocumentId(payload.documentPages, doc.sourceDocumentId);
      }
    }
    return { sourceDocumentId: doc.sourceDocumentId, envelope, documentPages };
  });
  const foundation = buildCanonicalStudyFoundation({
    pack: interpretation.studyPack,
    packContentSha256: readerPackSha,
    caseId: manifest.caseId,
    createdAt: manifest.exportedAt,
    documents: foundationDocuments,
  });
  const sourceContext = {
    asOfDate,
    logicalDocuments: manifest.documents.map((doc) => ({
      sourceDocumentId: doc.sourceDocumentId,
      filename: doc.filename,
    })),
  };
  const artifact = buildCanonicalStudy({
    pack: interpretation.studyPack,
    packContentSha256: readerPackSha,
    interpretationRulesetId: interpretation.interpretationRulesetId,
    interpretationRulesetContentSha256: interpretation.interpretationRulesetContentSha256,
    foundation,
    sourceContext,
    createdAt: manifest.exportedAt,
  });
  return { foundation, artifact, interpretation };
}

describe("ARCH-06 ruleset identity", () => {
  it("pins ruleset content sha256 to builder sources", () => {
    expect(computeCanonicalStudyRulesetContentSha256()).toBe(CANONICAL_STUDY_RULESET_CONTENT_SHA256);
  });
});

describe("ARCH-06 unit fixes", () => {
  it("1c: explicitTotalPerWeek and unit guard", () => {
    expect(explicitTotalPerWeek("150 minutes weekly")).toEqual({
      ok: true,
      value: 150,
      unit: "min/week",
    });
    expect(unitsEquivalent("min/week", "minutes_per_week")).toBe(true);
    expect(unitsEquivalent("min/week", "sessions/week")).toBe(false);
  });

  it("3c: ageOnDate threshold on birthday boundary", () => {
    const pack = resolveDebugCanonicalStudyDomainPack({
      envelopePackId: "iep",
      envelopePackVersion: "0.3.0-proposed",
      envelopePackContentSha256: "c2baa0439d32496a3110f5388f6048395a9f4c8fdce79b3d0cec36ae6b9a7775",
    }).pack;
    const foundation = buildCanonicalStudyFoundation({
      pack,
      packContentSha256: "c2baa0439d32496a3110f5388f6048395a9f4c8fdce79b3d0cec36ae6b9a7775",
      caseId: "case-age-test",
      documents: [],
    });
    const indexed = buildIndexedFoundation({
      pack,
      foundation,
      sourceContext: {},
    });
    const studentRecord: IndexedRecordVersion = {
      recordGroupId: "student-1",
      sourceDocumentId: "doc-a",
      recordTypeId: "student",
      instanceIndex: 0,
      documentTypeId: "doc.plan",
      orderingDate: "2024-01-01",
      sortRank: 0,
      party: null,
      fieldKeys: ["birth_date"],
      provenanceByFieldKey: {
        birth_date: {
          fieldKey: "doc-a|student|0|birth_date",
          recordGroupId: "student-1",
          sourceDocumentId: "doc-a",
          recordTypeId: "student",
          instanceIndex: 0,
          fieldId: "birth_date",
          evidence: [],
          normalized: {
            valueKind: "date",
            displayValue: "2008-12-01",
            normalizedValue: "2008-12-01",
            unit: null,
          },
          envelopeRef: {
            studyRunId: "s",
            attemptId: "a",
            sourceDocumentId: "doc-a",
            envelopeStatus: "SUCCEEDED",
          },
        },
      },
    };
    indexed.records.push(studentRecord);
    indexed.records.push({
      recordGroupId: "header-1",
      sourceDocumentId: "doc-a",
      recordTypeId: "document_header",
      instanceIndex: 0,
      documentTypeId: "doc.plan",
      orderingDate: "2024-11-30",
      sortRank: 0,
      party: null,
      fieldKeys: ["effective_date"],
      provenanceByFieldKey: {
        effective_date: {
          fieldKey: "doc-a|document_header|0|effective_date",
          recordGroupId: "header-1",
          sourceDocumentId: "doc-a",
          recordTypeId: "document_header",
          instanceIndex: 0,
          fieldId: "effective_date",
          evidence: [],
          normalized: {
            valueKind: "date",
            displayValue: "2024-11-30",
            normalizedValue: "2024-11-30",
            unit: null,
          },
          envelopeRef: {
            studyRunId: "s",
            attemptId: "a",
            sourceDocumentId: "doc-a",
            envelopeStatus: "SUCCEEDED",
          },
        },
      },
    });
    const when = {
      primitive: "ageOnDate" as const,
      birthDate: "student.birth_date",
      onDate: "document_header.effective_date",
      atLeast: 16,
    };
    expect(
      evaluateWhenClause(when, indexed, {}, new Set(["doc-a"])).ok,
    ).toBe(false);
    indexed.records[1]!.provenanceByFieldKey.effective_date!.normalized.normalizedValue = "2024-12-01";
    indexed.records[1]!.provenanceByFieldKey.effective_date!.normalized.displayValue = "2024-12-01";
    expect(
      evaluateWhenClause(when, indexed, {}, new Set(["doc-a"])).ok,
    ).toBe(true);
  });
});

describe("ARCH-06 L001 integration", () => {
  const manifest = loadArch06FixtureManifest();
  if (!manifest) {
    it.skip("fixtures missing — export with worker/scripts/export-canonical-fixtures.mjs", () => {});
    return;
  }

  const AS_OF = "2026-10-13";

  it("1a/1b/2/3/4/5/6/7 acceptance on stored L001 run", () => {
    const { foundation, artifact } = loadArch06Study(AS_OF);
    const serviceMinutes = foundation.verifiedFields.filter(
      (field) => field.recordTypeId === "service" && field.fieldId === "minutes_per_week",
    );
    expect(serviceMinutes.some((field) => field.normalized.normalizedValue === 150)).toBe(true);
    expect(serviceMinutes.every((field) => field.normalized.unit === "min/week")).toBe(true);
    expect(
      foundation.verifiedFields.some(
        (field) => field.recordTypeId === "service" && field.fieldId === "sessions_per_period",
      ),
    ).toBe(false);

    const presentEntity = artifact.entities.find(
      (entity) =>
        entity.recordTypeId === "present_level" && entity.contentKey?.includes("area=reading fluency"),
    );
    expect(presentEntity?.contentKey).toContain("area=reading fluency");
    // goal keyed on measure per pack; ARCH-06 ticket 2a corrected
    const resolvedGoals = artifact.entities.filter(
      (entity) => entity.recordTypeId === "goal" && entity.status === "resolved",
    );
    expect(resolvedGoals).toHaveLength(1);
    expect(resolvedGoals[0]?.contentKey).toContain("measure.score_type=words_correct_per_minute");
    expect(
      artifact.flags.some(
        (flag) => flag.checkId === "goal_without_present_level" && flag.status === "fired",
      ),
    ).toBe(false);

    const transition = artifact.requirements.find((item) => item.ruleId === "transition");
    expect(transition?.outcome).toBe("NOT_APPLICABLE");
    const transfer = artifact.requirements.find((item) => item.ruleId === "transfer_of_rights");
    expect(transfer?.outcome).toBe("UNRESOLVED");
    expect(transfer?.message).toBe("ageOnDate_reference_unavailable");

    const uuidInQuestion = /[0-9a-f]{8}-[0-9a-f]{4}-/;
    expect(
      artifact.flags
        .filter((flag) => flag.status === "fired")
        .every((flag) => !uuidInQuestion.test(flag.question ?? "")),
    ).toBe(true);
    expect(
      artifact.flags.filter((flag) => flag.status === "fired").every((flag) => !(flag.question ?? "").includes("{")),
    ).toBe(true);
    const baselineSeries = artifact.flags.find((flag) => flag.checkId === "baseline_target_series");
    expect(baselineSeries?.question ?? "").toContain("75");
    const reevaluation = artifact.flags.find((flag) => flag.checkId === "reevaluation_interval");
    expect(reevaluation?.status).not.toBe("fired");

    for (const flag of artifact.flags.filter((flag) => flag.status === "fired" && flag.message === "absenceOf_verified")) {
      expect(flag.operands).toHaveLength(1);
    }

    const second = loadArch06Study(AS_OF);
    expect(second.artifact.contentSha256).toBe(artifact.contentSha256);
  });
});
