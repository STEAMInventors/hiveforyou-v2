import type { Study } from "@hiveforyou/shared/pack-study";

function fact(id: string, raw: string, display: string, doc?: string, page?: number) {
  return { id, raw, display, doc, page };
}

/** Caleb Nguyen 9-document L001-shaped pack study fixture for narrative tests. */
export function calebNguyenStudyFixture(): Study {
  const slotComparisons: Study["slotComparisons"] = [
    {
      id: "cmp-primary-need",
      attributeId: "eligibility.primaryNeed",
      sectionId: "factors",
      priorSlot: "prior.eligibility.primaryNeed",
      currentSlot: "current.eligibility.primaryNeed",
      state: "changed",
    },
    {
      id: "cmp-eligibility-cat",
      attributeId: "eligibility.category",
      sectionId: "factors",
      priorSlot: "prior.eligibility.category",
      currentSlot: "current.eligibility.category",
      state: "reconfirmed",
    },
    {
      id: "cmp-goal-fluency",
      attributeId: "goal.reading.fluency",
      sectionId: "goals",
      priorSlot: "prior.goal.skill",
      currentSlot: null,
      state: "dropped",
      note: "Last marked not met; not in the new plan",
    },
    {
      id: "cmp-goal-comprehension",
      attributeId: "goal.reading.comprehension",
      sectionId: "goals",
      priorSlot: null,
      currentSlot: "current.goal.skill",
      state: "added",
    },
  ];

  return {
    anchors: {
      prior: { label: "2023 IEP", date: "2023-08-15" },
      current: { label: "2026 IEP", date: "2026-01-10" },
    },
    facts: {
      "prior.year": fact("f-prior-year", "2023", "2023", "prior-iep", 1),
      "student.firstName": fact("f-student-name", "Caleb", "Caleb"),
      "student.lastName": fact("f-student-last", "Nguyen", "Nguyen"),
      "prior.eligibility.category": fact(
        "f-prior-cat",
        "Specific Learning Disability (SLD) - Reading",
        "Specific Learning Disability (SLD) - Reading",
        "prior-iep",
        1,
      ),
      "current.eligibility.category": fact(
        "f-current-cat",
        "Specific Learning Disability (SLD) - Reading",
        "Specific Learning Disability (SLD) - Reading",
        "current-iep",
        1,
      ),
      "prior.eligibility.primaryNeed": fact("f-prior-need", "Reading Fluency", "Reading Fluency", "prior-iep", 2),
      "prior.goal.baseline": fact("f-prior-baseline", "62", "62", "prior-iep", 3),
      "prior.goal.target": fact("f-prior-target", "95", "95", "prior-iep", 3),
      "prior.goal.measure": fact("f-prior-measure", "words correct per minute", "words correct per minute"),
      "prior.goal.skill": fact("f-prior-skill", "reading fluency", "reading fluency", "prior-iep", 3),
      "current.year": fact("f-current-year", "2026", "2026", "current-iep", 1),
      "current.eligibility.primaryNeed": fact(
        "f-current-need",
        "Reading Comprehension",
        "Reading Comprehension",
        "current-iep",
        2,
      ),
      "current.goal.skill": fact("f-current-skill", "reading comprehension", "reading comprehension", "current-iep", 3),
      "plan.period": fact("f-plan-period", "2026-01-10/2027-01-10", "Jan 2026 – Jan 2027", "current-iep", 1),
      "reeval.latest.date": fact("f-reeval-date", "2025-10-01", "2025-10-01"),
      "reeval.latest.season": fact("f-reeval-season", "Fall", "Fall"),
      "progress.wcpm": fact("f-progress-wcpm", "91", "91", "progress-report", 2),
      "progress.goalMet": fact("f-progress-met", "false", "not met"),
    },
    seriesAfterPrior: {
      measureDisplay: "words correct per minute",
      dateDisplay: "February 2024",
      valueDisplay: "91",
      goalMet: false,
      factIds: ["f-progress-wcpm", "f-progress-met"],
    },
    measureSeries: [
      {
        measure: "reading fluency",
        unit: "WCPM",
        target: { value: "95", factId: "f-prior-target" },
        points: [
          {
            date: "February 2024",
            value: "91",
            factId: "f-progress-wcpm",
            noteFactId: "f-progress-met",
          },
        ],
      },
    ],
    recordGap: {
      months: 23,
      startDisplay: "Oct 2024",
      endDisplay: "Sep 2026",
      factId: "f-search-scope-gap",
    },
    recordGaps: [
      {
        from: "Oct 2024",
        to: "Sep 2026",
        missing: "plans or progress reports",
        factId: "f-search-scope-gap",
        months: 23,
      },
    ],
    anchorComparisons: [
      {
        kind: "CHANGED",
        item: "main area of need",
        prior: "reading fluency",
        current: "reading comprehension",
        factIds: ["f-prior-need", "f-current-need"],
      },
    ],
    reevalMeasures: [
      {
        text: "reading comprehension is now the greater need than reading fluency",
        factIds: ["f-reeval-need"],
        direction: "neutral",
      },
    ],
    goals: {
      prior: [
        {
          skill: "reading fluency",
          baseline: fact("f-prior-baseline", "62", "62"),
          target: fact("f-prior-target", "95", "95"),
        },
      ],
      current: [
        {
          skill: "reading comprehension",
          baseline: fact("f-comp-baseline", "70", "70"),
          target: fact("f-comp-target", "90", "90"),
        },
      ],
    },
    topSignal: {
      basis: "what goal will track reading comprehension in the new IEP?",
      factIds: ["f-current-skill"],
    },
    slotComparisons,
    rankedSignals: [
      { kind: "comparison", comparisonId: "cmp-primary-need" },
      { kind: "goal", comparisonId: "cmp-goal-fluency", skill: "reading fluency" },
      { kind: "gap", gapIndex: 0 },
    ],
  };
}

export function calebNguyenStudyWithoutPriorFixture(): Study {
  const full = calebNguyenStudyFixture();
  const facts = { ...full.facts };
  for (const key of Object.keys(facts)) {
    if (key.startsWith("prior.")) {
      delete facts[key];
    }
  }
  return {
    ...full,
    anchors: { prior: null, current: full.anchors.current },
    facts,
    seriesAfterPrior: null,
    measureSeries: [],
    recordGaps: [],
    slotComparisons: full.slotComparisons.filter((c) => !c.priorSlot?.startsWith("prior.")),
    rankedSignals: full.rankedSignals,
  };
}
