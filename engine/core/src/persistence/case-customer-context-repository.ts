import { randomUUID } from "node:crypto";

import type { AudienceRoleResolutionInput } from "@hiveforyou/domain-packs";
import { findSharingAudienceRole } from "@hiveforyou/domain-packs";
import { getDiscoverPackByDomainId } from "@hiveforyou/domain-packs";
import type {
  CaseCustomerContextIntake,
  CaseCustomerContextIntendedAudienceValue,
  CaseCustomerContextRecord,
  CaseCustomerContextSnapshot,
  CaseCustomerContextType,
  CaseCustomerContextValueJson,
  DomainCustomerContext,
  DomainCustomerContextIntake,
  Engine2DomainCustomerContext,
  PersistedIntendedAudienceRole,
} from "@hiveforyou/shared/case-customer-context";
import { CASE_CUSTOMER_CONTEXT_SOURCE } from "@hiveforyou/shared/case-customer-context";
import type { ProposedSuggestedAudience } from "@hiveforyou/shared/discover";

import { normalizeIntendedAudienceForPersistence } from "./normalize-intended-audience-for-persistence";

export interface CaseCustomerContextRepository {
  getActiveByCaseAndType(
    caseId: string,
    contextType: CaseCustomerContextType,
    domainId: string,
  ): Promise<CaseCustomerContextRecord | null>;

  listActiveByCase(caseId: string): Promise<CaseCustomerContextRecord[]>;

  /** Supersedes prior active row for the type, then inserts the new value. */
  supersedeAndInsert(input: {
    userId: string;
    caseId: string;
    domainId: string;
    contextType: CaseCustomerContextType;
    valueJson: CaseCustomerContextValueJson;
    now?: string;
  }): Promise<CaseCustomerContextRecord>;

  /** Marks the active row superseded when present; no-op if none. */
  supersedeActive(input: {
    userId: string;
    caseId: string;
    domainId: string;
    contextType: CaseCustomerContextType;
    now?: string;
  }): Promise<void>;
}

export class InMemoryCaseCustomerContextRepository implements CaseCustomerContextRepository {
  private readonly rows: CaseCustomerContextRecord[] = [];

  async getActiveByCaseAndType(
    caseId: string,
    contextType: CaseCustomerContextType,
    domainId: string,
  ): Promise<CaseCustomerContextRecord | null> {
    return (
      this.rows.find(
        (row) =>
          row.caseId === caseId &&
          row.domainId === domainId &&
          row.contextType === contextType &&
          row.supersededAt === null,
      ) ?? null
    );
  }

  async listActiveByCase(caseId: string): Promise<CaseCustomerContextRecord[]> {
    return this.rows.filter(
      (row) => row.caseId === caseId && row.supersededAt === null,
    );
  }

  async supersedeActive(input: {
    userId: string;
    caseId: string;
    domainId: string;
    contextType: CaseCustomerContextType;
    now?: string;
  }): Promise<void> {
    const now = input.now ?? new Date().toISOString();
    for (const row of this.rows) {
      if (
        row.userId === input.userId &&
        row.caseId === input.caseId &&
        row.domainId === input.domainId &&
        row.contextType === input.contextType &&
        row.supersededAt === null
      ) {
        row.supersededAt = now;
      }
    }
  }

  async supersedeAndInsert(input: {
    userId: string;
    caseId: string;
    domainId: string;
    contextType: CaseCustomerContextType;
    valueJson: CaseCustomerContextValueJson;
    now?: string;
  }): Promise<CaseCustomerContextRecord> {
    const now = input.now ?? new Date().toISOString();
    await this.supersedeActive({
      userId: input.userId,
      caseId: input.caseId,
      domainId: input.domainId,
      contextType: input.contextType,
      now,
    });
    const record: CaseCustomerContextRecord = {
      id: randomUUID(),
      userId: input.userId,
      caseId: input.caseId,
      domainId: input.domainId,
      contextType: input.contextType,
      valueJson: input.valueJson,
      source: CASE_CUSTOMER_CONTEXT_SOURCE,
      createdAt: now,
      supersededAt: null,
    };
    this.rows.push(record);
    return record;
  }
}

