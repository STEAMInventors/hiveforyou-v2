import type {
  CanonicalStudyReportClaimRef,
  CanonicalStudyReportCustomerBody,
  CanonicalStudyReportFactLine,
  CanonicalStudyReportProjection,
} from "@hiveforyou/shared/canonical-study-report-projection";

function customerBody(projection: CanonicalStudyReportProjection): CanonicalStudyReportCustomerBody | null {
  return projection.audience === "customer" ? projection.body : null;
}

export function resolveFactLineByClaimRef(
  projection: CanonicalStudyReportProjection,
  claimRef: CanonicalStudyReportClaimRef,
): CanonicalStudyReportFactLine | null {
  if (projection.audience === "pro") {
    return (
      projection.body.entityLedger.find((row) => row.claimRef.fieldKey === claimRef.fieldKey) ??
      null
    );
  }

  const body = customerBody(projection);
  if (!body) {
    return null;
  }
  for (const section of body.storySections) {
    const match = section.facts.find((fact) => fact.claimRef.fieldKey === claimRef.fieldKey);
    if (match) {
      return match;
    }
  }
  const important = body.importantFacts.find(
    (fact) => fact.claimRef.fieldKey === claimRef.fieldKey,
  );
  if (important) {
    return important;
  }
  for (const change of body.changes) {
    if (change.left.claimRef.fieldKey === claimRef.fieldKey) {
      return change.left;
    }
    if (change.right.claimRef.fieldKey === claimRef.fieldKey) {
      return change.right;
    }
  }
  for (const support of body.supports) {
    if (support.left.claimRef.fieldKey === claimRef.fieldKey) {
      return support.left;
    }
    if (support.right.claimRef.fieldKey === claimRef.fieldKey) {
      return support.right;
    }
  }
  return null;
}

export function resolveStorySection(
  projection: CanonicalStudyReportProjection,
  sectionId: string,
) {
  const body = customerBody(projection);
  if (!body) {
    return null;
  }
  if (sectionId === "__important_facts__") {
    return {
      id: sectionId,
      title: "Important facts",
      facts: body.importantFacts,
      sortRank: -1,
      sourceDocumentId: "",
      documentTypeId: null,
      orderingDate: null,
    };
  }
  return body.storySections.find((section) => section.id === sectionId) ?? null;
}

export function resolveChangeByRelationId(
  projection: CanonicalStudyReportProjection,
  relationId: string,
) {
  const body = customerBody(projection);
  if (!body) {
    return null;
  }
  return body.changes.find((change) => change.relationId === relationId) ?? null;
}

export function resolveSupportByRelationId(
  projection: CanonicalStudyReportProjection,
  relationId: string,
) {
  const body = customerBody(projection);
  if (!body) {
    return null;
  }
  return body.supports.find((row) => row.relationId === relationId) ?? null;
}

export function resolveOpenQuestions(
  projection: CanonicalStudyReportProjection,
  questionIds: string[],
) {
  const body = customerBody(projection);
  if (!body) {
    return [];
  }
  const byId = new Map(body.openQuestions.map((question) => [question.id, question]));
  return questionIds.map((id) => byId.get(id)).filter((item) => item != null);
}

export function resolveTimelineSections(
  projection: CanonicalStudyReportProjection,
  storySectionIds: string[],
) {
  const body = customerBody(projection);
  if (!body) {
    return [];
  }
  const byId = new Map(body.storySections.map((section) => [section.id, section]));
  return storySectionIds.map((id) => byId.get(id)).filter((item) => item != null);
}

export function resolveMeasurementSeries(
  projection: CanonicalStudyReportProjection,
  seriesId: string,
) {
  if (projection.audience !== "pro") {
    return null;
  }
  return projection.body.measurementSeries.find((row) => row.id === seriesId) ?? null;
}

export function resolveProQuotation(
  projection: CanonicalStudyReportProjection,
  fieldKey: string,
) {
  if (projection.audience !== "pro") {
    return null;
  }
  return (
    projection.body.quotations.find((quote) => quote.claimRef.fieldKey === fieldKey) ?? null
  );
}

export function resolveProRelation(
  projection: CanonicalStudyReportProjection,
  relationId: string,
) {
  if (projection.audience !== "pro") {
    return null;
  }
  return projection.body.relations.find((row) => row.id === relationId) ?? null;
}

export function resolveProOperativeView(
  projection: CanonicalStudyReportProjection,
  viewId: string,
) {
  if (projection.audience !== "pro") {
    return null;
  }
  return projection.body.operativeViews.find((view) => view.id === viewId) ?? null;
}

export function resolveProRequirement(
  projection: CanonicalStudyReportProjection,
  requirementId: string,
) {
  if (projection.audience !== "pro") {
    return null;
  }
  return projection.body.requirements.find((row) => row.id === requirementId) ?? null;
}

export function resolveProFlag(projection: CanonicalStudyReportProjection, flagId: string) {
  if (projection.audience !== "pro") {
    return null;
  }
  return projection.body.flags.find((row) => row.id === flagId) ?? null;
}

export function resolveProExportTable(
  projection: CanonicalStudyReportProjection,
  tableIndex: number,
) {
  if (projection.audience !== "pro") {
    return null;
  }
  return projection.body.exportTables[tableIndex] ?? null;
}
