const NOTICE = "Notice of Action";

export const MEDICAID_RULEBOOK_SLOT_CATALOG = [
  { id: "notice.action", label: "Notice action", sourceDocTypes: [NOTICE] },
  { id: "notice.service", label: "Affected service", sourceDocTypes: [NOTICE] },
  { id: "notice.effectiveDate", label: "Effective date", sourceDocTypes: [NOTICE] },
  { id: "notice.reason", label: "Reason for action", sourceDocTypes: [NOTICE] },
  { id: "notice.ruleCited", label: "Rule cited", sourceDocTypes: [NOTICE] },
  { id: "notice.hearingDeadline", label: "Hearing deadline", sourceDocTypes: [NOTICE] },
  { id: "notice.hearingMethod", label: "How to request a hearing", sourceDocTypes: [NOTICE] },
  { id: "notice.date", label: "Notice date", sourceDocTypes: [NOTICE] },
  { id: "notice.mailedDate", label: "Mailed date", sourceDocTypes: [NOTICE] },
] as const;