export function readObjectiveTextFromContextRecord(
  record: CaseCustomerContextRecord | null,
): string | null {
  if (!record || record.contextType !== "OBJECTIVE") {
    return null;
  }
  const text = (record.valueJson as { text?: unknown }).text;
  return typeof text === "string" && text.trim().length > 0 ? text.trim() : null;
}

export function buildCaseCustomerContextSnapshot(
  activeRows: CaseCustomerContextRecord[],
): CaseCustomerContextSnapshot | null {
  const domainIds: string[] = [];
  for (const row of activeRows) {
    if (row.contextType === "OBJECTIVE" && !domainIds.includes(row.domainId)) {
      domainIds.push(row.domainId);
    }
  }
  const domains: DomainCustomerContext[] = [];
  for (const domainId of domainIds) {
    const rows = activeRows.filter((row) => row.domainId === domainId);
    const objective = rows.find((row) => row.contextType === "OBJECTIVE");
    const objectiveText = readObjectiveTextFromContextRecord(objective ?? null);
    if (!objective || !objectiveText) {
      continue;
    }
    const share = rows.find((row) => row.contextType === "SHARE_INTENT");
    const audience = rows.find((row) => row.contextType === "INTENDED_AUDIENCE");
    const shareChoice = (share?.valueJson as { choice?: unknown } | undefined)?.choice;
    const audienceRole = readPersistedAudienceRole(audience?.valueJson);
    domains.push({
      domainId,
      objective: objectiveText,
      objectiveCapturedAt: objective.createdAt,
      shareIntent:
        shareChoice === "yes" || shareChoice === "no" || shareChoice === "not_sure"
          ? shareChoice
          : undefined,
      shareIntentCapturedAt: share?.createdAt,
      intendedAudience: audienceRole?.role,
      intendedAudienceOtherRole: audienceRole?.otherRoleText,
      intendedAudienceCapturedAt: audience?.createdAt,
    });
  }
  if (!domains.length) {
    return null;
  }
  return {
    source: CASE_CUSTOMER_CONTEXT_SOURCE,
    domains,
  };
}

export function customerContextForEngine2(
  snapshot: CaseCustomerContextSnapshot | null | undefined,
  domainId: string,
): Engine2DomainCustomerContext | undefined {
  const domain = snapshot?.domains.find((item) => item.domainId === domainId);
  if (!snapshot || !domain) {
    return undefined;
  }
  return {
    source: snapshot.source,
    domainId: domain.domainId,
    objective: domain.objective,
    objectiveCapturedAt: domain.objectiveCapturedAt,
  };
}

const LEGACY_AUDIENCE_LABELS: Record<string, string> = {
  school_team: "School/team",
  advocate: "Advocate",
  attorney: "Attorney",
  healthcare_professional: "Healthcare professional",
  other: "Other",
};

