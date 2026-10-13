import { describe, expect, it } from "vitest";

import {
  explicitTotalPerWeek,
  parseFrequency,
  ratePerWeek,
  tryDerivedPrimitive,
} from "../canonical-study-foundation/primitives.js";
import { buildCanonicalStudyFoundation } from "../canonical-study-foundation/index.js";
import { normalizedFieldValue } from "./construct-keys.js";
import { buildCanonicalStudy } from "./index.js";
import {
  SYNTHETIC_PACK,
  buildSyntheticFoundation,
  fieldQuote,
  mockPages,
} from "./test-fixtures.js";
import type { IndexedRecordVersion } from "./indexed-foundation.js";
import type { CanonicalStudyProvenanceChip } from "@hiveforyou/shared/canonical-study-artifact";

const PACK_SHA = "a".repeat(64);

function chipForArea(
  recordTypeId: string,
  sourceDocumentId: string,
  areaDisplay: string,
  areaNormalized: string,
): IndexedRecordVersion {
  const areaChip: CanonicalStudyProvenanceChip = {
    fieldKey: `${sourceDocumentId}|${recordTypeId}|0|area`,
    recordGroupId: "group-a",
    sourceDocumentId,
    recordTypeId,
    instanceIndex: 0,
    fieldId: "area",
    evidence: [],
    normalized: {
      valueKind: "text",
      displayValue: areaDisplay,
      normalizedValue: areaNormalized,
    },
    envelopeRef: {
      studyRunId: "study-test",
      attemptId: "attempt-test",
      sourceDocumentId,
      envelopeStatus: "SUCCEEDED",
    },
  };
  return {
    recordGroupId: "group-a",
    sourceDocumentId,
    recordTypeId,
    instanceIndex: 0,
    documentTypeId: "doc.plan",
    orderingDate: "2024-01-01",
    sortRank: 0,
    party: null,
    fieldKeys: ["area"],
    provenanceByFieldKey: { area: areaChip },
  };
}

