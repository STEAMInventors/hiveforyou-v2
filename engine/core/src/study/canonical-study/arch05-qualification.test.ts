import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { findConsecutiveWordQuote } from "../../document/find-consecutive-word-quote.js";
import type { DocumentPages, PageWord } from "../../document/page-model.js";
import { explicitTotalPerWeek } from "../canonical-study-foundation/primitives.js";
import { buildCanonicalStudyFoundation } from "../canonical-study-foundation/index.js";
import { buildCanonicalStudy } from "./index.js";
import {
  SYNTHETIC_PACK,
  buildSyntheticFoundation,
  fieldQuote,
  mockPages,
  planGoalDoc,
  docWithStudent,
} from "./test-fixtures.js";

const PACK_SHA = "a".repeat(64);
const HERE = dirname(fileURLToPath(import.meta.url));
const L001_INITIAL_IEP = join(
  HERE,
  "../../../../intake/fixtures/l001/document-pages/08_initial_iep.json",
);

function word(text: string, seq: number): PageWord {
  return {
    seq,
    text,
    bbox: [0, 0, 1, 1],
    confidence: null,
    fontName: null,
    fontSize: null,
    bold: null,
    italic: null,
    source: "native",
  };
}

function foundationWith(
  pack: typeof SYNTHETIC_PACK,
  documents: Array<{
    sourceDocumentId: string;
    pages: DocumentPages | null;
    parsedModelJson: Record<string, unknown>;
  }>,
) {
  return buildCanonicalStudyFoundation({
    pack,
    packContentSha256: PACK_SHA,
    caseId: "case-test",
    createdAt: "2026-01-01T00:00:00.000Z",
    documents: documents.map((doc) => ({
      sourceDocumentId: doc.sourceDocumentId,
      documentPages: doc.pages,
      envelope: {
        schemaVersion: "hive.reader-document-extraction/1",
        studyRunId: "study-test",
        attemptId: "attempt-test",
        caseId: "case-test",
        userId: "user-test",
        sourceDocumentId: doc.sourceDocumentId,
        domainId: "synthetic",
        packId: "synthetic-test",
        packVersion: "0.0.1",
        packContentSha256: PACK_SHA,
        promptVersion: "hive-pack-driven-reader/0.2.0",
        modelProvider: "fixture",
        modelId: "fixture",
        status: "SUCCEEDED" as const,
        occurredAt: "2026-01-01T00:00:00.000Z",
        parsedModelJson: doc.parsedModelJson,
      },
    })),
  });
}

function loadL001InitialIepPages(): DocumentPages {
  const raw = JSON.parse(readFileSync(L001_INITIAL_IEP, "utf8")) as { documentPages: DocumentPages };
  return raw.documentPages;
}

describe("ARCH-05 quote atoms against stored L001 pages", () => {
  const pages = loadL001InitialIepPages();
  const page1 = pages.pages.find((page) => page.pageNumber === 1)!;
  const page2 = pages.pages.find((page) => page.pageNumber === 2)!;

  it("accepts 86% when the page word keeps a trailing period", () => {
    expect(findConsecutiveWordQuote(page1.words, "oral reading accuracy of 86%")).not.toBeNull();
  });

  it("accepts effortful when the page word keeps a comma", () => {
    expect(findConsecutiveWordQuote(page1.words, "slow and effortful with frequent pauses")).not.toBeNull();
  });

  it("accepts spaced oral reading fluency against the hyphenated page word", () => {
    expect(findConsecutiveWordQuote(page2.words, "measured using oral reading fluency probes")).not.toBeNull();
  });

  it("does not accept a substring of a hyphenated compound or a bare number inside a percent", () => {
    const fluency = page2.words.find((item) => item.text === "oral-reading-fluency");
    const percent = page1.words.find((item) => item.text.startsWith("86%"));
    expect(fluency).toBeTruthy();
    expect(percent).toBeTruthy();
    expect(findConsecutiveWordQuote([fluency!], "reading")).toBeNull();
    expect(findConsecutiveWordQuote([percent!], "86")).toBeNull();
  });

  it("joins a line-break hyphen and still refuses to skip a punctuation-only word", () => {
    const words = [word("flu-", 0), word("ency", 1), word("•", 2), word("score", 3)];
    expect(findConsecutiveWordQuote(words, "fluency")).not.toBeNull();
    expect(findConsecutiveWordQuote(words, "fluency score")).toBeNull();
  });
});

