import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import type { CaseView, ClientSummary, ClientSummaryItem } from "@hiveforyou/shared/projections";

import type { CallModel } from "../model/call-model";

import { loadBundledPromptContent } from "../prompts/load-prompt-content";

const PROMPT = loadBundledPromptContent("client-summary/client-summary-v1.md");

export const CLIENT_SUMMARY_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          sourceItemId: { type: "string" },
          text: { type: "string" },
          worthAsking: { type: "string" },
        },
        required: ["sourceItemId", "text", "worthAsking"],
      },
    },
  },
  required: ["items"],
} as const;

export type ClientSummaryPassInput = {
  caseView: CaseView;
  context: CanonicalStudyContext;
  callModel?: CallModel;
  model?: string;
  reasoningEffort?: string;
};

function selectSummarySourceItems(caseView: CaseView): Array<{ itemId: string; stateLabel: string; label: string }> {
  const selected: Array<{ itemId: string; stateLabel: string; label: string }> = [];
  const order = [
    ...caseView.layout.needsDecision.inFocus,
    ...caseView.layout.changed,
    ...caseView.layout.gaps,
  ].slice(0, 5);
  const byId = new Map(caseView.items.map((item) => [item.itemId, item]));
  for (const id of order) {
    const item = byId.get(id);
    if (!item) {
      continue;
    }
    const stateLabel =
      item.state === "conflicting"
        ? "Two different values"
        : item.state === "unclear_identity"
          ? "Unclear identity"
          : item.state === "changed"
            ? "Changed"
            : item.state === "empty_field"
              ? "Empty field"
              : item.state === "not_found"
                ? "Not found"
                : "Note";
    selected.push({ itemId: item.itemId, stateLabel, label: item.label });
  }
  return selected;
}

export function buildFixtureClientSummary(caseView: CaseView): ClientSummary {
  const selected = selectSummarySourceItems(caseView);
  const items: ClientSummaryItem[] = selected.map((row, index) => ({
    summaryItemId: `sum_${index + 1}`,
    sourceItemId: row.itemId,
    stateLabel: row.stateLabel,
    text: `${row.label}.`,
    worthAsking: `What should we clarify about ${row.label.toLowerCase()}?`,
    chips: caseView.items.find((item) => item.itemId === row.itemId)?.state === "established"
      ? []
      : [],
  }));
  return {
    selectionRule: caseView.clientSummary.selectionRule,
    items,
    emptyStateText: items.length ? null : "No summary items selected.",
    notes: [],
    requests: caseView.items
      .filter((item) => item.state === "not_found")
      .map((item) => (item.state === "not_found" ? item.request : null))
      .filter(Boolean) as ClientSummary["requests"],
    questions: items.map((item, index) => ({
      questionId: `q_${index + 1}`,
      text: item.worthAsking,
      sourceSummaryItemId: item.summaryItemId,
    })),
    writtenBy: { model: "fixture", promptVersion: "client-summary/1" },
  };
}

export async function runClientSummaryPass(input: ClientSummaryPassInput): Promise<ClientSummary> {
  if (!input.callModel) {
    return buildFixtureClientSummary(input.caseView);
  }

  const selected = selectSummarySourceItems(input.caseView);
  if (!selected.length) {
    return buildFixtureClientSummary(input.caseView);
  }

  const responseSchema = CLIENT_SUMMARY_RESPONSE_JSON_SCHEMA;

  const userPayload = {
    schemaVersion: "client-summary/1",
    caseId: input.caseView.caseId,
    studyRunId: input.caseView.studyRunId,
    selectedItems: selected,
  };

  try {
    const model = input.model ?? "gpt-5.6-sol";
    const response = await input.callModel({
      model,
      reasoningEffort: input.reasoningEffort ?? "medium",
      systemPrompt: PROMPT,
      userContent: `Return client-summary/1 JSON.\n\n${JSON.stringify(userPayload, null, 2)}`,
      textFormat: {
        type: "json_schema",
        name: "client_summary_v1",
        strict: true,
        schema: responseSchema as Record<string, unknown>,
      },
    });
    const text = response.outputText;
    if (!text) {
      return buildFixtureClientSummary(input.caseView);
    }
    const parsed = JSON.parse(text) as {
      items: Array<{ sourceItemId: string; text: string; worthAsking: string }>;
    };
    const items: ClientSummaryItem[] = parsed.items.map((row, index) => {
      const source = input.caseView.items.find((item) => item.itemId === row.sourceItemId);
      const chips =
        source && "chips" in source && Array.isArray(source.chips) ? source.chips : [];
      return {
        summaryItemId: `sum_${index + 1}`,
        sourceItemId: row.sourceItemId,
        stateLabel:
          selected.find((entry) => entry.itemId === row.sourceItemId)?.stateLabel ?? "Note",
        text: row.text,
        worthAsking: row.worthAsking,
        chips,
      };
    });
    return {
      selectionRule: input.caseView.clientSummary.selectionRule,
      items,
      emptyStateText: null,
      notes: [],
      requests: input.caseView.clientSummary.requests,
      questions: items.map((item, index) => ({
        questionId: `q_${index + 1}`,
        text: item.worthAsking,
        sourceSummaryItemId: item.summaryItemId,
      })),
      writtenBy: {
        model: input.model ?? "gpt-5.6-sol",
        promptVersion: "client-summary/1",
      },
    };
  } catch {
    return buildFixtureClientSummary(input.caseView);
  }
}
