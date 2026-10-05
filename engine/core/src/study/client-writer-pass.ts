import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import type { CaseViewV2, DomainPackViewConfigV2 } from "@hiveforyou/shared/projections";
import { domainPackViewConfigForDomainId } from "@hiveforyou/shared/projections";

import { readStatedWorkPurpose } from "@hiveforyou/shared/canonical-study";

import { loadBundledPromptContent } from "../prompts/load-prompt-content";

import type { CallModel } from "../model/call-model";
import { buildClientWriterPayload } from "./build-client-writer-payload";
import {
  checkTone,
  itemIdsSubset,
  numbersAllowedInText,
  writerVoiceConsistent,
  type ClientWriterModelOutput,
} from "./validate-client-writer-output";

const PROMPT = loadBundledPromptContent("client-writer/client-writer-v2.md");

export const CLIENT_WRITER_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    story: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          slotId: { type: "string" },
          text: { type: "string" },
          itemIds: { type: "array", items: { type: "string" } },
        },
        required: ["slotId", "text", "itemIds"],
      },
    },
    cards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          cardId: { type: "string" },
          oneLiner: { type: "string" },
          sinceLine: { type: ["string", "null"] },
          whyLine: { type: ["string", "null"] },
          itemIds: { type: "array", items: { type: "string" } },
        },
        required: ["cardId", "oneLiner", "sinceLine", "whyLine", "itemIds"],
      },
    },
    timeline: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          eventId: { type: "string" },
          detail: { type: ["string", "null"] },
          itemIds: { type: "array", items: { type: "string" } },
        },
        required: ["eventId", "detail", "itemIds"],
      },
    },
    prep: {
      type: "object",
      additionalProperties: false,
      properties: {
        stayedSame: {
          type: ["object", "null"],
          additionalProperties: false,
          properties: {
            text: { type: ["string", "null"] },
            itemIds: { type: "array", items: { type: "string" } },
          },
          required: ["text", "itemIds"],
        },
        questions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              questionId: { type: "string" },
              text: { type: "string" },
              itemIds: { type: "array", items: { type: "string" } },
            },
            required: ["questionId", "text", "itemIds"],
          },
        },
      },
      required: ["stayedSame", "questions"],
    },
  },
  required: ["story", "cards", "timeline", "prep"],
} as const;

export type ClientWriterPassInput = {
  caseView: CaseViewV2;
  context: CanonicalStudyContext;
  callModel?: CallModel;
  model?: string;
  reasoningEffort?: string;
};

function displaysForItemIds(caseView: CaseViewV2, itemIds: string[]): string[] {
  const out: string[] = [];
  for (const id of itemIds) {
    const item = caseView.items.find((i) => i.itemId === id);
    if (!item) {
      continue;
    }
    if (item.state === "established") {
      out.push(item.value.display);
    }
    if (item.state === "changed") {
      for (const p of item.series) {
        out.push(p.value.display);
      }
    }
  }
  return out;
}

function toneRejectReason(
  text: string,
  caseView: CaseViewV2,
  pack: DomainPackViewConfigV2,
  userText: string,
): string | null {
  const extra = pack.voice.extraColdWords ?? [];
  const tone = checkTone(text, caseView.voice, userText, extra);
  if (tone) {
    return tone;
  }
  if (!writerVoiceConsistent(text, caseView.voice, pack)) {
    return "voice_inconsistent";
  }
  return null;
}

function toneOk(text: string, caseView: CaseViewV2, pack: DomainPackViewConfigV2, userText: string) {
  return toneRejectReason(text, caseView, pack, userText) === null;
}

export type ClientWriterFieldLog = {
  field: string;
  accepted: boolean;
  reason: string | null;
};

function logWriterField(logs: ClientWriterFieldLog[], field: string, accepted: boolean, reason: string | null) {
  logs.push({ field, accepted, reason });
}

