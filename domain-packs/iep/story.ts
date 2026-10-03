import type { StoryPackConfig } from "@hiveforyou/domain-pack";

export const IEP_STORY_CONFIG: StoryPackConfig = {
  anchorDocType: "IEP",
  supportingWindowDays: 120,
  gapMonths: 13,
  gapExpectedDocTypes: ["IEP", "Progress Report"],
  gapMissingLabel: "plans or progress reports",
  plainLabels: {
    "eligibility.category": "Eligibility category",
    "eligibility.primaryNeed": "Primary need",
    "goal.skill": "Goal focus",
    "goal.reading.fluency": "Reading fluency goal",
    "goal.reading.comprehension": "Reading comprehension goal",
    "plan.period": "Plan period",
    "school.name": "School",
  },
  plainValues: {
    "eligibility.category": {
      "Specific Learning Disability (SLD) - Reading": "SLD – Reading",
    },
    "eligibility.primaryNeed": {
      "Reading Fluency": "reading fluency",
      "Reading Comprehension": "reading comprehension",
    },
  },
  units: {
    WCPM: "words correct per minute",
    standard_score: "standard score",
    percent: "%",
    times_standard_time: "× standard time",
    sessions_per_week: "sessions a week",
    minutes: "minutes",
  },
};
