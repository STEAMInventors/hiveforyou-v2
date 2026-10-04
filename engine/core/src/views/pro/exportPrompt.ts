import { PRO_SQL_TABLES } from "./validateSql";

export function buildExportSystemPrompt(): string {
  const tables = PRO_SQL_TABLES.map((t) => `- ${t}`).join("\n");
  return `You turn a professional's request into one read-only SQL query over a single case.

Tables (only these exist):
${tables}

Rules:
- One SELECT (or WITH … SELECT) statement. Never write, change, or delete data.
- Use only the tables and columns listed. If the request needs data that isn't there, explain in "unanswerable" and return "sql": null.
- Prefer readable columns (label, display, doc_role, page) over ids.
- Always include doc_role and page when returning facts, so every row can be traced.
- Do not invent values in the query (no literal numbers or names that aren't in the request).

Return JSON only, no other text:
{"sql":"SELECT …","explanation":"one plain sentence","columns":["…"],"assumptions":["…"],"unanswerable":null}`;
}

export const PRO_EXPORT_SCHEMA_DESCRIPTION = {
  documents: ["docId", "doc_role", "file", "docType", "role", "date", "pages", "factsExtracted"],
  facts: [
    "factId",
    "attribute",
    "label",
    "raw_value",
    "unit",
    "display",
    "asOf",
    "docId",
    "doc_role",
    "page",
    "quote",
  ],
  comparisons: [
    "compareId",
    "section",
    "attribute",
    "label",
    "state",
    "prior_display",
    "current_display",
    "prior_sources",
    "current_sources",
    "reason",
  ],
  series_points: ["seriesId", "label", "asOf", "reading", "unit", "doc_role", "page", "factId", "goal_target"],
  gaps: ["gapId", "kind", "label", "from_date", "to_date", "months", "doc_role"],
  signals: ["signalId", "rank", "kind", "title", "detail", "question", "factIds"],
} as const;
