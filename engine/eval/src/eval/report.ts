import type { GradeFailureKind, GradeFeedbackByKind, GradeMetrics, GradeResult } from "../grade.js";
import type { GoldenSelectionSkip } from "./select-goldens.js";

/** Keep in sync with grader ordering in grade.ts. */
export const FAILURE_KIND_ORDER: GradeFailureKind[] = [
  "MISSED_FACT",
  "UNSUPPORTED_CLAIM",
  "VALUE_MISMATCH",
  "WRONG_ABSTENTION",
  "TRIPWIRE_FIRED",
  "INVARIANT_BROKEN",
];

export type CaseEvalResult = {
  caseId: string;
  grade: GradeResult;
  baselinePath: string;
  baselineRunStatus?: string;
  baselineValidationStatus?: string;
  acceptedClaimCount: number;
};

export type EvalRunSummary = {
  source: string;
  split: string;
  generatedIso: string;
  casesScored: CaseEvalResult[];
  skipped: GoldenSelectionSkip[];
  baselineNote: string;
};

function fmt(n: number): string {
  return n.toFixed(4);
}

function failureCounts(failures: GradeResult["failures"]): Map<GradeFailureKind, number> {
  const m = new Map<GradeFailureKind, number>();
  for (const kind of FAILURE_KIND_ORDER) {
    m.set(kind, 0);
  }
  for (const f of failures) {
    m.set(f.kind, (m.get(f.kind) ?? 0) + 1);
  }
  return m;
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function renderFeedback(feedback: GradeFeedbackByKind[]): string {
  const lines: string[] = [];
  for (const block of feedback) {
    lines.push(`### ${block.kind} (${block.count})`);
    for (const ex of block.examples) {
      lines.push(`- ${ex.message}`);
      if (ex.expectedPage != null) {
        lines.push(`  - expected page ${ex.expectedPage}${ex.expectedQuote ? `: "${ex.expectedQuote}"` : ""}`);
      }
      if (ex.foundPage != null) {
        lines.push(`  - found page ${ex.foundPage}${ex.foundQuote ? `: "${ex.foundQuote}"` : ""}`);
      }
    }
    if (block.count > block.examples.length) {
      lines.push(`- … ${block.count - block.examples.length} more (truncated by grader)`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function renderFailureCountRow(counts: Map<GradeFailureKind, number>): string {
  return FAILURE_KIND_ORDER.filter((k) => (counts.get(k) ?? 0) > 0)
    .map((k) => `${k}: ${counts.get(k)}`)
    .join(", ");
}

export function renderEvalReport(summary: EvalRunSummary): string {
  const scored = [...summary.casesScored].sort((a, b) => a.caseId.localeCompare(b.caseId));
  const lines: string[] = [];

  lines.push("# Hive evaluation report");
  lines.push("");
  lines.push(`Source: ${summary.source}`);
  lines.push(`Split: ${summary.split}`);
  lines.push(`Cases scored: ${scored.length}`);
  lines.push(`Cases skipped: ${summary.skipped.length}`);
  lines.push(`Generated: ${summary.generatedIso}`);
  lines.push("");
  lines.push(`> ${summary.baselineNote}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Case | Score | Precision | Recall | Abstention | Provenance | Invariants | Failures |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |");

  for (const row of scored) {
    const m = row.grade.metrics;
    const inv = m.invariants;
    const failTotal = row.grade.failures.length;
    lines.push(
      `| ${row.caseId} | ${fmt(row.grade.score)} | ${fmt(m.precision)} | ${fmt(m.recall)} | ${fmt(m.abstention)} | ${fmt(m.provenance)} | ${inv} | ${failTotal} |`,
    );
  }

  lines.push("");
  lines.push("## Aggregate");
  lines.push("");

  if (scored.length > 0) {
    const metrics = scored.map((c) => c.grade.metrics);
    lines.push(`- mean score: ${fmt(mean(scored.map((c) => c.grade.score)))}`);
    lines.push(`- mean precision: ${fmt(mean(metrics.map((m) => m.precision)))}`);
    lines.push(`- mean recall: ${fmt(mean(metrics.map((m) => m.recall)))}`);
    lines.push(`- mean abstention: ${fmt(mean(metrics.map((m) => m.abstention)))}`);
    lines.push(`- mean provenance: ${fmt(mean(metrics.map((m) => m.provenance)))}`);
    const invPass = metrics.filter((m) => m.invariants === 1).length;
    lines.push(`- invariant pass: ${invPass} / ${scored.length}`);

    const aggFailures = new Map<GradeFailureKind, number>();
    for (const kind of FAILURE_KIND_ORDER) {
      aggFailures.set(kind, 0);
    }
    for (const c of scored) {
      for (const f of c.grade.failures) {
        aggFailures.set(f.kind, (aggFailures.get(f.kind) ?? 0) + 1);
      }
    }
    lines.push(`- total failures by kind: ${renderFailureCountRow(aggFailures) || "(none)"}`);
  } else {
    lines.push("- (no cases scored)");
  }

  for (const c of scored) {
    lines.push("");
    lines.push(`## ${c.caseId}`);
    lines.push("");
    lines.push(`- score: ${fmt(c.grade.score)}`);
    lines.push(`- precision: ${fmt(c.grade.metrics.precision)}`);
    lines.push(`- recall: ${fmt(c.grade.metrics.recall)}`);
    lines.push(`- abstention: ${fmt(c.grade.metrics.abstention)}`);
    lines.push(`- provenance: ${fmt(c.grade.metrics.provenance)}`);
    lines.push(`- invariants: ${c.grade.metrics.invariants}`);
    lines.push(`- baseline: \`${c.baselinePath}\``);
    if (c.baselineRunStatus) {
      lines.push(`- baseline runStatus: ${c.baselineRunStatus}`);
    }
    if (c.baselineValidationStatus) {
      lines.push(`- baseline validationStatus: ${c.baselineValidationStatus}`);
    }
    lines.push(`- accepted claims in baseline: ${c.acceptedClaimCount}`);
    lines.push(`- failures by kind: ${renderFailureCountRow(failureCounts(c.grade.failures)) || "(none)"}`);
    lines.push("");
    lines.push("### Grader feedback");
    lines.push("");
    lines.push(renderFeedback(c.grade.feedback) || "(no failures)");
  }

  if (summary.skipped.length > 0) {
    lines.push("");
    lines.push("## Skipped cases");
    lines.push("");
    for (const s of [...summary.skipped].sort((a, b) => a.caseId.localeCompare(b.caseId))) {
      lines.push(`- **${s.caseId}** (${s.reason})${s.detail ? `: ${s.detail}` : ""}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

export type ComparisonRow = {
  caseId: string;
  left: GradeMetrics & { score: number };
  right: GradeMetrics & { score: number };
};

export function renderComparisonReport(input: {
  leftSource: string;
  rightSource: string;
  split: string;
  generatedIso: string;
  rows: ComparisonRow[];
}): string {
  const rows = [...input.rows].sort((a, b) => a.caseId.localeCompare(b.caseId));
  const lines: string[] = [];
  lines.push("# Hive evaluation comparison");
  lines.push("");
  lines.push(`Left: ${input.leftSource}`);
  lines.push(`Right: ${input.rightSource}`);
  lines.push(`Split: ${input.split}`);
  lines.push(`Generated: ${input.generatedIso}`);
  lines.push("");
  lines.push("| Case | Δ score | Δ precision | Δ recall | Δ abstention | Δ provenance |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const r of rows) {
    lines.push(
      `| ${r.caseId} | ${fmt(r.right.score - r.left.score)} | ${fmt(r.right.precision - r.left.precision)} | ${fmt(r.right.recall - r.left.recall)} | ${fmt(r.right.abstention - r.left.abstention)} | ${fmt(r.right.provenance - r.left.provenance)} |`,
    );
  }
  lines.push("");
  lines.push("## Aggregate deltas (right − left)");
  lines.push("");
  if (rows.length > 0) {
    lines.push(`- Δ mean score: ${fmt(mean(rows.map((r) => r.right.score - r.left.score)))}`);
    lines.push(`- Δ mean precision: ${fmt(mean(rows.map((r) => r.right.precision - r.left.precision)))}`);
    lines.push(`- Δ mean recall: ${fmt(mean(rows.map((r) => r.right.recall - r.left.recall)))}`);
    lines.push(`- Δ mean abstention: ${fmt(mean(rows.map((r) => r.right.abstention - r.left.abstention)))}`);
    lines.push(`- Δ mean provenance: ${fmt(mean(rows.map((r) => r.right.provenance - r.left.provenance)))}`);
  }
  lines.push("");
  return lines.join("\n");
}

/** Strip Generated line for deterministic report body checks. */
export function stripGeneratedLine(markdown: string): string {
  return markdown.replace(/^Generated: .+$/m, "Generated: (redacted)");
}
