import type { ProposalDomainPack } from "@hiveforyou/domain-pack";
import type {
  CanonicalStudyFoundationDocumentOrder,
  CanonicalStudyFoundationGroupedRecord,
  CanonicalStudyFoundationUnresolvedItem,
  CanonicalStudyFoundationVerifiedField,
} from "@hiveforyou/shared/canonical-study-foundation";

import { parsePackFieldPath } from "./field-key.js";

export type OrderDocumentsInput = {
  pack: ProposalDomainPack;
  verifiedFields: readonly CanonicalStudyFoundationVerifiedField[];
  groupedRecords: CanonicalStudyFoundationGroupedRecord[];
  documentTypeBySourceId: Map<string, string | null>;
  allSourceDocumentIds: string[];
  trustedPagesSuppliedBySource?: ReadonlyMap<string, boolean>;
  matchedPageTermsBySource?: ReadonlyMap<string, readonly string[]>;
};

export type OrderDocumentsResult = {
  documents: CanonicalStudyFoundationDocumentOrder[];
  groupedRecords: CanonicalStudyFoundationGroupedRecord[];
  unresolvedItems: CanonicalStudyFoundationUnresolvedItem[];
};

function resolveParty(
  pack: ProposalDomainPack,
  authorRoleId: string | null,
): string | null {
  if (!authorRoleId) {
    return null;
  }
  const role = pack.authorRoles?.find((r) => r.id === authorRoleId);
  return role?.party ?? null;
}

function findVerifiedOrderingDate(
  verifiedFields: readonly CanonicalStudyFoundationVerifiedField[],
  sourceDocumentId: string,
  orderingDatePath: string,
): { iso: string | null; fieldPath: string | null } {
  const parsed = parsePackFieldPath(orderingDatePath);
  if (!parsed) {
    return { iso: null, fieldPath: null };
  }
  const match = verifiedFields.find(
    (field) =>
      field.sourceDocumentId === sourceDocumentId &&
      field.recordTypeId === parsed.recordTypeId &&
      field.fieldId === parsed.fieldId &&
      field.normalized.normalizedValue != null,
  );
  if (!match) {
    return { iso: null, fieldPath: orderingDatePath };
  }
  const normalized = match.normalized.normalizedValue;
  const iso = typeof normalized === "string" ? normalized : null;
  return { iso, fieldPath: orderingDatePath };
}

function resolveAmendmentLink(input: {
  pack: ProposalDomainPack;
  sourceDocumentId: string;
  documentTypeId: string | null;
  verifiedFields: readonly CanonicalStudyFoundationVerifiedField[];
  allSourceDocumentIds: string[];
  documentTypeBySourceId: Map<string, string | null>;
}): Pick<
  CanonicalStudyFoundationDocumentOrder,
  "amendsDocumentTypeId" | "amendmentLinkStatus" | "amendmentTargetSourceDocumentId"
> {
  if (!input.documentTypeId) {
    return {
      amendsDocumentTypeId: null,
      amendmentLinkStatus: "not_applicable",
      amendmentTargetSourceDocumentId: null,
    };
  }
  const typeSpec = input.pack.documentTypes.find((d) => d.id === input.documentTypeId);
  if (!typeSpec?.amends) {
    return {
      amendsDocumentTypeId: null,
      amendmentLinkStatus: "not_applicable",
      amendmentTargetSourceDocumentId: null,
    };
  }

  const targetPlanDateField = input.verifiedFields.find(
    (field) =>
      field.sourceDocumentId === input.sourceDocumentId &&
      field.recordTypeId === "amendment_change" &&
      field.fieldId === "target_plan_date" &&
      typeof field.normalized.normalizedValue === "string",
  );
  const targetDate = targetPlanDateField?.normalized.normalizedValue as string | undefined;

  if (!targetDate) {
    return {
      amendsDocumentTypeId: typeSpec.amends,
      amendmentLinkStatus: "unresolved",
      amendmentTargetSourceDocumentId: null,
    };
  }

  const candidateTargets = input.allSourceDocumentIds.filter((id) => {
    if (id === input.sourceDocumentId) {
      return false;
    }
    const otherType = input.documentTypeBySourceId.get(id);
    return otherType === typeSpec.amends;
  });

  for (const candidateId of candidateTargets) {
    const otherType = input.pack.documentTypes.find(
      (d) => d.id === input.documentTypeBySourceId.get(candidateId),
    );
    if (!otherType?.orderingDate) {
      continue;
    }
    const otherDate = findVerifiedOrderingDate(
      input.verifiedFields,
      candidateId,
      otherType.orderingDate,
    );
    if (otherDate.iso === targetDate) {
      return {
        amendsDocumentTypeId: typeSpec.amends,
        amendmentLinkStatus: "linked",
        amendmentTargetSourceDocumentId: candidateId,
      };
    }
  }

  return {
    amendsDocumentTypeId: typeSpec.amends,
    amendmentLinkStatus: "unresolved",
    amendmentTargetSourceDocumentId: null,
  };
}