function readPersistedAudienceRole(value: unknown): {
  role: PersistedIntendedAudienceRole;
  otherRoleText?: string;
} | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const otherRoleText =
    typeof record.otherRoleText === "string" && record.otherRoleText.trim().length > 0
      ? record.otherRoleText.trim()
      : undefined;
  if (typeof record.roleId === "string" && record.roleId.trim().length > 0) {
    const roleId = record.roleId.trim();
    const label =
      typeof record.label === "string" && record.label.trim().length > 0
        ? record.label.trim()
        : roleId;
    return {
      role: {
        roleId,
        label,
        domainPackId: nullableText(record.domainPackId),
        domainPackVersion: nullableText(record.domainPackVersion),
      },
      otherRoleText,
    };
  }
  if (typeof record.audience === "string" && record.audience.trim().length > 0) {
    const roleId = record.audience.trim();
    return {
      role: {
        roleId,
        label: LEGACY_AUDIENCE_LABELS[roleId] ?? roleId,
        domainPackId: null,
        domainPackVersion: null,
      },
      otherRoleText,
    };
  }
  return null;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function audienceValueFromIntake(
  intake: DomainCustomerContextIntake,
  resolution: AudienceRoleResolutionInput,
): CaseCustomerContextIntendedAudienceValue {
  const roleId = intake.intendedAudienceRoleId?.trim();
  if (!roleId) {
    throw new Error("INTENDED_AUDIENCE_REQUIRED");
  }
  const option = findSharingAudienceRole(resolution, roleId);
  if (!option) {
    throw new Error("INTENDED_AUDIENCE_UNKNOWN_ROLE");
  }
  if (option.allowsFreeText) {
    const otherRoleText = intake.intendedAudienceOtherRole?.trim();
    if (!otherRoleText) {
      throw new Error("INTENDED_AUDIENCE_OTHER_TEXT_REQUIRED");
    }
    return {
      roleId: option.roleId,
      label: option.label,
      domainPackId: option.domainPackId,
      domainPackVersion: option.domainPackVersion,
      otherRoleText,
    };
  }
  return {
    roleId: option.roleId,
    label: option.label,
    domainPackId: option.domainPackId,
    domainPackVersion: option.domainPackVersion,
  };
}

export async function persistCaseCustomerContextIntake(
  repo: CaseCustomerContextRepository,
  input: {
    userId: string;
    caseId: string;
    intake: CaseCustomerContextIntake;
    /** Call #1 model suggestions per domain — used to map suggestion ids to pack role ids. */
    suggestionsByDomainId?: Record<string, ProposedSuggestedAudience[]>;
  },
): Promise<CaseCustomerContextSnapshot> {
  if (!input.intake.domains.length) {
    throw new Error("OBJECTIVE_REQUIRED");
  }

  for (const domainIntake of input.intake.domains) {
    const domainId = domainIntake.domainId.trim();
    const objectiveText = domainIntake.objective.trim();
    if (!domainId || !objectiveText) {
      throw new Error("OBJECTIVE_REQUIRED");
    }
    const pack = getDiscoverPackByDomainId(domainId);
    const audienceResolution: AudienceRoleResolutionInput = {
      domainResolved: Boolean(pack),
      domainId,
      domainLabel: pack?.domainLabel,
    };

    await repo.supersedeAndInsert({
      userId: input.userId,
      caseId: input.caseId,
      domainId,
      contextType: "OBJECTIVE",
      valueJson: { text: objectiveText },
    });

    await repo.supersedeAndInsert({
      userId: input.userId,
      caseId: input.caseId,
      domainId,
      contextType: "SHARE_INTENT",
      valueJson: { choice: domainIntake.shareIntent },
    });

    if (domainIntake.shareIntent === "yes") {
      const audienceFields = normalizeIntendedAudienceForPersistence(
        { ...domainIntake, domainId, objective: objectiveText },
        audienceResolution,
        input.suggestionsByDomainId?.[domainId],
      );
      const valueJson = audienceValueFromIntake(
        { ...domainIntake, domainId, objective: objectiveText, ...audienceFields },
        audienceResolution,
      );
      await repo.supersedeAndInsert({
        userId: input.userId,
        caseId: input.caseId,
        domainId,
        contextType: "INTENDED_AUDIENCE",
        valueJson,
      });
    } else {
      await repo.supersedeActive({
        userId: input.userId,
        caseId: input.caseId,
        domainId,
        contextType: "INTENDED_AUDIENCE",
      });
    }
  }

  const active = await repo.listActiveByCase(input.caseId);
  const snapshot = buildCaseCustomerContextSnapshot(active);
  if (!snapshot) {
    throw new Error("OBJECTIVE_PERSISTENCE_FAILED");
  }
  return snapshot;
}

export async function loadCaseCustomerContextSnapshot(
  repo: CaseCustomerContextRepository,
  caseId: string,
): Promise<CaseCustomerContextSnapshot | null> {
  const active = await repo.listActiveByCase(caseId);
  return buildCaseCustomerContextSnapshot(active);
}