describe("ARCH-05 canonical study qualification", () => {
  it("merges a guaranteed-unique student when strong identifiers agree", () => {
    const foundation = buildSyntheticFoundation({
      documents: [docWithStudent("doc-1", "Alice", "2010-01-01"), docWithStudent("doc-2", "Alice", "2010-01-01")],
    });
    const study = buildCanonicalStudy({ pack: SYNTHETIC_PACK, packContentSha256: PACK_SHA, foundation });
    const students = study.entities.filter((entity) => entity.recordTypeId === "student");
    expect(students).toHaveLength(1);
    expect(students[0]?.reasons).toContain("case_singleton_guaranteed_unique");
    const headers = study.entities.filter((entity) => entity.recordTypeId === "document_header");
    expect(headers).toHaveLength(2);
    expect(headers.every((entity) => entity.status === "resolved" && entity.reasons.includes("document_scoped"))).toBe(
      true,
    );
  });

  it("blocks student merge when strong identifiers conflict", () => {
    const foundation = buildSyntheticFoundation({
      documents: [docWithStudent("doc-1", "Alice", "2010-01-01"), docWithStudent("doc-2", "Alice", "2010-01-02")],
    });
    const study = buildCanonicalStudy({ pack: SYNTHETIC_PACK, packContentSha256: PACK_SHA, foundation });
    const students = study.entities.filter((entity) => entity.recordTypeId === "student");
    expect(students.length).toBeGreaterThanOrEqual(2);
    expect(students.every((entity) => entity.reasons.includes("strong_identity_conflict"))).toBe(true);
    expect(study.possiblySameLinks.some((link) => link.reason === "strong_identity_conflict_candidate")).toBe(true);
  });

  it("merges repeatability-false singletons when caseSingletonMerge is unset", () => {
    const pack = {
      ...SYNTHETIC_PACK,
      recordTypes: SYNTHETIC_PACK.recordTypes.map((record) =>
        record.id === "student"
          ? { ...record, identity: { ...record.identity, caseSingletonMerge: undefined } }
          : record,
      ),
    };
    const foundation = buildSyntheticFoundation({
      documents: [docWithStudent("doc-1", "Alice", "2010-01-01"), docWithStudent("doc-2", "Alice", "2010-01-01")],
    });
    const study = buildCanonicalStudy({ pack, packContentSha256: PACK_SHA, foundation });
    expect(study.entities.filter((entity) => entity.recordTypeId === "student")).toHaveLength(1);
    expect(
      study.entities
        .filter((entity) => entity.recordTypeId === "student")
        .every((entity) => entity.reasons.includes("case_singleton_repeatable_false")),
    ).toBe(true);
  });

  it("builds one series across entities and collapses corroborating measurements", () => {
    const pack = {
      ...SYNTHETIC_PACK,
      documentTypes: SYNTHETIC_PACK.documentTypes.map((documentType) =>
        documentType.id === "doc.plan"
          ? { ...documentType, checklist: [...(documentType.checklist ?? []), "measurement"] }
          : documentType,
      ),
      constructs: {
        measure: {
          requiredFields: ["task", "score_type"],
          comparedIfBothPresent: ["instrument"],
          normalize: ["lowercase", "trim_punctuation", "vocabulary_synonyms"],
          seriesRestatementPolicy: {
            eventIdentityFieldIds: ["observed_on"],
            allowExplicitRestatementCorroboration: true,
          },
        },
      },
      vocabulary: {
        fieldSynonyms: [
          {
            field: "measure.task",
            terms: ["Oral Reading Fluency", "oral reading fluency", "reading fluency"],
            value: "reading fluency",
          },
        ],
      },
      recordTypes: [
        ...SYNTHETIC_PACK.recordTypes,
        {
          id: "measurement",
          repeatable: true,
          identity: {
            scope: "case" as const,
            keyFields: ["measure.task", "measure.score_type"],
            crossDocumentMerge: "independent_assertions" as const,
            versionAxis: "document.orderingDate",
          },
          usesConstructs: ["measure"],
          fields: [
            { id: "measure.task", valueKind: "text" as const, source: ["quoted" as const], modality: ["observed" as const] },
            {
              id: "measure.score_type",
              valueKind: "text" as const,
              source: ["quoted" as const],
              modality: ["observed" as const],
            },
            { id: "value", valueKind: "text" as const, source: ["quoted" as const], modality: ["observed" as const] },
            { id: "observed_on", valueKind: "date" as const, source: ["quoted" as const], modality: ["observed" as const] },
          ],
        },
      ],
    };
    const measurement = (
      sourceDocumentId: string,
      task: string,
      value: string,
      observedOn: string,
    ) => ({
      sourceDocumentId,
      pages: mockPages(sourceDocumentId, 1, `${observedOn} ${task} words_correct_per_minute ${value}`),
      parsedModelJson: {
        sourceDocumentId,
        documentTypeId: "doc.plan",
        recordInstances: [
          {
            recordTypeId: "document_header",
            instanceIndex: 0,
            fields: [fieldQuote("effective_date", "date", observedOn, sourceDocumentId, 1, observedOn)],
          },
          {
            recordTypeId: "measurement",
            instanceIndex: 0,
            fields: [
              fieldQuote("measure.task", "text", task, sourceDocumentId, 1, task),
              fieldQuote("measure.score_type", "text", "words_correct_per_minute", sourceDocumentId, 1, "words_correct_per_minute"),
              fieldQuote("value", "text", value, sourceDocumentId, 1, value),
              fieldQuote("observed_on", "date", observedOn, sourceDocumentId, 1, observedOn),
            ],
          },
        ],
      },
    });
    const foundation = foundationWith(pack, [
      measurement("m-1", "Oral Reading Fluency", "42", "2024-01-01"),
      measurement("m-2", "reading fluency", "50", "2024-06-01"),
      measurement("m-3", "oral reading fluency", "42", "2024-01-01"),
    ]);
    const study = buildCanonicalStudy({ pack, packContentSha256: PACK_SHA, foundation });
    const measurements = study.entities.filter((entity) => entity.recordTypeId === "measurement");
    expect(measurements).toHaveLength(3);
    expect(study.series).toHaveLength(1);
    expect(study.series[0]?.sourceEntityIds).toHaveLength(3);
    expect(study.series[0]?.observations).toHaveLength(2);
    const corroborated = study.series[0]?.observations.find((observation) => observation.observedDate === "2024-01-01");
    expect(corroborated?.role).toBe("value");
    expect(corroborated?.corroboratingProvenance).toHaveLength(1);
  });

  it("derives an explicit weekly total without treating it as a session rate", () => {
    expect(explicitTotalPerWeek("150 minutes weekly")).toEqual({
      ok: true,
      value: 150,
      unit: "minutes_per_week",
    });
    expect(explicitTotalPerWeek("30 minutes, 2 times a week").ok).toBe(false);
    const pack = {
      ...SYNTHETIC_PACK,
      recordTypes: SYNTHETIC_PACK.recordTypes.map((record) =>
        record.id === "service"
          ? {
              ...record,
              fields: [
                ...record.fields,
                {
                  id: "frequency_text",
                  valueKind: "text" as const,
                  source: ["quoted" as const],
                  modality: ["planned" as const],
                },
                {
                  id: "minutes_per_week",
                  valueKind: "quantity" as const,
                  source: ["derived" as const],
                  modality: ["planned" as const],
                  derivation: {
                    primitive: "ratePerWeek",
                    operands: ["minutes_per_session", "sessions_per_period", "period"],
                    alternates: [{ primitive: "explicitTotalPerWeek", operands: ["frequency_text"] }],
                  },
                },
              ],
            }
          : record,
      ),
    };
    const foundation = buildCanonicalStudyFoundation({
      pack,
      packContentSha256: PACK_SHA,
      caseId: "case-test",
      documents: [
        {
          sourceDocumentId: "svc-1",
          documentPages: mockPages("svc-1", 1, "2024-01-01 150 minutes weekly"),
          envelope: {
            schemaVersion: "hive.reader-document-extraction/1",
            studyRunId: "study-test",
            attemptId: "attempt-test",
            caseId: "case-test",
            userId: "user-test",
            sourceDocumentId: "svc-1",
            domainId: "synthetic",
            packId: "synthetic-test",
            packVersion: "0.0.1",
            packContentSha256: PACK_SHA,
            promptVersion: "hive-pack-driven-reader/0.2.0",
            modelProvider: "fixture",
            modelId: "fixture",
            status: "SUCCEEDED",
            occurredAt: "2026-01-01T00:00:00.000Z",
            parsedModelJson: {
              sourceDocumentId: "svc-1",
              documentTypeId: "doc.plan",
              recordInstances: [
                {
                  recordTypeId: "document_header",
                  instanceIndex: 0,
                  fields: [fieldQuote("effective_date", "date", "2024-01-01", "svc-1", 1, "2024-01-01")],
                },
                {
                  recordTypeId: "service",
                  instanceIndex: 0,
                  fields: [
                    fieldQuote("frequency_text", "text", "150 minutes weekly", "svc-1", 1, "150 minutes weekly"),
                  ],
                },
              ],
            },
          },
        },
      ],
    });
    const derived = foundation.verifiedFields.find((field) => field.fieldId === "minutes_per_week");
    expect(derived?.normalized.normalizedValue).toBe(150);
    expect(derived?.normalized.unit).toBe("minutes_per_week");
    expect(derived?.provenance).toBe("derived");
  });

  it("keeps missing required service fields unresolved and checks pages before absence", () => {
    const pack = {
      ...SYNTHETIC_PACK,
      requirements: {
        rules: [
          {
            id: "service_fields",
            appliesTo: "operative:doc.plan",
            checks: [
              {
                record: "service",
                forEach: true,
                fields: ["category", "end_date", "provider_role"],
              },
            ],
          },
          {
            id: "placement_absence",
            appliesTo: "operative:doc.plan",
            checks: [
              {
                record: "placement",
                fields: ["nonparticipation_explanation"],
                pageTerms: ["educational placement"],
              },
            ],
          },
        ],
      },
      recordTypes: [
        ...SYNTHETIC_PACK.recordTypes,
        {
          id: "placement",
          repeatable: false,
          identity: { scope: "case" as const, keyFields: ["setting"], versionAxis: "document.orderingDate" },
          fields: [
            {
              id: "nonparticipation_explanation",
              valueKind: "text" as const,
              source: ["quoted" as const],
              modality: ["planned" as const],
              comparison: "none" as const,
            },
          ],
        },
      ],
    };
    const present = buildSyntheticFoundation({
      documents: [
        {
          sourceDocumentId: "plan-a",
          pages: mockPages("plan-a", 1, "2024-01-01 speech"),
          parsedModelJson: {
            sourceDocumentId: "plan-a",
            documentTypeId: "doc.plan",
            recordInstances: [
              {
                recordTypeId: "document_header",
                instanceIndex: 0,
                fields: [fieldQuote("effective_date", "date", "2024-01-01", "plan-a", 1, "2024-01-01")],
              },
              {
                recordTypeId: "service",
                instanceIndex: 0,
                fields: [fieldQuote("category", "text", "speech", "plan-a", 1, "speech")],
              },
            ],
          },
        },
      ],
    });
    const presentStudy = buildCanonicalStudy({ pack, packContentSha256: PACK_SHA, foundation: present });
    const serviceResult = presentStudy.requirements.find((result) => result.ruleId === "service_fields");
    expect(serviceResult?.outcome).toBe("PRESENT_WITH_MISSING_FIELDS");
    expect(serviceResult?.message).toContain("partially_verified:end_date,provider_role");
    expect(serviceResult?.message.startsWith("presence_check_only:")).toBe(true);

    const absent = buildSyntheticFoundation({
      documents: [
        {
          sourceDocumentId: "plan-b",
          pages: mockPages("plan-b", 1, "2024-01-01 reading goal"),
          parsedModelJson: planGoalDoc("plan-b", "doc.plan", "reading goal", "2024-01-01"),
        },
      ],
    });
    const absentStudy = buildCanonicalStudy({ pack, packContentSha256: PACK_SHA, foundation: absent });
    const placement = absentStudy.requirements.find((result) => result.ruleId === "placement_absence");
    expect(placement?.outcome).toBe("NOT_FOUND_IN_SUPPLIED_DOCUMENTS");
    expect(placement?.message).toContain("not_found_after_page_review");

    const mentioned = foundationWith(pack, [
      {
        sourceDocumentId: "plan-c",
        pages: mockPages("plan-c", 1, "2024-01-01 educational placement reading goal"),
        parsedModelJson: planGoalDoc("plan-c", "doc.plan", "reading goal", "2024-01-01"),
      },
    ]);
    const mentionedStudy = buildCanonicalStudy({ pack, packContentSha256: PACK_SHA, foundation: mentioned });
    const mentionedPlacement = mentionedStudy.requirements.find((result) => result.ruleId === "placement_absence");
    expect(mentionedPlacement?.outcome).toBe("UNRESOLVED");
    expect(mentionedPlacement?.message).toContain("source_page_mentions_unverified:educational placement");
  });

  it("orders a referral from referral.referral_date", () => {
    const pack = {
      ...SYNTHETIC_PACK,
      documentTypes: SYNTHETIC_PACK.documentTypes.map((documentType) =>
        documentType.id === "doc.plan"
          ? { ...documentType, orderingDate: "referral.referral_date", checklist: [...(documentType.checklist ?? []), "referral"] }
          : documentType,
      ),
      recordTypes: [
        ...SYNTHETIC_PACK.recordTypes,
        {
          id: "referral",
          repeatable: true,
          identity: { scope: "case" as const, keyFields: ["referral_date"], versionAxis: "document.orderingDate" },
          fields: [
            {
              id: "referral_date",
              valueKind: "date" as const,
              source: ["quoted" as const],
              modality: ["observed" as const],
              comparison: "event" as const,
            },
            {
              id: "concern",
              valueKind: "text" as const,
              source: ["quoted" as const],
              modality: ["observed" as const],
              comparison: "none" as const,
            },
          ],
        },
      ],
    };
    const foundation = foundationWith(pack, [
      {
        sourceDocumentId: "ref-1",
        pages: mockPages("ref-1", 1, "2024-01-01 2023-06-01 reading concern"),
        parsedModelJson: {
            sourceDocumentId: "ref-1",
            documentTypeId: "doc.plan",
            recordInstances: [
              {
                recordTypeId: "document_header",
                instanceIndex: 0,
                fields: [fieldQuote("effective_date", "date", "2024-01-01", "ref-1", 1, "2024-01-01")],
              },
              {
                recordTypeId: "referral",
                instanceIndex: 0,
                fields: [
                  fieldQuote("referral_date", "date", "2023-06-01", "ref-1", 1, "2023-06-01"),
                  fieldQuote("concern", "text", "reading concern", "ref-1", 1, "reading concern"),
                ],
              },
            ],
          },
      },
    ]);
    expect(foundation.documents[0]?.verifiedOrderingDate).toBe("2023-06-01");
    expect(foundation.documents[0]?.orderingDateFieldPath).toBe("referral.referral_date");
  });

  it("does not order a referral from student birth_date when referral_date is missing", () => {
    const pack = {
      ...SYNTHETIC_PACK,
      documentTypes: SYNTHETIC_PACK.documentTypes.map((documentType) =>
        documentType.id === "doc.plan"
          ? {
              ...documentType,
              orderingDate: "referral.referral_date",
              checklist: [...(documentType.checklist ?? []), "referral", "student"],
            }
          : documentType,
      ),
      recordTypes: [
        ...SYNTHETIC_PACK.recordTypes,
        {
          id: "referral",
          repeatable: true,
          identity: { scope: "case" as const, keyFields: ["referral_date"], versionAxis: "document.orderingDate" },
          fields: [
            {
              id: "referral_date",
              valueKind: "date" as const,
              source: ["quoted" as const],
              modality: ["observed" as const],
              comparison: "event" as const,
            },
          ],
        },
      ],
    };
    const foundation = foundationWith(pack, [
      {
        sourceDocumentId: "ref-dob",
        pages: mockPages("ref-dob", 1, "2017-04-18 reading"),
        parsedModelJson: {
          sourceDocumentId: "ref-dob",
          documentTypeId: "doc.plan",
          recordInstances: [
            {
              recordTypeId: "student",
              instanceIndex: 0,
              fields: [fieldQuote("birth_date", "date", "2017-04-18", "ref-dob", 1, "2017-04-18")],
            },
          ],
        },
      },
    ]);
    expect(foundation.documents[0]?.verifiedOrderingDate).toBeNull();
    expect(foundation.documents[0]?.orderingDateFieldPath).toBe("referral.referral_date");
  });

  it("skips narrative comparison, treats same-period events as unresolved, and matches independent assertions", () => {
    const pack = {
      ...SYNTHETIC_PACK,
      recordTypes: SYNTHETIC_PACK.recordTypes.map((record) => {
        if (record.id !== "goal") {
          return record;
        }
        return {
          ...record,
          identity: { ...record.identity },
          fields: record.fields.map((field) => {
            if (field.id === "statement") {
              return { ...field, comparison: "none" as const };
            }
            if (field.id === "effective_date") {
              return { ...field, comparison: "event" as const };
            }
            return field;
          }),
        };
      }),
    };
    const goalDoc = (sourceDocumentId: string, statement: string, eventDate: string) => ({
      sourceDocumentId,
      pages: mockPages(sourceDocumentId, 1, `reading ${statement} 2024-01-01 ${eventDate}`),
      parsedModelJson: {
        sourceDocumentId,
        documentTypeId: "doc.plan",
        recordInstances: [
          {
            recordTypeId: "document_header",
            instanceIndex: 0,
            fields: [fieldQuote("effective_date", "date", "2024-01-01", sourceDocumentId, 1, "2024-01-01")],
          },
          {
            recordTypeId: "goal",
            instanceIndex: 0,
            fields: [
              fieldQuote("area", "text", "reading", sourceDocumentId, 1, "reading"),
              fieldQuote("statement", "text", statement, sourceDocumentId, 1, statement),
              fieldQuote("effective_date", "date", eventDate, sourceDocumentId, 1, eventDate),
            ],
          },
        ],
      },
    });
    const foundation = buildSyntheticFoundation({
      documents: [goalDoc("plan-a", "Goal A", "2024-02-01"), goalDoc("plan-b", "Goal B", "2024-03-01")],
    });
    const study = buildCanonicalStudy({ pack, packContentSha256: PACK_SHA, foundation });
    const goals = study.entities.filter((entity) => entity.recordTypeId === "goal");
    expect(goals).toHaveLength(1);
    expect(goals[0]?.recordVersions).toHaveLength(2);
    expect(study.relations.some((relation) => relation.fieldId === "statement")).toBe(false);
    expect(study.relations.some((relation) => relation.label === "CHANGE" && relation.fieldId === "effective_date")).toBe(
      false,
    );
    expect(
      study.unresolvedComparisons.some(
        (item) => item.fieldId === "effective_date" && item.reason === "same_period_independent_event",
      ),
    ).toBe(true);

    const independentPack = {
      ...pack,
      recordTypes: pack.recordTypes.map((record) =>
        record.id === "goal"
          ? {
              ...record,
              identity: { ...record.identity, crossDocumentMerge: "independent_assertions" as const },
            }
          : record,
      ),
    };
    const independent = buildCanonicalStudy({
      pack: independentPack,
      packContentSha256: PACK_SHA,
      foundation,
    });
    expect(independent.entities.filter((entity) => entity.recordTypeId === "goal")).toHaveLength(2);
    expect(
      independent.relations.some((relation) => relation.label === "MATCHES" && relation.fieldId === "area"),
    ).toBe(true);
    expect(independent.relations.some((relation) => relation.fieldId === "statement")).toBe(false);
  });

  it("excludes an identity-less valueless record from entities and keeps the diagnostic", () => {
    const foundation = buildSyntheticFoundation({
      documents: [
        {
          sourceDocumentId: "plan-a",
          pages: mockPages("plan-a", 1, "2024-01-01 hello"),
          parsedModelJson: {
            sourceDocumentId: "plan-a",
            documentTypeId: "doc.plan",
            recordInstances: [
              {
                recordTypeId: "document_header",
                instanceIndex: 0,
                fields: [fieldQuote("effective_date", "date", "2024-01-01", "plan-a", 1, "2024-01-01")],
              },
              {
                recordTypeId: "goal",
                instanceIndex: 0,
                fields: [
                  fieldQuote("area", "text", "reading", "plan-a", 1, "missing-area-quote"),
                  fieldQuote("statement", "text", "nowhere", "plan-a", 1, "missing-statement-quote"),
                ],
              },
            ],
          },
        },
      ],
    });
    const study = buildCanonicalStudy({ pack: SYNTHETIC_PACK, packContentSha256: PACK_SHA, foundation });
    expect(study.entities.some((entity) => entity.recordTypeId === "goal")).toBe(false);
    expect(study.orphans).toHaveLength(1);
    expect(study.orphans[0]?.status).toBe("rejected");
    expect(study.orphans[0]?.fieldKeys.length).toBeGreaterThan(0);
    expect(study.unresolvedItems.some((item) => item.kind === "orphan_record")).toBe(true);
    expect(study.rejectedFields.some((field) => field.recordTypeId === "goal")).toBe(true);
    expect(study.counts.orphans).toBe(1);
  });

  it("fires absenceOf and leaves incomplete insight operands unsupported", () => {
    const pack = {
      ...SYNTHETIC_PACK,
      insightChecks: {
        enginePrimitivesRequired: ["absenceOf", "elapsedSince", "coChange", "periodCoverage", "exists"],
        checks: [
          {
            id: "need_without_goal",
            primitive: "absenceOf",
            present: { record: "goal", field: "area" },
            absent: { record: "service", field: "category", scope: "same_document" },
            joinOn: "area_normalized",
            question: "{presentDocument} describes a need in {area}.",
          },
          {
            id: "reevaluation_interval",
            primitive: "elapsedSince",
            from: { record: "document_header", field: "effective_date", pick: "latest" },
            atLeastYears: 3,
            question: "Is a reevaluation scheduled?",
          },
          {
            id: "services_down_progress_insufficient",
            primitive: "coChange",
            question: "Should not fire",
          },
          {
            id: "progress_report_coverage",
            primitive: "periodCoverage",
            question: "Should not fire",
          },
        ],
      },
    };
    const foundation = buildSyntheticFoundation({
      documents: [
        {
          sourceDocumentId: "plan-a",
          pages: mockPages("plan-a", 1, "reading Goal 2024-01-01"),
          parsedModelJson: planGoalDoc("plan-a", "doc.plan", "Goal", "2024-01-01"),
        },
      ],
    });
    const first = buildCanonicalStudy({
      pack,
      packContentSha256: PACK_SHA,
      foundation,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const second = buildCanonicalStudy({
      pack,
      packContentSha256: PACK_SHA,
      foundation,
      createdAt: "2026-06-01T00:00:00.000Z",
    });
    const absence = first.flags.find((flag) => flag.checkId === "need_without_goal");
    expect(absence?.status).toBe("fired");
    expect(absence?.message).toBe("absenceOf_verified");
    expect(absence?.operands.length).toBeGreaterThan(0);
    const reevaluation = first.flags.find((flag) => flag.checkId === "reevaluation_interval");
    expect(reevaluation?.status).toBe("unresolved");
    expect(reevaluation?.message).toBe("missing_operand:comparison_end");
    expect(reevaluation?.operands).toHaveLength(1);
    expect(first.flags.find((flag) => flag.checkId === "services_down_progress_insufficient")?.message).toBe(
      "coChange_semantics_incomplete:window,direction_comparator",
    );
    expect(first.flags.find((flag) => flag.checkId === "progress_report_coverage")?.message).toBe(
      "periodCoverage_semantics_incomplete:operative_plan_period,frequency_expansion",
    );
    expect(first.flags.every((flag) => flag.status !== "fired" || flag.checkId === "need_without_goal")).toBe(true);
    expect(first.contentSha256).toBe(second.contentSha256);
  });

  it("keeps absenceOf unresolved when operands or candidate matches are incomplete", () => {
    const pack = {
      ...SYNTHETIC_PACK,
      insightChecks: {
        enginePrimitivesRequired: ["absenceOf"],
        checks: [
          {
            id: "need_without_goal",
            primitive: "absenceOf",
            present: { record: "goal", field: "area" },
            absent: { record: "service", field: "category", scope: "same_document" },
            joinOn: "area_normalized",
            question: "{presentDocument} describes a need in {area}.",
          },
        ],
      },
    };
    const incompleteOperands = buildCanonicalStudy({
      pack: {
        ...pack,
        insightChecks: {
          enginePrimitivesRequired: ["absenceOf"],
          checks: [{ id: "need_without_goal", primitive: "absenceOf", question: "Incomplete?" }],
        },
      },
      packContentSha256: PACK_SHA,
      foundation: buildSyntheticFoundation({
        documents: [
          {
            sourceDocumentId: "plan-a",
            pages: mockPages("plan-a", 1, "reading Goal 2024-01-01"),
            parsedModelJson: planGoalDoc("plan-a", "doc.plan", "Goal", "2024-01-01"),
          },
        ],
      }),
    });
    expect(incompleteOperands.flags.find((flag) => flag.checkId === "need_without_goal")).toMatchObject({
      status: "unresolved",
      message: "absenceOf_operands_incomplete",
    });

    const missingPresent = buildCanonicalStudy({
      pack,
      packContentSha256: PACK_SHA,
      foundation: buildSyntheticFoundation({
        documents: [
          {
            sourceDocumentId: "plan-a",
            pages: mockPages("plan-a", 1, "2024-01-01 Goal without area"),
            parsedModelJson: {
              sourceDocumentId: "plan-a",
              documentTypeId: "doc.plan",
              recordInstances: [
                {
                  recordTypeId: "document_header",
                  instanceIndex: 0,
                  fields: [fieldQuote("effective_date", "date", "2024-01-01", "plan-a", 1, "2024-01-01")],
                },
                {
                  recordTypeId: "goal",
                  instanceIndex: 0,
                  fields: [fieldQuote("statement", "text", "Goal without area", "plan-a", 1, "Goal without area")],
                },
              ],
            },
          },
        ],
      }),
    });
    expect(missingPresent.flags.find((flag) => flag.checkId === "need_without_goal")).toMatchObject({
      status: "unresolved",
      message: "missing_present_operand",
    });

    const unresolvedMatch = buildCanonicalStudy({
      pack,
      packContentSha256: PACK_SHA,
      foundation: buildSyntheticFoundation({
        documents: [
          {
            sourceDocumentId: "plan-a",
            pages: mockPages("plan-a", 1, "reading Goal 2024-01-01 speech"),
            parsedModelJson: {
              sourceDocumentId: "plan-a",
              documentTypeId: "doc.plan",
              recordInstances: [
                {
                  recordTypeId: "document_header",
                  instanceIndex: 0,
                  fields: [fieldQuote("effective_date", "date", "2024-01-01", "plan-a", 1, "2024-01-01")],
                },
                ...planGoalDoc("plan-a", "doc.plan", "Goal", "2024-01-01").recordInstances.slice(1),
                {
                  recordTypeId: "service",
                  instanceIndex: 0,
                  fields: [fieldQuote("minutes_per_week", "quantity", "150", "plan-a", 1, "150")],
                },
              ],
            },
          },
        ],
      }),
    });
    expect(unresolvedMatch.flags.find((flag) => flag.checkId === "need_without_goal")).toMatchObject({
      status: "unresolved",
      message: "absence_match_unresolved",
    });
  });
});
