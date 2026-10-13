import { describe, expect, it } from "vitest";

import { buildCanonicalStudyFoundation } from "../canonical-study-foundation/index.js";
import { buildCanonicalStudy } from "./index.js";
import { SYNTHETIC_PACK, fieldQuote, mockPages, planGoalDoc } from "./test-fixtures.js";

const PACK_SHA = "a".repeat(64);

describe("ARCH-05 extraction coverage gate", () => {
  it("returns UNRESOLVED for placement absence when operative source extraction is incomplete", () => {
    const pack = {
      ...SYNTHETIC_PACK,
      requirements: {
        rules: [
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

    const foundation = buildCanonicalStudyFoundation({
      pack,
      packContentSha256: PACK_SHA,
      caseId: "case-test",
      createdAt: "2026-01-01T00:00:00.000Z",
      documents: [
        {
          sourceDocumentId: "plan-a",
          documentPages: mockPages("plan-a", 1, "2024-01-01 reading goal"),
          envelope: {
            schemaVersion: "hive.reader-document-extraction/1",
            studyRunId: "study-test",
            attemptId: "attempt-test",
            caseId: "case-test",
            userId: "user-test",
            sourceDocumentId: "plan-a",
            domainId: "synthetic",
            packId: "synthetic-test",
            packVersion: "0.0.1",
            packContentSha256: PACK_SHA,
            promptVersion: "hive-pack-driven-reader/0.2.0",
            modelProvider: "fixture",
            modelId: "fixture",
            status: "SUCCEEDED",
            occurredAt: "2026-01-01T00:00:00.000Z",
            parsedModelJson: planGoalDoc("plan-a", "doc.plan", "reading goal", "2024-01-01"),
          },
        },
        {
          sourceDocumentId: "plan-b",
          documentPages: mockPages("plan-b", 1, "2024-01-01 failed plan"),
          envelope: {
            schemaVersion: "hive.reader-document-extraction/1",
            studyRunId: "study-test",
            attemptId: "attempt-test",
            caseId: "case-test",
            userId: "user-test",
            sourceDocumentId: "plan-b",
            domainId: "synthetic",
            packId: "synthetic-test",
            packVersion: "0.0.1",
            packContentSha256: PACK_SHA,
            promptVersion: "hive-pack-driven-reader/0.2.0",
            modelProvider: "fixture",
            modelId: "fixture",
            status: "MODEL_ERROR",
            occurredAt: "2026-01-01T00:00:00.000Z",
            sanitizedError: { code: "MODEL_TIMEOUT", message: "Reader model call timed out." },
          },
        },
      ],
    });

    const study = buildCanonicalStudy({ pack, packContentSha256: PACK_SHA, foundation });
    const placement = study.requirements.find((result) => result.ruleId === "placement_absence");
    expect(placement?.outcome).toBe("UNRESOLVED");
    expect(placement?.message).toContain("source_extraction_incomplete:plan-b");
  });

  it("blocks absenceOf from firing when relevant extraction is incomplete", () => {
    const pack = {
      ...SYNTHETIC_PACK,
      insightChecks: {
        enginePrimitivesRequired: ["absenceOf"],
        checks: [
          {
            id: "need_without_goal",
            primitive: "absenceOf",
            present: { record: "goal", field: "area", scope: "operative:doc.plan" },
            absent: { record: "service", field: "category", scope: "same_document" },
            joinOn: "area_normalized",
            question: "{presentDocument} describes a need in {area}.",
          },
        ],
      },
    };

    const foundation = buildCanonicalStudyFoundation({
      pack,
      packContentSha256: PACK_SHA,
      caseId: "case-test",
      createdAt: "2026-01-01T00:00:00.000Z",
      documents: [
        {
          sourceDocumentId: "plan-a",
          documentPages: mockPages("plan-a", 1, "reading Goal 2024-01-01 speech"),
          envelope: {
            schemaVersion: "hive.reader-document-extraction/1",
            studyRunId: "study-test",
            attemptId: "attempt-test",
            caseId: "case-test",
            userId: "user-test",
            sourceDocumentId: "plan-a",
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
              sourceDocumentId: "plan-a",
              documentTypeId: "doc.plan",
              recordInstances: [
                {
                  recordTypeId: "document_header",
                  instanceIndex: 0,
                  fields: [fieldQuote("effective_date", "date", "2024-01-01", "plan-a", 1, "2024-01-01")],
                },
                ...planGoalDoc("plan-a", "doc.plan", "Goal", "2024-01-01").recordInstances.slice(1),
              ],
            },
          },
        },
        {
          sourceDocumentId: "plan-b",
          documentPages: mockPages("plan-b", 1, "2024-01-01"),
          envelope: {
            schemaVersion: "hive.reader-document-extraction/1",
            studyRunId: "study-test",
            attemptId: "attempt-test",
            caseId: "case-test",
            userId: "user-test",
            sourceDocumentId: "plan-b",
            domainId: "synthetic",
            packId: "synthetic-test",
            packVersion: "0.0.1",
            packContentSha256: PACK_SHA,
            promptVersion: "hive-pack-driven-reader/0.2.0",
            modelProvider: "fixture",
            modelId: "fixture",
            status: "MODEL_ERROR",
            occurredAt: "2026-01-01T00:00:00.000Z",
            sanitizedError: { code: "MODEL_TIMEOUT", message: "Reader model call timed out." },
          },
        },
      ],
    });

    const study = buildCanonicalStudy({ pack, packContentSha256: PACK_SHA, foundation });
    expect(study.flags.find((flag) => flag.checkId === "need_without_goal")).toMatchObject({
      status: "unresolved",
      message: expect.stringContaining("source_extraction_incomplete"),
    });
  });

  it("returns UNRESOLVED instead of NOT_FOUND when operative classification is unknown", () => {
    const pack = {
      ...SYNTHETIC_PACK,
      requirements: {
        rules: [
          {
            id: "goal_presence",
            appliesTo: "operative:doc.plan",
            checks: [{ record: "goal", fields: ["statement"], minCount: 1 }],
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
      insightChecks: {
        enginePrimitivesRequired: ["absenceOf", "exists"],
        checks: [
          {
            id: "goal_exists",
            primitive: "exists",
            left: { record: "goal", field: "statement" },
            question: "Goal {value}?",
          },
          {
            id: "need_without_goal",
            primitive: "absenceOf",
            present: { record: "goal", field: "area", scope: "operative:doc.plan" },
            absent: { record: "service", field: "category", scope: "same_document" },
            joinOn: "area_normalized",
            question: "{presentDocument} describes a need in {area}.",
          },
        ],
      },
    };

    const foundation = buildCanonicalStudyFoundation({
      pack,
      packContentSha256: PACK_SHA,
      caseId: "case-test",
      createdAt: "2026-01-01T00:00:00.000Z",
      documents: [
        {
          sourceDocumentId: "plan-a",
          documentPages: mockPages("plan-a", 1, "reading Goal 2024-01-01 speech"),
          envelope: {
            schemaVersion: "hive.reader-document-extraction/1",
            studyRunId: "study-test",
            attemptId: "attempt-test",
            caseId: "case-test",
            userId: "user-test",
            sourceDocumentId: "plan-a",
            domainId: "synthetic",
            packId: "synthetic-test",
            packVersion: "0.0.1",
            packContentSha256: PACK_SHA,
            promptVersion: "hive-pack-driven-reader/0.2.0",
            modelProvider: "fixture",
            modelId: "fixture",
            status: "SUCCEEDED",
            occurredAt: "2026-01-01T00:00:00.000Z",
            parsedModelJson: planGoalDoc("plan-a", "doc.plan", "Goal", "2024-01-01"),
          },
        },
        {
          sourceDocumentId: "plan-b",
          documentPages: mockPages("plan-b", 1, "2024-01-01 supplemental pages"),
          envelope: {
            schemaVersion: "hive.reader-document-extraction/1",
            studyRunId: "study-test",
            attemptId: "attempt-test",
            caseId: "case-test",
            userId: "user-test",
            sourceDocumentId: "plan-b",
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
              sourceDocumentId: "plan-b",
              documentTypeId: "UNKNOWN",
              recordInstances: [
                {
                  recordTypeId: "document_header",
                  instanceIndex: 0,
                  fields: [fieldQuote("effective_date", "date", "2024-01-01", "plan-b", 1, "2024-01-01")],
                },
              ],
            },
          },
        },
      ],
    });

    const study = buildCanonicalStudy({ pack, packContentSha256: PACK_SHA, foundation });
    expect(foundation.verifiedFields.some((field) => field.recordTypeId === "goal")).toBe(true);
    expect(study.requirements.find((result) => result.ruleId === "goal_presence")).toMatchObject({
      outcome: "PRESENT",
    });
    expect(study.flags.find((flag) => flag.checkId === "goal_exists")).toMatchObject({
      status: "fired",
      message: "exists_verified",
    });
    expect(study.requirements.find((result) => result.ruleId === "placement_absence")).toMatchObject({
      outcome: "UNRESOLVED",
      message: expect.stringContaining("source_classification_unresolved:plan-b"),
    });
    expect(study.flags.find((flag) => flag.checkId === "need_without_goal")).toMatchObject({
      status: "unresolved",
      message: expect.stringContaining("source_classification_unresolved"),
    });
    expect(
      study.requirements.some((result) => result.outcome === "NOT_FOUND_IN_SUPPLIED_DOCUMENTS"),
    ).toBe(false);
    expect(study.flags.some((flag) => flag.status === "fired" && flag.message === "absenceOf_verified")).toBe(
      false,
    );
  });

  it("permits absence evaluation when unrelated documents are classified outside the scope", () => {
    const pack = {
      ...SYNTHETIC_PACK,
      requirements: {
        rules: [
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

    const foundation = buildCanonicalStudyFoundation({
      pack,
      packContentSha256: PACK_SHA,
      caseId: "case-test",
      createdAt: "2026-01-01T00:00:00.000Z",
      documents: [
        {
          sourceDocumentId: "plan-a",
          documentPages: mockPages("plan-a", 1, "2024-01-01 reading goal"),
          envelope: {
            schemaVersion: "hive.reader-document-extraction/1",
            studyRunId: "study-test",
            attemptId: "attempt-test",
            caseId: "case-test",
            userId: "user-test",
            sourceDocumentId: "plan-a",
            domainId: "synthetic",
            packId: "synthetic-test",
            packVersion: "0.0.1",
            packContentSha256: PACK_SHA,
            promptVersion: "hive-pack-driven-reader/0.2.0",
            modelProvider: "fixture",
            modelId: "fixture",
            status: "SUCCEEDED",
            occurredAt: "2026-01-01T00:00:00.000Z",
            parsedModelJson: planGoalDoc("plan-a", "doc.plan", "reading goal", "2024-01-01"),
          },
        },
        {
          sourceDocumentId: "notice-a",
          documentPages: mockPages("notice-a", 1, "2024-01-01 parent notice"),
          envelope: {
            schemaVersion: "hive.reader-document-extraction/1",
            studyRunId: "study-test",
            attemptId: "attempt-test",
            caseId: "case-test",
            userId: "user-test",
            sourceDocumentId: "notice-a",
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
              sourceDocumentId: "notice-a",
              documentTypeId: "doc.notice",
              recordInstances: [
                {
                  recordTypeId: "document_header",
                  instanceIndex: 0,
                  fields: [fieldQuote("effective_date", "date", "2024-01-01", "notice-a", 1, "2024-01-01")],
                },
              ],
            },
          },
        },
      ],
    });

    const study = buildCanonicalStudy({ pack, packContentSha256: PACK_SHA, foundation });
    expect(study.requirements.find((result) => result.ruleId === "placement_absence")).toMatchObject({
      outcome: "NOT_FOUND_IN_SUPPLIED_DOCUMENTS",
      message: "presence_check_only:not_found_after_page_review",
    });
  });
});
