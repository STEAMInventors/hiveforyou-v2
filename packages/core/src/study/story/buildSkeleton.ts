import type { DomainPack } from "@hiveforyou/domain-pack";
import type { Study, StudyFact } from "@hiveforyou/shared/pack-study";

import { assertNoRawKey, plainValue } from "./raw-key";
import type { SkeletonChapter, SkeletonFact, StorySkeleton } from "./types";
import { STORY_CHAPTER_ORDER } from "./types";

function skeletonFactFromStudy(
  pack: DomainPack,
  slot: string,
  fact: StudyFact,
): SkeletonFact {
  const label = pack.story.plainLabels[slot] ?? slot.split(".").pop()?.replace(/_/g, " ") ?? slot;
  const value = plainValue(pack.story.plainValues, slot, fact.display);
  const unitKey = fact.raw in pack.story.units ? fact.raw : undefined;
  const unit = unitKey ? pack.story.units[unitKey] : undefined;
  assertNoRawKey(label, `${slot}.label`);
  return {
    label,
    value,
    unit,
    date: fact.date,
    doc: fact.doc ?? "Document",
    page: fact.page,
  };
}

export function buildSkeleton(pack: DomainPack, study: Study, intent: string): StorySkeleton {
  const subject = study.facts["student.firstName"]?.display ?? "Student";
  const chapters: SkeletonChapter[] = [];
  const factIdsUsed = new Set<string>();

  const mark = (id: string) => {
    factIdsUsed.add(id);
  };

  if (study.anchors.prior) {
    const thenIdSet = new Set<string>();
    for (const [slot, fact] of Object.entries(study.facts)) {
      if (slot.startsWith("prior.")) {
        thenIdSet.add(fact.id);
        mark(fact.id);
      }
    }
    for (const s of study.measureSeries) {
      if (s.target) {
        thenIdSet.add(s.target.factId);
        mark(s.target.factId);
      }
    }
    if (!study.facts["prior.year"]) {
      const fromDate = study.anchors.prior.date?.trim().slice(0, 4);
      const fromLabel = study.anchors.prior.label.match(/\b(20\d{2})\b/)?.[1];
      const year = fromDate?.match(/^20\d{2}$/) ? fromDate : fromLabel;
      if (year) {
        thenIdSet.add("prior-year:anchor");
        mark("prior-year:anchor");
      }
    }
    if (thenIdSet.size) {
      chapters.push({ chapter: "then", factIds: [...thenIdSet] });
    }
  }

  if (study.anchors.prior) {
    const series = study.measureSeries.map((s) => {
      for (const p of s.points) {
        mark(p.factId);
        if (p.noteFactId) {
          mark(p.noteFactId);
        }
      }
      if (s.target) {
        mark(s.target.factId);
      }
      return {
        measure: s.measure,
        unit: pack.story.units[s.unit] ?? s.unit,
        target: s.target,
        points: s.points,
      };
    });
    const gaps = study.recordGaps.map((g) => {
      mark(g.factId);
      return {
        from: g.from,
        to: g.to,
        missing: g.missing,
        factId: g.factId,
      };
    });
    if (series.length || gaps.length) {
      chapters.push({ chapter: "since", series, gaps });
    }
  }

  if (study.anchors.current) {
    const nowIds = Object.entries(study.facts)
      .filter(
        ([slot]) =>
          slot.startsWith("current.") ||
          slot.startsWith("reeval.") ||
          slot.startsWith("eval."),
      )
      .map(([, f]) => f.id);
    for (const id of nowIds) {
      mark(id);
    }
    if (nowIds.length) {
      chapters.push({ chapter: "now", factIds: nowIds });
    }
  }

  if (study.anchorComparisons.length) {
    const diffs = study.anchorComparisons.map((c) => {
      for (const id of c.factIds) {
        mark(id);
      }
      return {
        item: c.item,
        prior: c.prior,
        current: c.current,
        dropped: c.dropped,
        added: c.added,
        factIds: c.factIds,
      };
    });
    chapters.push({ chapter: "next", diffs });
  }

  if (study.topSignal) {
    for (const id of study.topSignal.factIds) {
      mark(id);
    }
    chapters.push({
      chapter: "ask",
      basis: study.topSignal.basis,
      factIds: study.topSignal.factIds,
    });
  }

  const ordered = STORY_CHAPTER_ORDER.flatMap((name) => chapters.filter((c) => c.chapter === name));

  const facts: Record<string, SkeletonFact> = {};
  for (const [slot, fact] of Object.entries(study.facts)) {
    if (!factIdsUsed.has(fact.id)) {
      continue;
    }
    facts[fact.id] = skeletonFactFromStudy(pack, slot, fact);
  }

  const ensureFactDigits = (factId: string, value: string, defaults: Omit<SkeletonFact, "value">) => {
    const trimmed = value.trim();
    if (!trimmed || !factIdsUsed.has(factId)) {
      return;
    }
    const existing = facts[factId];
    const hasDigits = existing && /\d/.test(existing.value);
    if (!existing || !hasDigits) {
      facts[factId] = {
        label: existing?.label ?? defaults.label,
        value: trimmed,
        unit: existing?.unit ?? defaults.unit,
        date: existing?.date ?? defaults.date,
        doc: existing?.doc ?? defaults.doc,
        page: existing?.page,
      };
    }
  };

  if (study.facts["prior.goal.baseline"]) {
    ensureFactDigits(study.facts["prior.goal.baseline"].id, study.facts["prior.goal.baseline"].display, {
      label: "goal baseline",
      doc: "Case records",
    });
  }
  if (study.facts["prior.goal.target"]) {
    ensureFactDigits(study.facts["prior.goal.target"].id, study.facts["prior.goal.target"].display, {
      label: "goal target",
      doc: "Case records",
    });
  }
  for (const s of study.measureSeries) {
    if (s.target) {
      ensureFactDigits(s.target.factId, s.target.value, {
        label: "goal target",
        doc: "Case records",
      });
    }
    for (const p of s.points) {
      ensureFactDigits(p.factId, p.value, {
        label: s.measure,
        unit: pack.story.units[s.unit] ?? s.unit,
        date: p.date,
        doc: "Case records",
      });
    }
  }

  if (factIdsUsed.has("prior-year:anchor") && !facts["prior-year:anchor"] && study.anchors.prior) {
    const fromDate = study.anchors.prior.date?.trim().slice(0, 4);
    const fromLabel = study.anchors.prior.label.match(/\b(20\d{2})\b/)?.[1];
    const year = fromDate?.match(/^20\d{2}$/) ? fromDate : fromLabel;
    if (year) {
      facts["prior-year:anchor"] = {
        label: "prior IEP year",
        value: year,
        date: study.anchors.prior.date?.trim() || undefined,
        doc: study.anchors.prior.label ?? "Prior IEP",
      };
    }
  }

  for (const s of study.measureSeries) {
    if (s.target && factIdsUsed.has(s.target.factId) && !facts[s.target.factId]) {
      facts[s.target.factId] = {
        label: "goal target",
        value: s.target.value,
        doc: "Case records",
      };
    }
  }

  for (const chapter of ordered) {
    if (chapter.chapter !== "since") {
      continue;
    }
    for (const g of chapter.gaps) {
      if (facts[g.factId]) {
        continue;
      }
      facts[g.factId] = {
        label: "missing records",
        value: `${g.from} through ${g.to}`,
        date: g.from,
        doc: "Case records",
      };
    }
    for (const s of chapter.series) {
      for (const p of s.points) {
        if (!facts[p.factId]) {
          facts[p.factId] = {
            label: s.measure,
            value: p.value,
            unit: s.unit,
            date: p.date,
            doc: "Case records",
          };
        }
        if (p.noteFactId && !facts[p.noteFactId]) {
          facts[p.noteFactId] = {
            label: "progress note",
            value: p.note ?? "progress",
            doc: "Case records",
          };
        }
      }
      if (s.target && !facts[s.target.factId]) {
        facts[s.target.factId] = {
          label: "goal target",
          value: s.target.value,
          doc: "Case records",
        };
      }
    }
  }

  return {
    intent,
    subject,
    anchors: {
      prior: study.anchors.prior ?? undefined,
      current: study.anchors.current ?? undefined,
    },
    chapters: ordered,
    facts,
  };
}
