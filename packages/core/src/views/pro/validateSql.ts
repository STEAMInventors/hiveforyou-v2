export const PRO_SQL_TABLES = [
  "documents",
  "facts",
  "comparisons",
  "series_points",
  "gaps",
  "signals",
] as const;

export type ProSqlTable = (typeof PRO_SQL_TABLES)[number];

export function validateSql(sql: string): string | null {
  const s = sql
    .replace(/--.*$/gm, "")
    .trim()
    .replace(/;\s*$/, "");
  if (!s) {
    return "Write or generate a query first.";
  }
  const bare = s.replace(/'(?:[^']|'')*'/g, "''");
  if (bare.includes(";")) {
    return "Only one query at a time.";
  }
  if (!/^(select|with)\b/i.test(s)) {
    return "Only SELECT queries can run here.";
  }
  if (/`/.test(bare) || /\b(javascript|new|eval|function)\b/i.test(bare)) {
    return "Code inside a query isn't allowed.";
  }
  if (
    /\b(insert|update|delete|drop|create|alter|attach|detach|into|pragma|replace|truncate|set|load|source|require)\b/i.test(
      bare,
    )
  ) {
    return "This query tries to change data. Only reading is allowed.";
  }
  const refs = [...bare.matchAll(/\b(?:from|join)\s+([A-Za-z_][\w]*)\s*(\()?/gi)];
  if (!refs.length) {
    return "The query must read FROM one of the tables.";
  }
  for (const m of refs) {
    if (m[2]) {
      return `"${m[1]}(…)" isn't allowed. Read from a table name.`;
    }
    if (!PRO_SQL_TABLES.includes(m[1] as ProSqlTable)) {
      return `Unknown table "${m[1]}". Use: ${PRO_SQL_TABLES.join(", ")}.`;
    }
  }
  return null;
}