function mergeWriterOutput(
  caseView: CaseViewV2,
  pack: DomainPackViewConfigV2,
  output: ClientWriterModelOutput,
  userText: string,
): { caseView: CaseViewV2; fieldLogs: ClientWriterFieldLog[] } {
  const fieldLogs: ClientWriterFieldLog[] = [];
  const storyById = new Map(output.story.map((row) => [row.slotId, row]));
  const cardsById = new Map(output.cards.map((row) => [row.cardId, row]));
  const timelineById = new Map(output.timeline.map((row) => [row.eventId, row]));
  const prepQById = new Map(output.prep.questions.map((row) => [row.questionId, row]));

  const story = caseView.story.map((slot) => {
    const row = storyById.get(slot.slotId);
    const field = `story.${slot.slotId}`;
    if (!row?.text?.trim()) {
      logWriterField(fieldLogs, field, false, "missing_model_text");
      return slot;
    }
    const allowed = new Set(slot.itemIds);
    const isEcho = slot.slotType === "echo";
    if (
      !isEcho &&
      !itemIdsSubset(row.itemIds, allowed.size ? allowed : new Set(caseView.items.map((i) => i.itemId)))
    ) {
      logWriterField(fieldLogs, field, false, "bad_item_ids");
      return slot;
    }
    const toneReason = toneRejectReason(row.text, caseView, pack, userText);
    if (toneReason) {
      logWriterField(fieldLogs, field, false, toneReason);
      return slot;
    }
    if (!numbersAllowedInText(row.text, displaysForItemIds(caseView, row.itemIds))) {
      logWriterField(fieldLogs, field, false, "numeric_drift");
      return slot;
    }
    logWriterField(fieldLogs, field, true, null);
    return { ...slot, text: row.text, itemIds: row.itemIds.length ? row.itemIds : slot.itemIds, fallbackUsed: false };
  });

  const cards = caseView.plan.cards.map((card) => {
    const row = cardsById.get(card.cardId);
    if (!row) {
      return card;
    }
    const allowed = new Set(card.itemIds);
    let oneLiner = card.oneLiner;
    let sinceLine = card.sinceLine;
    if (
      row.oneLiner?.trim() &&
      itemIdsSubset(row.itemIds, allowed) &&
      toneOk(row.oneLiner, caseView, pack, userText) &&
      numbersAllowedInText(row.oneLiner, displaysForItemIds(caseView, row.itemIds))
    ) {
      oneLiner = row.oneLiner;
    }
    if (
      row.sinceLine?.trim() &&
      itemIdsSubset(row.itemIds, allowed) &&
      toneOk(row.sinceLine, caseView, pack, userText)
    ) {
      sinceLine = row.sinceLine;
    }
    return { ...card, oneLiner, sinceLine, whyLine: null };
  });

  const events = caseView.timeline.events.map((ev) => {
    const row = timelineById.get(ev.eventId);
    if (!row?.detail?.trim()) {
      return ev;
    }
    const allowed = new Set(ev.itemIds);
    if (!itemIdsSubset(row.itemIds, allowed.size ? allowed : new Set(caseView.items.map((i) => i.itemId)))) {
      return ev;
    }
    if (!toneOk(row.detail, caseView, pack, userText)) {
      return ev;
    }
    return { ...ev, detail: row.detail, itemIds: row.itemIds };
  });

  let prep = caseView.prep;
  if (output.prep.stayedSame?.text?.trim()) {
    const ids = caseView.prep.stayedSame?.itemIds ?? [];
    const allowed = new Set(ids);
    if (
      itemIdsSubset(output.prep.stayedSame.itemIds, allowed) &&
      toneOk(output.prep.stayedSame.text, caseView, pack, userText)
    ) {
      prep = {
        ...prep,
        stayedSame: {
          text: output.prep.stayedSame.text,
          itemIds: output.prep.stayedSame.itemIds,
        },
      };
    }
  }

  const questions = prep.questions.map((q) => {
    const row = prepQById.get(q.questionId);
    if (!row?.text?.trim()) {
      return q;
    }
    const allowed = new Set(q.itemIds);
    if (!itemIdsSubset(row.itemIds, allowed)) {
      return q;
    }
    if (!toneOk(row.text, caseView, pack, userText)) {
      return q;
    }
    if (/what led to this change/i.test(row.text) || /can you explain this/i.test(row.text)) {
      return q;
    }
    return { ...q, text: row.text, itemIds: row.itemIds };
  });

  return {
    caseView: {
      ...caseView,
      story,
      plan: { ...caseView.plan, cards },
      timeline: { ...caseView.timeline, events },
      prep: { ...prep, questions },
      clientSummary: {
        ...caseView.clientSummary,
        items: [],
        questions: [],
        writtenBy: { model: "client-writer", promptVersion: "client-writer/2" },
      },
    },
    fieldLogs,
  };
}

function summarizeWriterLogs(logs: ClientWriterFieldLog[]): void {
  const rejected = logs.filter((l) => !l.accepted);
  const accepted = logs.filter((l) => l.accepted);
  const byReason = new Map<string, number>();
  for (const row of rejected) {
    const key = row.reason ?? "unknown";
    byReason.set(key, (byReason.get(key) ?? 0) + 1);
  }
  const topReasons = [...byReason.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason, count]) => ({ reason, count }));
  console.info("[client-writer/2] merge_summary", {
    acceptedFields: accepted.length,
    fallbackFields: rejected.length,
    topRejectionReasons: topReasons,
    fields: logs,
  });
}

export async function runClientWriterPass(input: ClientWriterPassInput): Promise<CaseViewV2> {
  const pack =
    domainPackViewConfigForDomainId(input.context.domainId) ??
    domainPackViewConfigForDomainId("special_education");
  if (!pack) {
    return input.caseView;
  }

  if (!input.callModel) {
    return {
      ...input.caseView,
      clientSummary: {
        ...input.caseView.clientSummary,
        writtenBy: { model: "fixture", promptVersion: "client-writer/2" },
      },
    };
  }

  const userPayload = buildClientWriterPayload(input.caseView, pack);
  const responseSchema = CLIENT_WRITER_RESPONSE_JSON_SCHEMA;

  try {
    const model = input.model ?? "gpt-5.6-sol";
    const response = await input.callModel({
      model,
      reasoningEffort: input.reasoningEffort ?? "medium",
      systemPrompt: PROMPT,
      userContent: `Return client-writer/2 JSON.\n\n${JSON.stringify(userPayload, null, 2)}`,
      textFormat: {
        type: "json_schema",
        name: "client_writer_v2",
        strict: true,
        schema: responseSchema as Record<string, unknown>,
      },
    });
    const text = response.outputText;
    if (!text) {
      return input.caseView;
    }
    const parsed = JSON.parse(text) as ClientWriterModelOutput;
    const userText =
      input.caseView.intent.clientText?.trim() ||
      readStatedWorkPurpose(input.context.answerSnapshot.userContext) ||
      "";
    const merged = mergeWriterOutput(input.caseView, pack, parsed, userText);
    summarizeWriterLogs(merged.fieldLogs);
    return merged.caseView;
  } catch {
    return input.caseView;
  }
}

/** @deprecated Use runClientWriterPass */
export const runClientSummaryPass = runClientWriterPass;
