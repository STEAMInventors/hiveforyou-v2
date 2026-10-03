import type { Study, StudyGoalRow, StudyReevalMeasureClause } from "@hiveforyou/shared/pack-study";

export function buildGoalMetClause(goalMet: boolean | null): string | null {
  if (goalMet === null) {
    return null;
  }
  if (goalMet) {
    return "";
  }
  return ", but the report marked the goal as not met";
}

function formatGoalSpan(row: StudyGoalRow): string {
  const baseline = row.baseline?.display ?? "?";
  const target = row.target?.display ?? "?";
  return `${baseline} → ${target}`;
}

export function buildGoalsDiffClause(study: Study): string | null {
  const priorSkills = new Set(study.goals.prior.map((g) => g.skill.toLowerCase()));
  const currentSkills = new Set(study.goals.current.map((g) => g.skill.toLowerCase()));
  const dropped = study.goals.prior.filter((g) => !currentSkills.has(g.skill.toLowerCase()));
  const added = study.goals.current.filter((g) => !priorSkills.has(g.skill.toLowerCase()));

  const parts: string[] = [];
  if (dropped.length) {
    const labels = dropped.map((g) => g.skill).join(" and ");
    parts.push(`drops the ${labels} goal${dropped.length > 1 ? "s" : ""}`);
  }
  if (added.length) {
    const labels = added
      .map((g) => `${g.skill} goal (${formatGoalSpan(g)})`)
      .join(" and ");
    parts.push(`adds ${labels}`);
  }
  if (!parts.length) {
    return null;
  }
  if (parts.length === 1) {
    return parts[0]!;
  }
  return `${parts[0]} and ${parts[1]}`;
}

export function buildReevalSummary(measures: StudyReevalMeasureClause[]): string | null {
  if (!measures.length) {
    return null;
  }
  const directions = new Set(measures.map((m) => m.direction));
  const joiner = directions.size > 1 ? ", but " : ", ";
  return measures.map((m) => m.text).join(joiner);
}
