export const CASE_CUSTOMER_CONTEXT_SOURCE = "CUSTOMER_ASSERTION" as const;

export type CaseCustomerContextSource = typeof CASE_CUSTOMER_CONTEXT_SOURCE;

export type CaseCustomerContextType =
  | "OBJECTIVE"
  | "SHARE_INTENT"
  | "INTENDED_AUDIENCE";

export type ShareIntentChoice = "yes" | "no" | "not_sure";

/**
 * Stable audience identity captured with the label and pack version that defined it.
 * `domainPackId` and `domainPackVersion` are null for the generic pre-resolution list.
 */
export type PersistedIntendedAudienceRole = {
  roleId: string;
  label: string;
  domainPackId: string | null;
  domainPackVersion: string | null;
};

export type CaseCustomerContextObjectiveValue = {
  text: string;
};

export type CaseCustomerContextShareIntentValue = {
  choice: ShareIntentChoice;
};

export type CaseCustomerContextIntendedAudienceValue = PersistedIntendedAudienceRole & {
  otherRoleText?: string;
};

/** Rows written before role id + label + pack version were stored together. */
export type LegacyCaseCustomerContextIntendedAudienceValue = {
  audience: string;
  otherRoleText?: string;
};

export type CaseCustomerContextValueJson =
  | CaseCustomerContextObjectiveValue
  | CaseCustomerContextShareIntentValue
  | CaseCustomerContextIntendedAudienceValue
  | LegacyCaseCustomerContextIntendedAudienceValue;

export type CaseCustomerContextRecord = {
  id: string;
  userId: string;
  caseId: string;
  domainId: string;
  contextType: CaseCustomerContextType;
  valueJson: CaseCustomerContextValueJson;
  source: CaseCustomerContextSource;
  createdAt: string;
  supersededAt: string | null;
};

/** One domain's confirmed intent. Only these values are CUSTOMER_ASSERTION. */
export type DomainCustomerContextIntake = {
  domainId: string;
  objective: string;
  shareIntent: ShareIntentChoice;
  /** Stable role id from the pack list, a model suggestion, or the generic fallback. */
  intendedAudienceRoleId?: string;
  intendedAudienceOtherRole?: string;
};

/** Intake payload from the objective modal — persisted as CUSTOMER_ASSERTION per domain. */
export type CaseCustomerContextIntake = {
  domains: DomainCustomerContextIntake[];
};

export type DomainCustomerContext = {
  domainId: string;
  objective: string;
  objectiveCapturedAt: string;
  shareIntent?: ShareIntentChoice;
  shareIntentCapturedAt?: string;
  intendedAudience?: PersistedIntendedAudienceRole;
  intendedAudienceOtherRole?: string;
  intendedAudienceCapturedAt?: string;
};

/**
 * Active customer assertions for a case.
 * One active value per caseId + domainId + contextType.
 * Audience and share intent never alter canonical facts.
 */
export type CaseCustomerContextSnapshot = {
  source: CaseCustomerContextSource;
  domains: DomainCustomerContext[];
};

/** Objective emphasis passed into Engine 2. Audience and share intent are omitted. */
export type Engine2DomainCustomerContext = {
  source: CaseCustomerContextSource;
  domainId: string;
  objective: string;
  objectiveCapturedAt: string;
};
