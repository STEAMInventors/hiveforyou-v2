import type { Party, Reference, Statement, Term, Thing } from "../../atoms/types";
import type { DocumentProfile } from "../../atoms/types";

export const SHADOW_WORK_STATE_SCHEMA_VERSION = 1 as const;

export type ShadowDocTier1State = {
  profile: DocumentProfile;
  statements: Statement[];
  parties: Party[];
  references: Reference[];
  terms: Term[];
  usage: { inputTokens: number; outputTokens: number };
};

export type ShadowDocWorkState = {
  sourceDocumentId: string;
  documentId: string;
  tier0Statements?: Statement[];
  things?: Thing[];
  tier1?: ShadowDocTier1State;
};

export type ShadowWorkState = {
  schemaVersion: typeof SHADOW_WORK_STATE_SCHEMA_VERSION;
  studyRunId: string;
  documents: ShadowDocWorkState[];
};

export function emptyShadowWorkState(studyRunId: string): ShadowWorkState {
  return {
    schemaVersion: SHADOW_WORK_STATE_SCHEMA_VERSION,
    studyRunId,
    documents: [],
  };
}

export function upsertShadowDocState(
  state: ShadowWorkState,
  doc: ShadowDocWorkState,
): ShadowWorkState {
  const rest = state.documents.filter((d) => d.sourceDocumentId !== doc.sourceDocumentId);
  return { ...state, documents: [...rest, doc] };
}

export function getShadowDocState(
  state: ShadowWorkState,
  sourceDocumentId: string,
): ShadowDocWorkState | undefined {
  return state.documents.find((d) => d.sourceDocumentId === sourceDocumentId);
}
