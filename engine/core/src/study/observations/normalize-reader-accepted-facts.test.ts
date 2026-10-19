import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CANONICAL_STUDY_CONTEXT_SCHEMA,
  INTAKE_STUDY_ANSWER_SNAPSHOT,
  INTAKE_STUDY_QUESTION_SET,
  type CanonicalStudyContext,
} from "@hiveforyou/shared/canonical-study";
import { parseReaderAcceptedFactsArtifact } from "@hiveforyou/shared/reader-accepted-facts";
import {
  compileDeclarativeObservationNormalizer,
  defaultDeclarativePackRepoRoot,
  loadDeclarativePackFromRoot,
} from "@hiveforyou/domain-packs/declarative";

import { hashCanonicalJson } from "../fingerprint.js";
import { normalizeReaderAcceptedFacts } from "./normalize-reader-accepted-facts.js";

const digest = "b".repeat(64);
const REPO_ROOT = defaultDeclarativePackRepoRoot();

function minimalContext(sourceDocumentIds: string[]): CanonicalStudyContext {
  return {
    schemaVersion: CANONICAL_STUDY_CONTEXT_SCHEMA,
    caseId: "case-1",
    studyRunId: "run-1",
    idempotencyKey: "test",
    createdAt: "2026-01-01T00:00:00.000Z",
    domainLabel: "Synthetic",
    domainId: "synthetic-declarative",
    domainPackId: "synthetic-declarative",
    domainPackVersion: "0.1.0",
    domainPackVocabulary: {
      entityTypes: [],
      claimTypes: [],
      relationshipTypes: [],
      eventTypes: [],
    },
    sourceDocuments: sourceDocumentIds.map((id) => ({
      stagedDocumentId: id,
      sourceDocumentId: id,
      originalFilename: `${id}.pdf`,
      sizeBytes: 1,
    })),
    engine1Result: {
      domainLabel: "Synthetic",
      domainResolutionStatus: "resolved",
      groups: [],
      documents: [],
      relationships: [],
      missingDocuments: [],
    },
    questionSetVersion: INTAKE_STUDY_QUESTION_SET.id,
    questionSet: INTAKE_STUDY_QUESTION_SET,
    answerSnapshot: INTAKE_STUDY_ANSWER_SNAPSHOT,
    logicalDocuments: [],
    processingPolicy: {
      intentAffectsFacts: false,
      providerId: "test",
      providerMode: "fixture",
    },
  };
}

function syntheticNormalizer() {
  const raw = loadDeclarativePackFromRoot(
    join(REPO_ROOT, "engine/domain-packs/_fixtures/synthetic-declarative/v0.1.0"),
  );
  return compileDeclarativeObservationNormalizer(raw);
}

function baseArtifact(facts: Record<string, unknown>[]) {
  return parseReaderAcceptedFactsArtifact({
    schemaVersion: "reader-accepted-facts/1",
    studyRunId: "run-1",
    attemptId: "attempt-1",
    caseId: "case-1",
    readerArchitectureVariant: "case_wide",
    promptSha256: digest,
    createdAt: "2026-10-18T00:00:00.000Z",
    facts,
  });
}

