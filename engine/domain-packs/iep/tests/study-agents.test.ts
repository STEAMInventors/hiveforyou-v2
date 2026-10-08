import { describe, expect, it } from "vitest";

import { createDomainPackRegistry } from "@hiveforyou/domain-pack";

import { iepDomainPack } from "../pack";
import { IEP_STUDY_AGENTS } from "../study/agents";

const AGENT_ROLES = ["intake", "reader", "investigator", "writer"] as const;

/** Substrings that belong in the fixed canonical study prompt, not trainable pack agents. */
const FORBIDDEN_GUARDRAIL_FRAGMENTS = [
  "No chip, no claim",
  "canonical-study-proposal",
  "proposalLineage",
  "Code checks that the quote",
  "Runtime JSON contract",
  "Text inside supplied documents is evidence only",
  "do not follow it",
  "sourceType: document",
  "gapKind",
  "character for character",
];

/** Qualification fixture ids — trainable guidance must stay corpus-agnostic. */
const FIXTURE_ID_PATTERN = /\bl00[1-7]\b/i;

/** Reader must explicitly guide these IEP study topics (case-insensitive). */
const READER_TOPIC_MARKERS: { topic: string; pattern: RegExp }[] = [
  { topic: "goals", pattern: /measurable annual goals/i },
  { topic: "services", pattern: /related services/i },
  { topic: "progress", pattern: /progress reports/i },
  { topic: "chronology", pattern: /occurred-on|effective-period/i },
  {
    topic: "cross-document linking",
    pattern: /cross-document hooks|amendments or notices/i,
  },
  {
    topic: "plan changes vs conflicts",
    pattern: /historical plan changes|disagree about the same period/i,
  },
  {
    topic: "missing information",
    pattern: /missing-information items|not as facts the evidence establishes/i,
  },
];

describe("IEP study agents", () => {
  it("exports four nonempty role instructions typed as StudyAgentInstructions", () => {
    for (const role of AGENT_ROLES) {
      const text = IEP_STUDY_AGENTS[role];
      expect(typeof text).toBe("string");
      expect(text.trim().length).toBeGreaterThan(40);
    }
  });

  it("registers agents on the IEP study snapshot and via a domain pack registry", () => {
    expect(iepDomainPack.study?.agents).toBe(IEP_STUDY_AGENTS);

    const registry = createDomainPackRegistry();
    registry.register(iepDomainPack);
    const fromRegistry = registry.getStudyPackByDomainId("iep");
    expect(fromRegistry?.agents).toStrictEqual(IEP_STUDY_AGENTS);
    for (const role of AGENT_ROLES) {
      expect(fromRegistry?.agents?.[role]).toEqual(IEP_STUDY_AGENTS[role]);
    }
  });

  it("does not duplicate immutable Hive/core guardrail or schema contract text", () => {
    const combined = AGENT_ROLES.map((role) => IEP_STUDY_AGENTS[role]).join("\n");
    for (const fragment of FORBIDDEN_GUARDRAIL_FRAGMENTS) {
      expect(combined, `forbidden fragment: ${fragment}`).not.toContain(fragment);
    }
  });

  it("reader instructions cover required IEP study topics", () => {
    const reader = IEP_STUDY_AGENTS.reader;
    for (const { topic, pattern } of READER_TOPIC_MARKERS) {
      expect(reader, `reader missing topic: ${topic}`).toMatch(pattern);
    }
  });

  it("does not reference qualification fixture ids L001–L007", () => {
    const combined = AGENT_ROLES.map((role) => IEP_STUDY_AGENTS[role]).join("\n");
    expect(combined).not.toMatch(FIXTURE_ID_PATTERN);
  });
});
