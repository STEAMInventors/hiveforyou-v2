export const CUSTOMER_VIEW_SCHEMA = "customer-view/1" as const;

export type CustomerViewNarrativeSentence = {
  text: string;
  claimIds: string[];
};

export type CustomerViewBlock =
  | { kind: "narrative"; sentences: CustomerViewNarrativeSentence[] }
  | { kind: "claim_list"; claimIds: string[] }
  | { kind: "timeline"; eventIds: string[] }
  | { kind: "conflict"; conflictId: string }
  | { kind: "gap"; missingnessId: string };

export type CustomerViewSection = {
  id: string;
  title: string;
  blocks: CustomerViewBlock[];
};

export type CustomerView = {
  schemaVersion: typeof CUSTOMER_VIEW_SCHEMA;
  caseId: string;
  intelligenceVersion: number;
  domainIds: string[];
  /** Customer objective echo — labeled non-evidence in UI. */
  objectiveEcho?: string;
  sections: CustomerViewSection[];
};
