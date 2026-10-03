import { describe, expect, it } from "vitest";

import { CASE_VIEW_V2_SCHEMA } from "@hiveforyou/shared/projections";

import { buildTimelineDisplay } from "./timeline-display";

describe("buildTimelineDisplay", () => {
  it("builds one entry per dated document", () => {
    const caseView = {
      schemaVersion: CASE_VIEW_V2_SCHEMA,
      documents: [
        {
          logicalDocumentId: "ld-a",
          sourceDocumentId: "s-a",
          fileName: "01 prior iep.pdf",
          documentType: "IEP",
          documentDate: "2023-10-24",
          pageStart: 1,
          pageEnd: 3,
          readStatus: "read" as const,
        },
        {
          logicalDocumentId: "ld-b",
          sourceDocumentId: "s-b",
          fileName: "02 progress.pdf",
          documentType: "Progress Report",
          documentDate: "2024-10-15",
          pageStart: 1,
          pageEnd: 1,
          readStatus: "read" as const,
        },
      ],
      items: [],
    } as unknown as import("@hiveforyou/shared/projections").CaseViewV2;

    const { entries } = buildTimelineDisplay({
      caseView,
      timeline: { coverage: { segments: [] }, groups: [], events: [] },
      provenance: null,
    });
    const docs = entries.filter((e) => e.kind === "document");
    expect(docs).toHaveLength(2);
    expect(docs[0]?.kind === "document" && docs[0].title).toMatch(/2023 IEP/i);
  });

  it("charts only oral_reading_fluency observations, not goal baselines or probe counts", () => {
    const caseView = {
      schemaVersion: CASE_VIEW_V2_SCHEMA,
      documents: [
        {
          logicalDocumentId: "ld-iep",
          sourceDocumentId: "s-iep",
          fileName: "02 Prior IEP 2023.pdf",
          documentType: "IEP",
          documentDate: "2023-10-24",
          pageStart: 1,
          pageEnd: 10,
          readStatus: "read" as const,
        },
        {
          logicalDocumentId: "ld-progress",
          sourceDocumentId: "s-progress",
          fileName: "03 Progress report.pdf",
          documentType: "Progress Report",
          documentDate: "2024-10-15",
          pageStart: 1,
          pageEnd: 1,
          readStatus: "read" as const,
        },
      ],
      items: [
        {
          itemId: "goal-changed",
          state: "changed",
          label: "Reading fluency goal",
          inFocus: true,
          priority: 1,
          construct: { measure: "annual_goal_target|reading|-", task: "reading", administration: null, key: "" },
          subjectEntityId: "student",
          series: [
            {
              claimId: "c-baseline",
              anchorDate: "2023-10-24",
              value: { kind: "quantity", display: "62", numberValue: 62, unit: "WCPM", textValue: null, codeValue: null, booleanValue: null, entityId: null, dateValue: null, periodStart: null, periodEnd: null },
              modality: "planned",
              chips: [{ evidenceId: "e1", sourceDocumentId: "s-iep", logicalDocumentId: "ld-iep", fileName: "iep.pdf", page: 1, extractionId: null, quote: "" }],
            },
            {
              claimId: "c-target",
              anchorDate: "2023-10-24",
              value: { kind: "quantity", display: "95", numberValue: 95, unit: "WCPM", textValue: null, codeValue: null, booleanValue: null, entityId: null, dateValue: null, periodStart: null, periodEnd: null },
              modality: "planned",
              chips: [{ evidenceId: "e2", sourceDocumentId: "s-iep", logicalDocumentId: "ld-iep", fileName: "iep.pdf", page: 6, extractionId: null, quote: "" }],
            },
            {
              claimId: "c-probes",
              anchorDate: "2023-10-24",
              value: { kind: "quantity", display: "3", numberValue: 3, unit: "probes", textValue: null, codeValue: null, booleanValue: null, entityId: null, dateValue: null, periodStart: null, periodEnd: null },
              modality: "planned",
              chips: [{ evidenceId: "e3", sourceDocumentId: "s-iep", logicalDocumentId: "ld-iep", fileName: "iep.pdf", page: 6, extractionId: null, quote: "" }],
            },
          ],
        },
        {
          itemId: "orf-1",
          state: "established",
          label: "Oral reading fluency",
          inFocus: false,
          priority: 2,
          claimId: "c-wcpm-1",
          subjectEntityId: "student",
          construct: { measure: "oral_reading_fluency|reading|-", task: "reading", administration: null, key: "" },
          value: { kind: "quantity", display: "91", numberValue: 91, unit: "WCPM", textValue: null, codeValue: null, booleanValue: null, entityId: null, dateValue: null, periodStart: null, periodEnd: null },
          modality: "observed",
          occurredOn: "2024-02-01",
          effectivePeriod: null,
          chips: [{ evidenceId: "e4", sourceDocumentId: "s-progress", logicalDocumentId: "ld-progress", fileName: "progress.pdf", page: 1, extractionId: null, quote: "" }],
        },
        {
          itemId: "orf-2",
          state: "established",
          label: "Oral reading fluency",
          inFocus: false,
          priority: 3,
          claimId: "c-wcpm-2",
          subjectEntityId: "student",
          construct: { measure: "oral_reading_fluency|reading|-", task: "reading", administration: null, key: "" },
          value: { kind: "quantity", display: "104", numberValue: 104, unit: "WCPM", textValue: null, codeValue: null, booleanValue: null, entityId: null, dateValue: null, periodStart: null, periodEnd: null },
          modality: "observed",
          occurredOn: "2025-09-15",
          effectivePeriod: null,
          chips: [{ evidenceId: "e5", sourceDocumentId: "s-progress", logicalDocumentId: "ld-progress", fileName: "progress.pdf", page: 2, extractionId: null, quote: "" }],
        },
        {
          itemId: "target-est",
          state: "established",
          label: "Annual goal target",
          inFocus: false,
          priority: 4,
          claimId: "c-target-est",
          subjectEntityId: "student",
          construct: { measure: "annual_goal_target|reading|-", task: "reading", administration: null, key: "" },
          value: { kind: "quantity", display: "95", numberValue: 95, unit: "WCPM", textValue: null, codeValue: null, booleanValue: null, entityId: null, dateValue: null, periodStart: null, periodEnd: null },
          modality: "planned",
          occurredOn: "2023-10-24",
          effectivePeriod: null,
          chips: [{ evidenceId: "e6", sourceDocumentId: "s-iep", logicalDocumentId: "ld-iep", fileName: "iep.pdf", page: 6, extractionId: null, quote: "" }],
        },
      ],
    } as unknown as import("@hiveforyou/shared/projections").CaseViewV2;

    const { fluency } = buildTimelineDisplay({
      caseView,
      timeline: { coverage: { segments: [] }, groups: [], events: [] },
      provenance: null,
    });

    expect(fluency).not.toBeNull();
    expect(fluency!.points.map((p) => p.value)).toEqual([91, 104]);
    expect(fluency!.targetValue).toBe(95);
  });
});
