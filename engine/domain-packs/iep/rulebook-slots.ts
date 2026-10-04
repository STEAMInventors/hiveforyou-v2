const IEP = "Individualized Education Program";

/** Plan-page slots not yet listed in narrative templates. */
export const IEP_RULEBOOK_SLOT_CATALOG = [
  { id: "student.firstName", label: "Student first name", sourceDocTypes: [] },
  { id: "plan.year", label: "Plan year", sourceDocTypes: [IEP] },
  { id: "plan.start", label: "Plan start date", sourceDocTypes: [IEP] },
  { id: "plan.end", label: "Plan end date", sourceDocTypes: [IEP] },
  { id: "eligibility.date", label: "Eligibility determination date", sourceDocTypes: [] },
] as const;
