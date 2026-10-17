import type {
  HiveSelectionIntent,
  OwnedHiveDetailResponse,
  OwnedHiveListResponse,
} from "@hiveforyou/shared/cases";

export class OwnedHivesFetchError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "OwnedHivesFetchError";
    this.code = code;
  }
}

async function readErrorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error?.trim() || "UNEXPECTED";
  } catch {
    return "UNEXPECTED";
  }
}

export async function fetchOwnedHives(): Promise<OwnedHiveListResponse> {
  const response = await fetch("/api/cases");
  if (!response.ok) {
    const code = await readErrorCode(response);
    throw new OwnedHivesFetchError(code, "Could not load your Hives.");
  }
  return (await response.json()) as OwnedHiveListResponse;
}

export async function fetchOwnedHive(caseId: string): Promise<OwnedHiveDetailResponse> {
  const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}`);
  if (!response.ok) {
    const code = await readErrorCode(response);
    throw new OwnedHivesFetchError(code, "Could not load this Hive.");
  }
  return (await response.json()) as OwnedHiveDetailResponse;
}

export type DocumentCommitOptions = {
  caseId: string;
  selectionIntent: HiveSelectionIntent;
};
