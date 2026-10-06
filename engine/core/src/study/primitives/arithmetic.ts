import type { AssembledDocument } from "../../document/assembly";
import { normalizeMoney } from "../../atoms/normalize";
import type { Statement } from "../../atoms/types";
import type { StudyFinding } from "./types";

let findingSeq = 0;

function nextFindingId(): string {
  findingSeq += 1;
  return `finding-arithmetic-${findingSeq}`;
}

export function arithmeticFindings(input: {
  assembled: AssembledDocument;
  statements: Statement[];
}): StudyFinding[] {
  findingSeq = 0;
  const findings: StudyFinding[] = [];
  const tableIds = new Set(
    input.assembled.blocks.filter((b) => b.kind === "table").map((b) => b.id),
  );

  for (const block of input.assembled.blocks) {
    if (!block.parentBlockId || !tableIds.has(block.parentBlockId)) {
      continue;
    }
    const firstCell = block.segments[0]?.text.trim() ?? "";
    if (!/^totals?$/i.test(firstCell)) {
      continue;
    }
    const numbers = block.segments
      .slice(1)
      .map((s) => normalizeMoney(s.text))
      .filter((n): n is number => n != null);
    if (numbers.length < 2) {
      continue;
    }
    const sum = numbers.slice(0, -1).reduce((acc, n) => acc + n, 0);
    const total = numbers[numbers.length - 1]!;
    if (Math.abs(sum - total) > 0.01) {
      findings.push({
        id: nextFindingId(),
        kind: "conflict",
        basis: "arithmetic",
        grade: null,
        statementIds: [],
        evidence: [],
        detail: `Totals row mismatch on ${block.documentId} page ${block.pageNumber}`,
      });
    } else {
      findings.push({
        id: nextFindingId(),
        kind: "fact",
        basis: "arithmetic",
        grade: null,
        statementIds: [],
        evidence: [],
        detail: `Totals row reconciles on ${block.documentId} page ${block.pageNumber}`,
      });
    }
  }

  return findings;
}
