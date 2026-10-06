import { stableJson } from "./prompt-hash.ts";
import type { ExpectedGolden } from "./normalize-expected.ts";

export type SectionDiff = {
  section: keyof ExpectedGolden;
  added: string[];
  removed: string[];
  changed: string[];
};

export type DiffResult = {
  equal: boolean;
  sections: SectionDiff[];
};

function sectionKeys(section: keyof ExpectedGolden, value: unknown): string[] {
  if (section === "documents") {
    return Object.keys(value as ExpectedGolden["documents"]).sort();
  }
  if (section === "drops") {
    return Object.keys(value as ExpectedGolden["drops"]).sort();
  }
  if (section === "facts") {
    return (value as ExpectedGolden["facts"]).map((f) => f.key).sort();
  }
  if (section === "findings") {
    return (value as ExpectedGolden["findings"]).map((f) => f.key).sort();
  }
  if (section === "multiSourceFacts") {
    return (value as ExpectedGolden["multiSourceFacts"]).keys.slice().sort();
  }
  if (section === "coverage") {
    const cov = value as ExpectedGolden["coverage"];
    return [`${cov.covered}/${cov.total}`, ...cov.uncovered.map((u) => u.claimId)].sort();
  }
  return [];
}

function sectionEntry(section: keyof ExpectedGolden, expected: ExpectedGolden, key: string): unknown {
  if (section === "documents") {
    return expected.documents[key];
  }
  if (section === "drops") {
    return expected.drops[key];
  }
  if (section === "facts") {
    return expected.facts.find((f) => f.key === key);
  }
  if (section === "findings") {
    return expected.findings.find((f) => f.key === key);
  }
  if (section === "multiSourceFacts") {
    if (key === `${expected.multiSourceFacts.count}`) {
      return expected.multiSourceFacts.count;
    }
    return expected.multiSourceFacts.keys.includes(key) ? key : undefined;
  }
  if (section === "coverage") {
    if (key.includes("/")) {
      return `${expected.coverage.covered}/${expected.coverage.total}`;
    }
    return expected.coverage.uncovered.find((u) => u.claimId === key);
  }
  return undefined;
}

export function diffExpected(actual: ExpectedGolden, expected: ExpectedGolden): DiffResult {
  if (stableJson(actual) === stableJson(expected)) {
    return { equal: true, sections: [] };
  }

  const sections: SectionDiff[] = [];
  const sectionNames: Array<keyof ExpectedGolden> = [
    "documents",
    "drops",
    "facts",
    "multiSourceFacts",
    "findings",
    "coverage",
  ];

  for (const section of sectionNames) {
    const aKeys = new Set(sectionKeys(section, actual[section]));
    const eKeys = new Set(sectionKeys(section, expected[section]));
    const added = [...aKeys].filter((k) => !eKeys.has(k)).sort();
    const removed = [...eKeys].filter((k) => !aKeys.has(k)).sort();
    const changed: string[] = [];
    for (const key of [...aKeys].filter((k) => eKeys.has(k)).sort()) {
      const aEntry = sectionEntry(section, actual, key);
      const eEntry = sectionEntry(section, expected, key);
      if (stableJson(aEntry) !== stableJson(eEntry)) {
        changed.push(key);
      }
    }
    if (section === "multiSourceFacts" && actual.multiSourceFacts.count !== expected.multiSourceFacts.count) {
      changed.push("count");
    }
    if (
      section === "coverage" &&
      (actual.coverage.covered !== expected.coverage.covered ||
        actual.coverage.total !== expected.coverage.total)
    ) {
      changed.push("summary");
    }
    if (added.length > 0 || removed.length > 0 || changed.length > 0) {
      sections.push({ section, added, removed, changed });
    }
  }

  return { equal: false, sections };
}

export function formatDiffSummary(diff: DiffResult): string {
  if (diff.equal) {
    return "Golden match: all sections identical.";
  }
  const lines = ["Golden diff summary:"];
  for (const section of diff.sections) {
    lines.push(`  [${section.section}]`);
    if (section.added.length) {
      lines.push(`    added (${section.added.length}): ${section.added.slice(0, 8).join(", ")}`);
    }
    if (section.removed.length) {
      lines.push(`    removed (${section.removed.length}): ${section.removed.slice(0, 8).join(", ")}`);
    }
    if (section.changed.length) {
      lines.push(`    changed (${section.changed.length}): ${section.changed.slice(0, 8).join(", ")}`);
    }
  }
  return lines.join("\n");
}
