import type { CaseViewV2, ChangeItem, DomainPackViewConfigV2 } from "@hiveforyou/shared/projections";

function serializeItem(caseView: CaseViewV2, itemId: string) {
  const item = caseView.items.find((i) => i.itemId === itemId);
  if (!item) {
    return null;
  }
  if (item.state === "changed") {
    const change = item as ChangeItem;
    const first = change.series[0];
    const last = change.series[change.series.length - 1];
    return {
      itemId: item.itemId,
      label: item.label,
      state: item.state,
      display: last?.value.display ?? item.label,
      beforeDisplay: first?.value.display ?? null,
    };
  }
  if (item.state === "established") {
    return {
      itemId: item.itemId,
      label: item.label,
      state: item.state,
      display: item.value.display,
      beforeDisplay: null,
    };
  }
  return {
    itemId: item.itemId,
    label: item.label,
    state: item.state,
    display: item.label,
    beforeDisplay: null,
  };
}

function writerSubjectDefault(caseView: CaseViewV2): string {
  const voice = caseView.voice;
  if (voice.useSubjectName && voice.subjectName?.value) {
    return voice.subjectName.value;
  }
  return voice.subject;
}

export function buildClientWriterPayload(caseView: CaseViewV2, pack: DomainPackViewConfigV2) {
  return {
    schemaVersion: "client-writer/2",
    voice: {
      subjectDefault: writerSubjectDefault(caseView),
      documentsNoun: caseView.voice.documentsNoun,
      planNoun: caseView.voice.planNoun,
      eventNoun: caseView.voice.eventNoun,
      otherPartyNoun: caseView.voice.otherPartyNoun,
      helperNoun: caseView.voice.helperNoun,
    },
    intent: {
      goal: caseView.intent.label,
      userText: caseView.intent.clientText,
    },
    rules: pack.rules,
    story: caseView.story.map((slot) => ({
      slotId: slot.slotId,
      slotType: slot.slotType,
      items: slot.itemIds.map((id) => serializeItem(caseView, id)).filter(Boolean),
    })),
    cards: caseView.plan.cards.map((card) => ({
      cardId: card.cardId,
      status: card.status,
      title: card.title,
      items: card.itemIds.map((id) => serializeItem(caseView, id)).filter(Boolean),
    })),
    timeline: caseView.timeline.events.map((ev) => ({
      eventId: ev.eventId,
      title: ev.title,
      date: ev.date?.display ?? null,
      items: ev.itemIds.map((id) => serializeItem(caseView, id)).filter(Boolean),
    })),
    prep: {
      stayedSame: caseView.prep.stayedSame
        ? {
            items: caseView.prep.stayedSame.itemIds
              .map((id) => serializeItem(caseView, id))
              .filter(Boolean),
          }
        : null,
      questions: caseView.prep.questions.map((q) => ({
        questionId: q.questionId,
        items: q.itemIds.map((id) => serializeItem(caseView, id)).filter(Boolean),
      })),
    },
  };
}
