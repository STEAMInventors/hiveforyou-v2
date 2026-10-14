import { describe, expect, it } from "vitest";

import { computeProposalPackContentSha256 } from "@hiveforyou/domain-pack/pack-driven-reader";

import { buildCanonicalStudyFoundation } from "../canonical-study-foundation/index.js";
import { projectCanonicalStudyTimeline } from "../../projections/project-canonical-study-timeline.js";
import { assembleCaseTimeline } from "./assemble-case-timeline.js";
import { buildCanonicalStudy } from "./index.js";
import { buildIndexedFoundation } from "./indexed-foundation.js";
import {
  SYNTHETIC_PACK,
  envelope,
  fieldQuote,
  buildSyntheticFoundation,
  mockPages,
  planGoalDoc,
} from "./test-fixtures.js";

const PACK_SHA = () => computeProposalPackContentSha256(SYNTHETIC_PACK);

describe("assembleCaseTimeline", () => {
  it("orders dated entries and keeps undated out of dated section", () => {
    const pack = {
      ...SYNTHETIC_PACK,
      caseTimeline: {
        events: [
          {
            id: "undated_goal",
            label: "Goal without date",
            documentTypeId: "doc.plan",
            recordTypeId: "goal",
            dateFieldPath: "goal.effective_date",
            dateKind: "event_date" as const,
            eventEvidenceFieldPaths: ["goal.statement"],
          },
        ],
      },
    };
    const sourceDocumentId = "doc-a";
    const foundation = buildCanonicalStudyFoundation({
      pack,
      packContentSha256: computeProposalPackContentSha256(pack),
      caseId: "case-1",
      documents: [
        {
          sourceDocumentId,
          documentPages: mockPages(sourceDocumentId, 1, "Goal text"),
          envelope: envelope({
            sourceDocumentId,
            parsedModelJson: {
              ...planGoalDoc(sourceDocumentId, "doc.plan", "Goal text", "2024-06-01", false),
              recordInstances: [
                {
                  recordTypeId: "document_header",
                  instanceIndex: 0,
                  fields: [fieldQuote("title", "text", "Plan", sourceDocumentId, 1, "Plan")],
                },
                {
                  recordTypeId: "goal",
                  instanceIndex: 0,
                  fields: [fieldQuote("statement", "text", "Goal text", sourceDocumentId, 1, "Goal text")],
                },
              ],
            },
          }),
        },
      ],
    });
    const indexed = buildIndexedFoundation({ pack, foundation, sourceContext: {} });
    const timeline = assembleCaseTimeline({
      indexed,
      entities: [],
      documentLineage: [],
      documents: foundation.documents.map((doc) => ({
        sourceDocumentId: doc.sourceDocumentId,
        documentTypeId: doc.documentTypeId,
        extractionStatus: doc.extractionStatus,
        classificationStatus: doc.classificationStatus,
      })),
    });
    expect(timeline.dated).toHaveLength(0);
    expect(timeline.dateUnknown).toHaveLength(1);
    expect(timeline.dateUnknown[0]?.status).toBe("missing_date");
  });

  it("deduplicates pack rule and comparison:event field on same anchor", () => {
    const pack = {
      ...SYNTHETIC_PACK,
      recordTypes: SYNTHETIC_PACK.recordTypes.map((record) =>
        record.id === "goal"
          ? {
              ...record,
              fields: record.fields.map((field) =>
                field.id === "effective_date" ? { ...field, comparison: "event" as const } : field,
              ),
            }
          : record,
      ),
    };
    const sourceDocumentId = "doc-dedup";
    const foundation = buildSyntheticFoundation({
      pack,
      packContentSha256: computeProposalPackContentSha256(pack),
      documents: [
        {
          sourceDocumentId,
          pages: mockPages(sourceDocumentId, 1, "2024-01-15"),
          parsedModelJson: planGoalDoc(sourceDocumentId, "doc.plan", "Read", "2024-01-15"),
        },
      ],
    });
    const study = buildCanonicalStudy({
      pack,
      packContentSha256: computeProposalPackContentSha256(pack),
      foundation,
    });
    const goalDerived = study.timeline.dated.filter((entry) => entry.eventId.startsWith("derived:"));
    expect(goalDerived.length).toBeLessThanOrEqual(1);
  });

  it("places incomplete extraction in incomplete section without dated row", () => {
    const sourceDocumentId = "doc-fail";
    const foundation = buildCanonicalStudyFoundation({
      pack: SYNTHETIC_PACK,
      packContentSha256: PACK_SHA(),
      caseId: "case-fail",
      documents: [
        {
          sourceDocumentId,
          envelope: envelope({
            sourceDocumentId,
            status: "MODEL_ERROR",
            sanitizedError: { code: "MODEL_TIMEOUT", message: "timeout" },
            parsedModelJson: {
              sourceDocumentId,
              documentTypeId: "doc.plan",
              recordInstances: [],
            },
          }),
        },
      ],
    });
    const study = buildCanonicalStudy({
      pack: SYNTHETIC_PACK,
      packContentSha256: PACK_SHA(),
      foundation,
    });
    expect(study.timeline.dated.some((entry) => entry.sourceDocumentId === sourceDocumentId)).toBe(false);
    expect(study.timeline.incomplete.some((entry) => entry.sourceDocumentId === sourceDocumentId)).toBe(true);
  });

  it("keeps customer and pro provenance identical", () => {
    const sourceDocumentId = "doc-parity";
    const foundation = buildSyntheticFoundation({
      packContentSha256: PACK_SHA(),
      documents: [
        {
          sourceDocumentId,
          pages: mockPages(sourceDocumentId, 1, "2024-03-01"),
          parsedModelJson: {
            ...planGoalDoc(sourceDocumentId, "doc.plan", "Read", "2024-03-01"),
            recordInstances: [
              {
                recordTypeId: "document_header",
                instanceIndex: 0,
                fields: [
                  fieldQuote("effective_date", "date", "2024-03-01", sourceDocumentId, 1, "2024-03-01"),
                  fieldQuote("document_date", "date", "2024-02-28", sourceDocumentId, 1, "2024-02-28"),
                  fieldQuote("title", "text", "Plan title", sourceDocumentId, 1, "Plan title"),
                ],
              },
            ],
          },
        },
      ],
    });
    const study = buildCanonicalStudy({
      pack: SYNTHETIC_PACK,
      packContentSha256: PACK_SHA(),
      foundation,
    });
    const customer = projectCanonicalStudyTimeline(study, { audience: "customer" });
    const pro = projectCanonicalStudyTimeline(study, { audience: "pro" });
    expect(customer.dated.map((e) => e.entryId)).toEqual(pro.dated.map((e) => e.entryId));
    expect(JSON.stringify(customer.dated.map((e) => e.eventEvidence))).toBe(
      JSON.stringify(pro.dated.map((e) => e.eventEvidence)),
    );
    expect(JSON.stringify(customer.dated.map((e) => e.dateEvidence))).toBe(
      JSON.stringify(pro.dated.map((e) => e.dateEvidence)),
    );
  });
});