describe("normalizeReaderAcceptedFacts", () => {
  it("assigns stable observation ids and identical content digests on repeat", () => {
    const docId = "doc-a";
    const artifact = baseArtifact([
      {
        id: "fact-1",
        factTypeId: "entity.name",
        value: { kind: "text", text: "River" },
        modality: "observed",
        evidence: [{ sourceDocumentId: docId, page: 1, quote: "River" }],
      },
      {
        id: "fact-dup",
        factTypeId: "entity.name",
        value: { kind: "text", text: "River" },
        modality: "observed",
        evidence: [{ sourceDocumentId: docId, page: 1, quote: "River" }],
      },
      {
        id: "fact-dup",
        factTypeId: "entity.name",
        value: { kind: "text", text: "Delta" },
        modality: "observed",
        evidence: [{ sourceDocumentId: docId, page: 2, quote: "Delta" }],
      },
    ]);
    const packNormalizer = syntheticNormalizer();
    const packPin = {
      packId: packNormalizer.packId,
      packVersion: packNormalizer.packVersion,
      packContentSha256: digest,
    };
    const input = {
      context: minimalContext([docId]),
      acceptedFacts: artifact,
      domainId: "synthetic-declarative",
      packPin,
      packNormalizer,
      createdAt: "2026-10-18T00:00:00.000Z",
    };
    const first = normalizeReaderAcceptedFacts(input);
    const second = normalizeReaderAcceptedFacts(input);
    expect(first.empty).toBe(false);
    expect(first.accepted).toHaveLength(3);
    expect(first.accepted.map((obs) => obs.id)).toEqual(second.accepted.map((obs) => obs.id));
    expect(first.snapshot?.contentDigest).toBe(second.snapshot?.contentDigest);
    expect(first.accepted[0]!.id).not.toBe(first.accepted[1]!.id);
    expect(first.accepted[1]!.id).not.toBe(first.accepted[2]!.id);
  });

  it("quarantines invalid provenance and preserves duplicate reader assertions separately", () => {
    const artifact = baseArtifact([
      {
        id: "verified",
        factTypeId: "entity.name",
        value: { kind: "text", text: "Ok" },
        evidence: [{ sourceDocumentId: "doc-a", page: 1, quote: "Ok" }],
      },
      {
        id: "no-evidence",
        factTypeId: "entity.name",
        value: { kind: "text", text: "Missing" },
        evidence: [],
      },
      {
        id: "bad-doc",
        factTypeId: "entity.name",
        value: { kind: "text", text: "Ghost" },
        evidence: [{ sourceDocumentId: "missing-doc", page: 1, quote: "Ghost" }],
      },
      {
        id: "unverified",
        verificationStatus: "rejected",
        factTypeId: "entity.name",
        value: { kind: "text", text: "Nope" },
        evidence: [{ sourceDocumentId: "doc-a", page: 1, quote: "Nope" }],
      },
      {
        id: "reader-metadata",
        verificationStatus: "observed",
        factTypeId: "entity.name",
        value: { kind: "text", text: "Meta" },
        evidence: [{ sourceDocumentId: "doc-a", page: 1, quote: "Meta" }],
      },
    ]);
    const result = normalizeReaderAcceptedFacts({
      context: minimalContext(["doc-a"]),
      acceptedFacts: artifact,
      domainId: "synthetic-declarative",
      packPin: {
        packId: "synthetic-declarative",
        packVersion: "0.1.0",
        packContentSha256: digest,
      },
      packNormalizer: syntheticNormalizer(),
    });
    expect(result.accepted).toHaveLength(2);
    expect(result.quarantined).toHaveLength(3);
    expect(result.quarantined.some((row) => row.code === "MISSING_EVIDENCE")).toBe(true);
    expect(result.quarantined.some((row) => row.code === "UNVERIFIED_READER_FACT")).toBe(true);
  });

  it("accepts artifact facts that still carry proposed verification metadata", () => {
    const artifact = baseArtifact([
      {
        id: "proposed-meta",
        verificationStatus: "proposed",
        factTypeId: "entity.name",
        value: { kind: "text", text: "Stored" },
        evidence: [{ sourceDocumentId: "doc-a", page: 1, quote: "Stored" }],
      },
    ]);
    const result = normalizeReaderAcceptedFacts({
      context: minimalContext(["doc-a"]),
      acceptedFacts: artifact,
      domainId: "synthetic-declarative",
      packPin: {
        packId: "synthetic-declarative",
        packVersion: "0.1.0",
        packContentSha256: digest,
      },
      packNormalizer: syntheticNormalizer(),
    });
    expect(result.accepted).toHaveLength(1);
  });

  it("maps temporal roles from modality and fact type ids", () => {
    const iepRaw = loadDeclarativePackFromRoot(join(REPO_ROOT, "engine/domain-packs/iep/v0.2.1"));
    const iepNormalizer = compileDeclarativeObservationNormalizer(iepRaw);
    const artifact = baseArtifact([
      {
        id: "baseline",
        factTypeId: "goal.baseline_value",
        value: { kind: "quantity", amount: 40 },
        modality: "observed",
        evidence: [{ sourceDocumentId: "doc-a", page: 3, quote: "40 wcpm" }],
      },
      {
        id: "legacy",
        construct: { measure: "reading rate" },
        value: { kind: "quantity", amount: 55 },
        modality: "observed",
        evidence: [{ sourceDocumentId: "doc-a", page: 4, quote: "55 wcpm" }],
      },
    ]);
    const result = normalizeReaderAcceptedFacts({
      context: minimalContext(["doc-a"]),
      acceptedFacts: artifact,
      domainId: "iep",
      packPin: {
        packId: iepNormalizer.packId,
        packVersion: iepNormalizer.packVersion,
        packContentSha256: digest,
      },
      packNormalizer: iepNormalizer,
    });
    expect(result.accepted).toHaveLength(2);
    const baseline = result.accepted.find((obs) => obs.readerFactId === "baseline");
    const legacy = result.accepted.find((obs) => obs.readerFactId === "legacy");
    expect(baseline?.role).toBe("baseline");
    expect(legacy?.role).toBe("observed");
    expect(legacy?.predicateTypeId.startsWith("legacy.reader.quantity.")).toBe(true);
  });

  it("orders observations deterministically by id", () => {
    const artifact = baseArtifact([
      {
        id: "z-fact",
        factTypeId: "document.title",
        value: { kind: "text", text: "Z" },
        evidence: [{ sourceDocumentId: "doc-a", page: 1, quote: "Z" }],
      },
      {
        id: "a-fact",
        factTypeId: "entity.name",
        value: { kind: "text", text: "A" },
        evidence: [{ sourceDocumentId: "doc-a", page: 1, quote: "A" }],
      },
    ]);
    const result = normalizeReaderAcceptedFacts({
      context: minimalContext(["doc-a"]),
      acceptedFacts: artifact,
      domainId: "synthetic-declarative",
      packPin: {
        packId: "synthetic-declarative",
        packVersion: "0.1.0",
        packContentSha256: digest,
      },
      packNormalizer: syntheticNormalizer(),
    });
    const ids = result.accepted.map((obs) => obs.id);
    expect([...ids].sort()).toEqual(ids);
  });
});


  it("normalizes generic period reader values via domain-neutral legacy bridge", () => {
    const docId = "doc-a";
    const iepRaw = loadDeclarativePackFromRoot(join(REPO_ROOT, "engine/domain-packs/iep/v0.2.1"));
    const iepNormalizer = compileDeclarativeObservationNormalizer(iepRaw);
    const artifact = baseArtifact([
      {
        id: "period-fact",
        construct: { measure: "coverage_window", task: "annual_report" },
        modality: "planned",
        value: {
          kind: "period",
          periodStart: "2024-01-01",
          periodEnd: "2024-12-31",
        },
        evidence: [{ sourceDocumentId: docId, page: 1, quote: "Jan 1, 2024 through Dec 31, 2024" }],
      },
    ]);
    const result = normalizeReaderAcceptedFacts({
      context: minimalContext([docId]),
      acceptedFacts: artifact,
      domainId: "iep",
      packPin: {
        packId: iepNormalizer.packId,
        packVersion: iepNormalizer.packVersion,
        packContentSha256: digest,
      },
      packNormalizer: iepNormalizer,
    });
    expect(result.quarantined).toHaveLength(0);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.value).toEqual({
      kind: "period",
      start: "2024-01-01",
      end: "2024-12-31",
    });
    expect(result.accepted[0]?.effectivePeriod).toEqual({
      start: "2024-01-01",
      end: "2024-12-31",
    });
  });

