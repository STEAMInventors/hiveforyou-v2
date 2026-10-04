import { getDiscoverPackByDomainId } from "@hiveforyou/domain-packs";

import type {

  ProposedDocumentCategory,

  ProposedDomainGroup,

  ProposedLogicalDocument,

} from "@hiveforyou/shared/discover";



/** Pack id when the value is a known domain; otherwise the trimmed id. */

export function resolvedDomainId(domainId: string | null | undefined): string {

  if (typeof domainId !== "string") {

    return "";

  }

  const trimmed = domainId.trim();

  if (!trimmed) {

    return "";

  }

  return getDiscoverPackByDomainId(trimmed)?.domainId ?? trimmed;

}



function dedupeIds(ids: string[]): string[] {

  const seen = new Set<string>();

  const result: string[] = [];

  for (const id of ids) {

    if (seen.has(id)) {

      continue;

    }

    seen.add(id);

    result.push(id);

  }

  return result;

}



/** Build pack-category slices from logical document groupIds within one domain group. */

export function deriveDocumentCategoriesForDomainGroup(input: {

  domainId: string;

  logicalDocumentIds: string[];

  logicalDocuments: ProposedLogicalDocument[];

}): ProposedDocumentCategory[] {

  const domainKey = resolvedDomainId(input.domainId);

  const listed = new Set(input.logicalDocumentIds);

  const byGroupId = new Map<string, string[]>();



  for (const doc of input.logicalDocuments) {

    if (!listed.has(doc.id) || resolvedDomainId(doc.domainId) !== domainKey) {

      continue;

    }

    const groupId = doc.groupId.trim() || "uncategorized";

    const bucket = byGroupId.get(groupId) ?? [];

    bucket.push(doc.id);

    byGroupId.set(groupId, bucket);

  }



  const pack = getDiscoverPackByDomainId(domainKey);

  const orderedGroupIds = pack

    ? [

        ...pack.groups.map((group) => group.id),

        ...[...byGroupId.keys()].filter((id) => !pack.groups.some((group) => group.id === id)),

      ]

    : [...byGroupId.keys()];



  const seen = new Set<string>();

  const categories: ProposedDocumentCategory[] = [];

  for (const groupId of orderedGroupIds) {

    if (seen.has(groupId) || !byGroupId.has(groupId)) {

      continue;

    }

    seen.add(groupId);

    const packGroup = pack?.groups.find((group) => group.id === groupId);

    categories.push({

      id: groupId,

      logicalDocumentIds: dedupeIds(byGroupId.get(groupId)!),

      description: packGroup?.description ?? packGroup?.label ?? groupId,

    });

  }



  return categories;

}



export function enrichDomainGroupsWithCategories(

  domainGroups: ProposedDomainGroup[],

  logicalDocuments: ProposedLogicalDocument[],

): ProposedDomainGroup[] {

  return domainGroups.map((group) => ({

    ...group,

    documentCategories: deriveDocumentCategoriesForDomainGroup({

      domainId: group.domainId,

      logicalDocumentIds: group.logicalDocumentIds,

      logicalDocuments,

    }),

  }));

}


