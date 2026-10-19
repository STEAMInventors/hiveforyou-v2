export type RoutingPath = 'explicit' | 'ad-hoc' | 'unknown';
export type SchemaSource = 'pinned_pack' | 'dynamic_generation' | 'generic_fallback';
export type ClarificationStatus = 'not_required' | 'pending' | 'resolved';

export interface InterpretedTask {
  operation: string;
  target_array?: string;
  filter_condition?: string;
  metadata?: Record<string, any>;
}

export interface StudyIntent {
  schemaVersion: 'hive.study-intent/1';
  selectedDomainId: string | null;
  resolvedSchemaId: string;
  schemaSource: SchemaSource;
  routingPath: RoutingPath;
  originalGoal: string | null;
  interpretedTask: InterpretedTask | null;
  clarificationStatus: ClarificationStatus;
}

export function createAdHocIntent(originalGoal: string | null): StudyIntent {
  return {
    schemaVersion: 'hive.study-intent/1',
    selectedDomainId: null,
    resolvedSchemaId: 'generic_fallback_v1',
    schemaSource: 'generic_fallback',
    routingPath: 'ad-hoc',
    originalGoal,
    interpretedTask: null,
    clarificationStatus: 'not_required',
  };
}