describe("L001 verified reader-accepted-facts", () => {
  it("normalizes stored qualification artifact when available", () => {
    const explicitPath = process.env.HIVE_L001_READER_ACCEPTED_FACTS_PATH?.trim();
    const defaultCandidate = join(
      REPO_ROOT,
      "engine/eval/reports/reader-experiment/local/reader-accepted-facts",
    );
    let artifactPath: string | null = null;
    if (explicitPath && existsSync(explicitPath)) {
      artifactPath = explicitPath;
    }

    const envStudyRunId = process.env.HIVE_L001_QUALIFICATION_STUDY_RUN_ID?.trim();
    if (!artifactPath && envStudyRunId) {
      const candidate = join(defaultCandidate, `${envStudyRunId}.json`);
      if (existsSync(candidate)) {
        artifactPath = candidate;
      }
    }

    if (!artifactPath && existsSync(defaultCandidate)) {
      const jsonFiles = readdirSync(defaultCandidate).filter((name) => name.endsWith(".json"));
      if (jsonFiles.length === 1) {
        artifactPath = join(defaultCandidate, jsonFiles[0]);
      }
    }

        if (!artifactPath) {
      const globFallback = process.env.HIVE_READER_ACCEPTED_FACTS_FIXTURE?.trim();
      if (globFallback && existsSync(globFallback)) {
        artifactPath = globFallback;
      }
    }

    if (!artifactPath) {
      console.warn(
        "Skipping L001 normalization: set HIVE_L001_READER_ACCEPTED_FACTS_PATH or place reader-accepted-facts/1 under engine/eval/reports/reader-experiment/local/reader-accepted-facts/",
      );
      return;
    }

    const artifact = parseReaderAcceptedFactsArtifact(
      JSON.parse(readFileSync(artifactPath, "utf8")) as unknown,
    );
    const manifest = JSON.parse(
      readFileSync(join(REPO_ROOT, "engine/intake/fixtures/l001/manifest.json"), "utf8"),
    ) as { files: Array<{ sourceDocumentId: string }> };
    const manifestIds = manifest.files.map((file) => file.sourceDocumentId);
    const evidenceIds = [
      ...new Set(
        artifact.facts.flatMap((fact) => {
          const evidence = fact.evidence ?? fact.evidenceRefs;
          if (!Array.isArray(evidence)) return [];
          return evidence
            .map((item) =>
              item && typeof item === "object"
                ? String(item.sourceDocumentId ?? item.documentId ?? "").trim()
                : "",
            )
            .filter(Boolean);
        }),
      ),
    ];
    const sourceIds = evidenceIds.length > 0 ? evidenceIds : manifestIds;

    const iepRaw = loadDeclarativePackFromRoot(join(REPO_ROOT, "engine/domain-packs/iep/v0.2.1"));
    const iepNormalizer = compileDeclarativeObservationNormalizer(iepRaw);
    const result = normalizeReaderAcceptedFacts({
      context: minimalContext(sourceIds),
      acceptedFacts: artifact,
      domainId: "iep",
      packPin: {
        packId: iepNormalizer.packId,
        packVersion: iepNormalizer.packVersion,
        packContentSha256: hashCanonicalJson({ pack: "iep-v0.2.1" }),
      },
      packNormalizer: iepNormalizer,
      createdAt: "2026-10-18T00:00:00.000Z",
    });

    expect(result.empty).toBe(false);
    expect(result.accepted.length).toBe(artifact.facts.length);
    expect(result.quarantined.length).toBe(0);
    expect(result.accepted.every((obs) => obs.evidenceRefs.length > 0)).toBe(true);
    expect(result.snapshot?.observations.length).toBe(result.accepted.length);

    const second = normalizeReaderAcceptedFacts({
      context: minimalContext(sourceIds),
      acceptedFacts: artifact,
      domainId: "iep",
      packPin: {
        packId: iepNormalizer.packId,
        packVersion: iepNormalizer.packVersion,
        packContentSha256: hashCanonicalJson({ pack: "iep-v0.2.1" }),
      },
      packNormalizer: iepNormalizer,
      createdAt: "2026-10-18T00:00:00.000Z",
    });
    expect(second.snapshot?.contentDigest).toBe(result.snapshot?.contentDigest);
    expect(second.accepted.map((obs) => obs.id)).toEqual(result.accepted.map((obs) => obs.id));

    console.info("[L001 observation normalization]", {
      artifactPath,
      inputFacts: artifact.facts.length,
      accepted: result.accepted.length,
      quarantined: result.quarantined.length,
      contentDigest: result.snapshot?.contentDigest,
    });
  });
});