export function orderDocumentsAndRecords(input: OrderDocumentsInput): OrderDocumentsResult {
  const unresolvedItems: CanonicalStudyFoundationUnresolvedItem[] = [];
  const sourceDocumentIds = [...new Set(input.allSourceDocumentIds)].sort((a, b) =>
    a.localeCompare(b),
  );

  const documents: CanonicalStudyFoundationDocumentOrder[] = sourceDocumentIds.map(
    (sourceDocumentId) => {
      const documentTypeId = input.documentTypeBySourceId.get(sourceDocumentId) ?? null;
      const typeSpec = documentTypeId
        ? input.pack.documentTypes.find((d) => d.id === documentTypeId)
        : null;
      const orderingPath = typeSpec?.orderingDate ?? null;
      const ordering =
        orderingPath != null
          ? findVerifiedOrderingDate(input.verifiedFields, sourceDocumentId, orderingPath)
          : { iso: null, fieldPath: null };

      if (orderingPath && !ordering.iso) {
        unresolvedItems.push({
          id: `missing-ordering-date:${sourceDocumentId}`,
          kind: "missing_ordering_date",
          message: `Verified ordering date missing for document ${sourceDocumentId} at ${orderingPath}.`,
          sourceDocumentId,
        });
      }

      const amendment = resolveAmendmentLink({
        pack: input.pack,
        sourceDocumentId,
        documentTypeId,
        verifiedFields: input.verifiedFields,
        allSourceDocumentIds: sourceDocumentIds,
        documentTypeBySourceId: input.documentTypeBySourceId,
      });

      if (amendment.amendmentLinkStatus === "unresolved") {
        unresolvedItems.push({
          id: `amendment-link:${sourceDocumentId}`,
          kind: "amendment_link_unresolved",
          message: `Amendment link unresolved for document ${sourceDocumentId}.`,
          sourceDocumentId,
        });
      }

      return {
        sourceDocumentId,
        documentTypeId,
        authorRoleId: typeSpec?.authorRole ?? null,
        party: resolveParty(input.pack, typeSpec?.authorRole ?? null),
        verifiedOrderingDate: ordering.iso,
        orderingDateFieldPath: ordering.fieldPath,
        sortRank: 0,
        trustedPagesSupplied: input.trustedPagesSuppliedBySource?.get(sourceDocumentId) ?? false,
        matchedPageTerms: [...(input.matchedPageTermsBySource?.get(sourceDocumentId) ?? [])].sort((a, b) =>
          a.localeCompare(b),
        ),
        ...amendment,
      };
    },
  );

  documents.sort((a, b) => {
    if (a.verifiedOrderingDate && b.verifiedOrderingDate) {
      const dateCmp = a.verifiedOrderingDate.localeCompare(b.verifiedOrderingDate);
      if (dateCmp !== 0) {
        return dateCmp;
      }
    } else if (a.verifiedOrderingDate) {
      return -1;
    } else if (b.verifiedOrderingDate) {
      return 1;
    }
    return a.sourceDocumentId.localeCompare(b.sourceDocumentId);
  });

  documents.forEach((doc, index) => {
    doc.sortRank = index;
  });

  const groupedRecords = [...input.groupedRecords].sort((a, b) => {
    const docA = documents.find((d) => d.sourceDocumentId === a.sourceDocumentId);
    const docB = documents.find((d) => d.sourceDocumentId === b.sourceDocumentId);
    const rankA = docA?.sortRank ?? Number.MAX_SAFE_INTEGER;
    const rankB = docB?.sortRank ?? Number.MAX_SAFE_INTEGER;
    return (
      rankA - rankB ||
      a.recordTypeId.localeCompare(b.recordTypeId) ||
      a.instanceIndex - b.instanceIndex
    );
  });

  unresolvedItems.sort((a, b) => a.id.localeCompare(b.id));

  return { documents, groupedRecords, unresolvedItems };
}
