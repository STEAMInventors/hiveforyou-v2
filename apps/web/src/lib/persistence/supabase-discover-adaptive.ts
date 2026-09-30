import { withSessionOwner } from "@hiveforyou/core";
import type {
  DiscoverCustomerAnswerRepository,
  DiscoverQuestionRepository,
} from "@hiveforyou/core";
import type { CustomerDiscoveryAnswer, DiscoverQuestion } from "@hiveforyou/shared/discover";

import type { HiveGateway, HiveRow } from "./hive-gateway";

export class SupabaseDiscoverQuestionRepository implements DiscoverQuestionRepository {
  constructor(
    private readonly gateway: HiveGateway,
    private readonly userId: string,
  ) {}

  async saveQuestions(input: {
    discoverRunId: string;
    caseId: string;
    userId: string;
    questions: DiscoverQuestion[];
  }): Promise<void> {
    for (const question of input.questions) {
      await this.gateway.insert(
        "discover_questions",
        withSessionOwner(this.userId, {
          id: question.id,
          discover_run_id: input.discoverRunId,
          case_id: input.caseId,
          user_id: this.userId,
          question_json: question,
        }),
      );
    }
  }

  async listByDiscoverRunId(discoverRunId: string): Promise<DiscoverQuestion[]> {
    const rows = await this.gateway.selectWhere(
      "discover_questions",
      { discover_run_id: discoverRunId, user_id: this.userId },
      { limit: 100 },
    );
    return rows.map((row) => row.question_json as DiscoverQuestion);
  }
}

function mapAnswer(row: HiveRow): CustomerDiscoveryAnswer {
  return {
    questionId: String(row.question_id),
    evidenceKind: "CUSTOMER_ASSERTION",
    answer: row.answer_json as Record<string, unknown>,
    answeredAt: String(row.answered_at),
    userId: String(row.user_id),
    discoverRunId: String(row.discover_run_id),
    caseId: String(row.case_id),
    intakeRunId: row.intake_run_id ? String(row.intake_run_id) : null,
  };
}

export class SupabaseDiscoverCustomerAnswerRepository
  implements DiscoverCustomerAnswerRepository
{
  constructor(
    private readonly gateway: HiveGateway,
    private readonly userId: string,
  ) {}

  async appendAnswers(answers: CustomerDiscoveryAnswer[]): Promise<void> {
    for (const answer of answers) {
      await this.gateway.insert(
        "discover_customer_answers",
        withSessionOwner(this.userId, {
          discover_run_id: answer.discoverRunId,
          case_id: answer.caseId,
          user_id: this.userId,
          question_id: answer.questionId,
          evidence_kind: answer.evidenceKind,
          answer_json: answer.answer,
          intake_run_id: answer.intakeRunId ?? null,
          answered_at: answer.answeredAt,
        }),
      );
    }
  }

  async listByDiscoverRunId(discoverRunId: string): Promise<CustomerDiscoveryAnswer[]> {
    const rows = await this.gateway.selectWhere(
      "discover_customer_answers",
      { discover_run_id: discoverRunId, user_id: this.userId },
      { limit: 200 },
    );
    return rows.map(mapAnswer);
  }
}
