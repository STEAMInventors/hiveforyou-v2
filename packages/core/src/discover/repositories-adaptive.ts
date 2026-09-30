import type { CustomerDiscoveryAnswer, DiscoverQuestion } from "@hiveforyou/shared/discover";

export interface DiscoverQuestionRepository {
  saveQuestions(input: {
    discoverRunId: string;
    caseId: string;
    userId: string;
    questions: DiscoverQuestion[];
  }): Promise<void>;
  listByDiscoverRunId(discoverRunId: string): Promise<DiscoverQuestion[]>;
}

export class InMemoryDiscoverQuestionRepository implements DiscoverQuestionRepository {
  private readonly byRun = new Map<string, DiscoverQuestion[]>();

  async saveQuestions(input: {
    discoverRunId: string;
    caseId: string;
    userId: string;
    questions: DiscoverQuestion[];
  }): Promise<void> {
    void input.caseId;
    void input.userId;
    const existing = this.byRun.get(input.discoverRunId) ?? [];
    this.byRun.set(input.discoverRunId, [
      ...structuredClone(existing),
      ...structuredClone(input.questions),
    ]);
  }

  async listByDiscoverRunId(discoverRunId: string): Promise<DiscoverQuestion[]> {
    return structuredClone(this.byRun.get(discoverRunId) ?? []);
  }
}

export interface DiscoverCustomerAnswerRepository {
  appendAnswers(answers: CustomerDiscoveryAnswer[]): Promise<void>;
  listByDiscoverRunId(discoverRunId: string): Promise<CustomerDiscoveryAnswer[]>;
}

export class InMemoryDiscoverCustomerAnswerRepository
  implements DiscoverCustomerAnswerRepository
{
  private readonly byRun = new Map<string, CustomerDiscoveryAnswer[]>();

  async appendAnswers(answers: CustomerDiscoveryAnswer[]): Promise<void> {
    for (const answer of answers) {
      const list = this.byRun.get(answer.discoverRunId) ?? [];
      list.push(structuredClone(answer));
      this.byRun.set(answer.discoverRunId, list);
    }
  }

  async listByDiscoverRunId(discoverRunId: string): Promise<CustomerDiscoveryAnswer[]> {
    return structuredClone(this.byRun.get(discoverRunId) ?? []);
  }
}