describe("ARCH-05 P0 corrections", () => {
  describe("P0.1 universal normalization", () => {
    it("joins Reading Fluency and reading fluency on area_normalized keys", () => {
      const pack = {
        ...SYNTHETIC_PACK,
        vocabulary: {
          fieldSynonyms: [
            {
              field: "goal.area",
              terms: ["Reading Fluency", "reading fluency"],
              value: "reading fluency",
            },
            {
              field: "present_level.area",
              terms: ["Reading Fluency", "reading fluency"],
              value: "reading fluency",
            },
          ],
        },
      };
      const goal = chipForArea("goal", "plan-a", "Reading Fluency", "reading fluency");
      const present = chipForArea("present_level", "plan-a", "reading fluency", "reading fluency");
      expect(normalizedFieldValue(goal, "area", pack)).toBe("reading fluency");
      expect(normalizedFieldValue(present, "area", pack)).toBe("reading fluency");
    });

    it("does not collapse distinct area concepts", () => {
      const pack = {
        ...SYNTHETIC_PACK,
        vocabulary: {
          fieldSynonyms: [
            {
              field: "goal.area",
              terms: ["Reading Fluency", "reading fluency"],
              value: "reading fluency",
            },
          ],
        },
      };
      const reading = chipForArea("goal", "plan-a", "Reading", "reading");
      const fluency = chipForArea("goal", "plan-b", "Reading Fluency", "reading fluency");
      expect(normalizedFieldValue(reading, "area", pack)).toBe("reading");
      expect(normalizedFieldValue(fluency, "area", pack)).toBe("reading fluency");
      expect(normalizedFieldValue(reading, "area", pack)).not.toBe(
        normalizedFieldValue(fluency, "area", pack),
      );
    });

    it("does not fire goal_without_present_level when areas differ only by case/synonyms", () => {
      const pack = {
        ...SYNTHETIC_PACK,
        documentTypes: SYNTHETIC_PACK.documentTypes.map((documentType) =>
          documentType.id === "doc.plan"
            ? { ...documentType, checklist: [...documentType.checklist, "present_level"] }
            : documentType,
        ),
        insightChecks: {
          enginePrimitivesRequired: ["absenceOf"],
          checks: [
            {
              id: "goal_without_present_level",
              primitive: "absenceOf",
              present: { record: "goal", field: "area" },
              absent: { record: "present_level", field: "area", scope: "same_document" },
              joinOn: "area_normalized",
              question: "Missing present level for {area}?",
            },
          ],
        },
        recordTypes: [
          ...SYNTHETIC_PACK.recordTypes.filter((r) => r.id !== "goal"),
          {
            ...SYNTHETIC_PACK.recordTypes.find((r) => r.id === "goal")!,
            fields: [
              ...SYNTHETIC_PACK.recordTypes.find((r) => r.id === "goal")!.fields,
            ],
          },
          {
            id: "present_level",
            repeatable: true,
            identity: {
              scope: "case" as const,
              keyFields: ["area"],
              versionAxis: "document.orderingDate",
            },
            fields: [
              {
                id: "area",
                valueKind: "text" as const,
                source: ["quoted" as const],
                modality: ["observed" as const],
              },
            ],
          },
        ],
        vocabulary: {
          fieldSynonyms: [
            {
              field: "goal.area",
              terms: ["Reading Fluency", "reading fluency"],
              value: "reading fluency",
            },
            {
              field: "present_level.area",
              terms: ["Reading Fluency", "reading fluency"],
              value: "reading fluency",
            },
          ],
        },
      };

      const foundation = buildSyntheticFoundation({
        pack,
        documents: [
          {
            sourceDocumentId: "plan-a",
            pages: mockPages("plan-a", 1, "Reading Fluency goal reading fluency present"),
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
                    fieldQuote("area", "text", "Reading Fluency", "plan-a", 1, "Reading Fluency"),
                    fieldQuote("statement", "text", "Goal", "plan-a", 1, "Goal"),
                  ],
                },
                {
                  recordTypeId: "present_level",
                  instanceIndex: 0,
                  fields: [
                    fieldQuote("area", "text", "reading fluency", "plan-a", 1, "reading fluency"),
                  ],
                },
              ],
            },
          },
        ],
      });

      const study = buildCanonicalStudy({ pack, packContentSha256: PACK_SHA, foundation });
      const flag = study.flags.find((f) => f.checkId === "goal_without_present_level");
      expect(flag).toBeUndefined();
    });

    it("applies comparable normalization on a synthetic non-IEP pack", () => {
      const pack = {
        ...SYNTHETIC_PACK,
        vocabulary: {
          fieldSynonyms: [
            {
              field: "goal.area",
              terms: ["Alpha Track", "alpha track"],
              value: "alpha track",
            },
          ],
        },
      };
      const record = chipForArea("goal", "doc-x", "Alpha Track", "alpha track");
      expect(normalizedFieldValue(record, "area", pack)).toBe("alpha track");
    });
  });

  describe("P0.2 evidence-backed classification", () => {
    const classificationPack = {
      ...SYNTHETIC_PACK,
      documentTypes: SYNTHETIC_PACK.documentTypes.map((documentType) =>
        documentType.id === "doc.plan"
          ? { ...documentType, checklist: [...documentType.checklist, "evaluation_finding"] }
          : documentType,
      ),
      insightChecks: {
        enginePrimitivesRequired: ["absenceOf"],
        checks: [
          {
            id: "need_without_goal",
            primitive: "absenceOf",
            present: {
              record: "evaluation_finding",
              field: "area",
              where: { need_identified: ["yes"] },
            },
            absent: { record: "goal", field: "area", scope: "same_document" },
            joinOn: "area_normalized",
            question: "{presentDocument} describes a need in {area}.",
          },
        ],
      },
      recordTypes: [
        ...SYNTHETIC_PACK.recordTypes,
        {
          id: "evaluation_finding",
          repeatable: true,
          identity: {
            scope: "case" as const,
            keyFields: ["area"],
            versionAxis: "document.orderingDate",
          },
          fields: [
            {
              id: "area",
              valueKind: "text" as const,
              source: ["quoted" as const],
              modality: ["observed" as const],
            },
            {
              id: "need_identified",
              valueKind: "classification" as const,
              source: ["classified" as const],
              modality: ["observed" as const],
              enum: ["yes", "no", "unclear"],
            },
          ],
        },
      ],
    };

    function evalFindingDoc(
      sourceDocumentId: string,
      area: string,
      need: string | null,
    ) {
      const fields = [fieldQuote("area", "text", area, sourceDocumentId, 1, area)];
      if (need != null) {
        fields.push({
          fieldId: "need_identified",
          provenance: "classified" as const,
          valueKind: "classification" as const,
          value: need,
          modality: "observed",
          missingState: null,
          evidence: { sourceDocumentId, page: 1, quote: need },
        });
      }
      return {
        sourceDocumentId,
        pages: mockPages(sourceDocumentId, 1, `${area} ${need ?? ""}`),
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
              recordTypeId: "evaluation_finding",
              instanceIndex: 0,
              fields,
            },
          ],
        },
      };
    }

    it("fires need_without_goal only for verified yes classification", () => {
      const foundation = buildSyntheticFoundation({
        pack: classificationPack,
        documents: [evalFindingDoc("eval-a", "math", "yes")],
      });
      const study = buildCanonicalStudy({
        pack: classificationPack,
        packContentSha256: PACK_SHA,
        foundation,
        sourceContext: {
          logicalDocuments: [{ sourceDocumentId: "eval-a", filename: "05_academic_evaluation.pdf" }],
        },
      });
      const flag = study.flags.find((f) => f.checkId === "need_without_goal");
      expect(flag?.status).toBe("fired");
      expect(flag?.question).toContain("05_academic_evaluation");
      expect(flag?.question).not.toContain("eval-a");
    });

    it("does not treat no, unclear, or missing classification as positive", () => {
      for (const need of ["no", "unclear"] as const) {
        const foundation = buildSyntheticFoundation({
          pack: classificationPack,
          documents: [evalFindingDoc("eval-b", "math", need)],
        });
        const study = buildCanonicalStudy({
          pack: classificationPack,
          packContentSha256: PACK_SHA,
          foundation,
        });
        const flag = study.flags.find((f) => f.checkId === "need_without_goal");
        expect(flag?.status).not.toBe("fired");
        expect(flag?.message).toBe("missing_present_operand");
      }

      const missing = buildSyntheticFoundation({
        pack: classificationPack,
        documents: [evalFindingDoc("eval-c", "math", null)],
      });
      const missingStudy = buildCanonicalStudy({
        pack: classificationPack,
        packContentSha256: PACK_SHA,
        foundation: missing,
      });
      expect(missingStudy.flags.find((f) => f.checkId === "need_without_goal")?.message).toBe(
        "missing_present_operand",
      );
    });

    it("supports classification on a synthetic non-IEP record type", () => {
      const pack = {
        ...classificationPack,
        documentTypes: classificationPack.documentTypes.map((documentType) =>
          documentType.id === "doc.plan"
            ? {
                ...documentType,
                checklist: documentType.checklist.map((entry) =>
                  entry === "evaluation_finding" ? "external_finding" : entry,
                ),
              }
            : documentType,
        ),
        recordTypes: [
          ...classificationPack.recordTypes.filter((record) => record.id !== "evaluation_finding"),
          {
            id: "external_finding",
            repeatable: true,
            identity: {
              scope: "case" as const,
              keyFields: ["area"],
              versionAxis: "document.orderingDate",
            },
            fields: classificationPack.recordTypes.find((record) => record.id === "evaluation_finding")!.fields,
          },
        ],
        insightChecks: {
          enginePrimitivesRequired: ["absenceOf"],
          checks: [
            {
              id: "need_without_goal",
              primitive: "absenceOf",
              present: {
                record: "external_finding",
                field: "area",
                where: { need_identified: ["yes"] },
              },
              absent: { record: "goal", field: "area", scope: "same_document" },
              joinOn: "area_normalized",
              question: "Need?",
            },
          ],
        },
      };
      const doc = evalFindingDoc("ext-1", "alpha", "yes");
      doc.parsedModelJson.recordInstances[1]!.recordTypeId = "external_finding";
      const foundation = buildSyntheticFoundation({ pack, documents: [doc] });
      const study = buildCanonicalStudy({ pack, packContentSha256: PACK_SHA, foundation });
      expect(study.flags.find((f) => f.checkId === "need_without_goal")?.status).toBe("fired");
    });
  });

  describe("P0.3 unit-safe parsing", () => {
    it("parses explicit weekly duration totals without session counts", () => {
      expect(explicitTotalPerWeek("150 minutes weekly")).toEqual({
        ok: true,
        value: 150,
        unit: "minutes_per_week",
      });
      expect(parseFrequency("150 minutes weekly").ok).toBe(false);
      expect(tryDerivedPrimitive("parseFrequency", { frequency_text: "150 minutes weekly" }).ok).toBe(
        false,
      );
    });

    it("derives 150 minutes/week from session rate operands", () => {
      expect(
        ratePerWeek({
          minutesPerSession: 50,
          sessionsPerPeriod: 3,
          period: "week",
        }),
      ).toEqual({ ok: true, value: 150, unit: "min/week" });
    });

    it("leaves ambiguous frequency text unresolved for session derivation", () => {
      expect(parseFrequency("150 minutes weekly").ok).toBe(false);
      expect(explicitTotalPerWeek("30 minutes, 2 times a week").ok).toBe(false);
    });

    it("derives minutes_per_week in foundation with verified operand lineage", () => {
      const pack = {
        ...SYNTHETIC_PACK,
        recordTypes: SYNTHETIC_PACK.recordTypes.map((record) =>
          record.id === "service"
            ? {
                ...record,
                fields: [
                  { id: "category", valueKind: "text" as const, source: ["quoted" as const], modality: ["planned" as const] },
                  {
                    id: "frequency_text",
                    valueKind: "text" as const,
                    source: ["quoted" as const],
                    modality: ["planned" as const],
                  },
                  {
                    id: "minutes_per_session",
                    valueKind: "quantity" as const,
                    source: ["quoted" as const],
                    modality: ["planned" as const],
                  },
                  {
                    id: "sessions_per_period",
                    valueKind: "quantity" as const,
                    source: ["derived" as const],
                    modality: ["planned" as const],
                    derivation: {
                      primitive: "parseFrequency",
                      operands: ["frequency_text"],
                    },
                  },
                  {
                    id: "period",
                    valueKind: "code" as const,
                    source: ["classified" as const],
                    modality: ["planned" as const],
                    enum: ["week"],
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
            documentPages: mockPages("svc-1", 1, "50 minutes 3 times per week"),
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
                      fieldQuote("frequency_text", "text", "3 times per week", "svc-1", 1, "3 times per week"),
                      fieldQuote("minutes_per_session", "quantity", "50", "svc-1", 1, "50"),
                      {
                        ...fieldQuote("period", "text", "week", "svc-1", 1, "week"),
                        provenance: "classified" as const,
                        valueKind: "code" as const,
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
      });

      const derived = foundation.verifiedFields.find((f) => f.fieldId === "minutes_per_week");
      expect(derived?.normalized.normalizedValue).toBe(150);
      expect(derived?.provenance).toBe("derived");
      expect(derived?.normalized.unit).toBe("min/week");
    });
  });
});
