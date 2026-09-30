import { randomUUID } from "node:crypto";

import type { StudyRunEvent, StudyRunEventType } from "@hiveforyou/shared/canonical-study";

export interface StudyRunEventRepository {
  append(event: StudyRunEvent): Promise<void>;
  listByStudyRunId(studyRunId: string): Promise<StudyRunEvent[]>;
  listByCaseId(caseId: string): Promise<StudyRunEvent[]>;
}

export class InMemoryStudyRunEventRepository implements StudyRunEventRepository {
  private readonly events: StudyRunEvent[] = [];

  async append(event: StudyRunEvent): Promise<void> {
    this.events.push(structuredClone(event));
  }

  async listByStudyRunId(studyRunId: string): Promise<StudyRunEvent[]> {
    return this.events.filter((e) => e.studyRunId === studyRunId);
  }

  async listByCaseId(caseId: string): Promise<StudyRunEvent[]> {
    return this.events.filter((e) => e.caseId === caseId);
  }
}

export function createStudyRunEvent(
  type: StudyRunEventType,
  studyRunId: string,
  caseId: string,
  payload?: Record<string, unknown>,
): StudyRunEvent {
  return {
    id: randomUUID(),
    type,
    studyRunId,
    caseId,
    occurredAt: new Date().toISOString(),
    payload,
  };
}
