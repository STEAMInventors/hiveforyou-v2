import { DEFAULT_PRO_VIEW_WEIGHTS, type ProPackConfig } from "@hiveforyou/domain-pack";

export const IEP_PRO_CONFIG: ProPackConfig = {
  viewWeights: { ...DEFAULT_PRO_VIEW_WEIGHTS },
  exportExamples: [
    {
      q: "Every fact from the new IEP, with page and quote",
      sql: "SELECT label, display, page, quote\nFROM facts\nWHERE doc_role = 'New IEP'\nORDER BY page, label",
      kw: ["new iep", "quote", "page", "every fact"],
    },
    {
      q: "What changed between the two IEPs",
      sql: "SELECT section, label, prior_display, current_display, state\nFROM comparisons\nWHERE state IN ('changed','added','dropped')\nORDER BY section",
      kw: ["changed", "change", "difference", "compare", "between"],
    },
    {
      q: "Reading fluency over time against the goal",
      sql: "SELECT asOf, reading, goal_target, unit, doc_role, page\nFROM series_points\nWHERE label = 'Reading fluency'\nORDER BY asOf",
      kw: ["fluency", "over time", "trend", "progress", "wcpm"],
    },
    {
      q: "All goals with targets and sources",
      sql: "SELECT asOf, label, display, doc_role, page\nFROM facts\nWHERE attribute LIKE 'goal.%'\nORDER BY asOf",
      kw: ["goal", "target", "mastery"],
    },
    {
      q: "Gaps and things Hive did not capture",
      sql: "SELECT kind, label, from_date, to_date, months, doc_role\nFROM gaps",
      kw: ["gap", "missing", "not captured", "records"],
    },
    {
      q: "Facts per document",
      sql: "SELECT doc_role, COUNT(*) AS facts\nFROM facts\nGROUP BY doc_role\nORDER BY facts DESC",
      kw: ["per document", "count", "how many", "coverage"],
    },
  ],
};
