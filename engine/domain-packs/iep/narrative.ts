import type { NarrativeBlock } from "@hiveforyou/domain-pack";

export const IEP_NARRATIVE_BLOCK: NarrativeBlock = {
  opening: "Here's where things stand before the meeting.",
  chapters: ["then", "since", "now", "next", "ask"],
  templates: [
    {
      id: "then.eligibility",
      chapter: "then",
      when: { kind: "anchorExists", role: "prior" },
      say: "In {prior.year}, {student.firstName} qualified for special education for {prior.eligibility.category}, with {prior.eligibility.primaryNeed} as the main need.",
      slots: [
        "prior.year",
        "student.firstName",
        "prior.eligibility.category",
        "prior.eligibility.primaryNeed",
      ],
    },
    {
      id: "then.goal",
      chapter: "then",
      when: { kind: "factExists", slot: "prior.goal.target" },
      say: "The IEP set a goal to move from {prior.goal.baseline} to {prior.goal.target}.",
      slots: ["prior.goal.baseline", "prior.goal.target"],
    },
    {
      id: "since.progress",
      chapter: "since",
      when: { kind: "seriesPointAfter", measure: "prior.goal.measure", anchor: "prior" },
      say: "By {series.next.date}, {series.measure} was {series.next.value}{series.next.goalMetClause}.",
      slots: [
        "series.next.date",
        "series.measure",
        "series.next.value",
        "series.next.goalMetClause",
      ],
    },
    {
      id: "since.gap",
      chapter: "since",
      when: { kind: "recordGapMonths", gte: 13 },
      say: "Then the records go quiet. There are no IEPs or progress reports from {gap.start} to {gap.end}.",
      slots: ["gap.start", "gap.end"],
    },
    {
      id: "now.reeval",
      chapter: "now",
      when: { kind: "factExists", slot: "reeval.latest.date" },
      say: "The {reeval.latest.season} reevaluation found {reeval.summary}.",
      slots: ["reeval.latest.season", "reeval.summary"],
    },
    {
      id: "next.need",
      chapter: "next",
      when: { kind: "anchorsDiffer", slot: "eligibility.primaryNeed" },
      say: "The {current.year} eligibility now lists {current.eligibility.primaryNeed} as the main need.",
      slots: ["current.year", "current.eligibility.primaryNeed"],
    },
    {
      id: "next.goals",
      chapter: "next",
      when: { kind: "anchorsDiffer", slot: "goal.skill" },
      say: "The new IEP {goals.diffClause}.",
      slots: ["goals.diffClause"],
    },
    {
      id: "ask.top",
      chapter: "ask",
      when: { kind: "topSignal" },
      say: "Worth asking: {signal.top.question}",
      slots: ["signal.top.question"],
    },
  ],
  plain: {
    "eligibility.category": {
      "Specific Learning Disability (SLD) - Reading": "a learning disability in reading",
    },
    "eligibility.primaryNeed": {
      "Reading Fluency": "reading fluency",
      "Reading Comprehension": "reading comprehension",
    },
  },
};
