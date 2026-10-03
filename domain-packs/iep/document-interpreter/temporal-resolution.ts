import type { IepTemporalRole } from "./contracts";

/**
 * After identity classification, assign prior/current from document dates.
 * Does not use upload order, array order, or filename numbering.
 * Ported from NestIEP `resolveTemporalRoles` for IEP and eligibility plans.
 */

export type TemporalDocument = {
  id: string;
  family: string;
  subtype: string | null;
  documentDate: string | null;
  temporalRole: IepTemporalRole;
  documentStatus?: string;
};

function isoDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const iso = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function isDraft(doc: TemporalDocument): boolean {
  return doc.temporalRole === "draft" || doc.documentStatus === "draft";
}

function familyKey(doc: TemporalDocument): string {
  if (doc.family === "EVALUATION") {
    return `EVALUATION:${doc.subtype || "other_evaluation"}`;
  }
  return doc.family;
}

function assignLinearRoles(dated: TemporalDocument[]): Map<string, IepTemporalRole> {
  const roles = new Map<string, IepTemporalRole>();
  const sorted = [...dated].sort((a, b) => (a.documentDate ?? "").localeCompare(b.documentDate ?? ""));
  if (sorted.length === 1) {
    roles.set(sorted[0]!.id, "current");
    return roles;
  }
  sorted.forEach((doc, index) => {
    if (index === 0) {
      roles.set(doc.id, "prior");
    } else if (index === sorted.length - 1) {
      roles.set(doc.id, "current");
    } else {
      roles.set(doc.id, "intermediate");
    }
  });
  return roles;
}

export function resolveIepTemporalRoles(documents: TemporalDocument[]): TemporalDocument[] {
  const next = documents.map((doc) => ({ ...doc }));
  const groups = new Map<string, TemporalDocument[]>();
  for (const doc of next) {
    const key = familyKey(doc);
    const list = groups.get(key) ?? [];
    list.push(doc);
    groups.set(key, list);
  }

  for (const docs of groups.values()) {
    const family = docs[0]?.family;
    for (const doc of docs) {
      if (isDraft(doc)) {
        doc.temporalRole = "draft";
      }
    }
    const dated = docs.filter((doc) => isoDate(doc.documentDate) && !isDraft(doc));
    const undated = docs.filter((doc) => !isoDate(doc.documentDate) && !isDraft(doc));

    if (family === "PROGRESS" || family === "EVAL_PLAN") {
      for (const doc of dated) {
        doc.temporalRole = "sequence";
      }
      for (const doc of undated) {
        doc.temporalRole = "unknown";
      }
      continue;
    }

    const roles = assignLinearRoles(dated);
    for (const doc of dated) {
      doc.temporalRole = roles.get(doc.id) ?? "unknown";
    }
    for (const doc of undated) {
      doc.temporalRole = "unknown";
    }
  }

  return next;
}

export type IepPlanPick = {
  logicalDocumentId: string;
  sourceFilename: string;
  documentDate: string;
  temporalRole: "current" | "prior";
};

export function selectCurrentAndPriorIep(
  documents: Array<{
    logicalDocumentId: string;
    documentFamily: string;
    documentDate?: string | null;
    temporalRole?: string | null;
    sourceFilename?: string | null;
  }>,
): { current: IepPlanPick | null; prior: IepPlanPick | null } {
  const plans = documents.filter((doc) => doc.documentFamily === "IEP");
  const pick = (role: "current" | "prior"): IepPlanPick | null => {
    const doc = plans.find((row) => row.temporalRole === role && row.documentDate);
    if (!doc?.documentDate) {
      return null;
    }
    return {
      logicalDocumentId: doc.logicalDocumentId,
      sourceFilename: doc.sourceFilename ?? "",
      documentDate: doc.documentDate,
      temporalRole: role,
    };
  };
  return { current: pick("current"), prior: pick("prior") };
}
