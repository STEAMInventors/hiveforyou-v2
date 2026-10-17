export type HiveSelectionIntent = "new" | "existing";

export type OwnedHiveSummary = {
  caseId: string;
  domainId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OwnedHiveListResponse = {
  cases: OwnedHiveSummary[];
};

export type OwnedHiveDetailResponse = OwnedHiveSummary;