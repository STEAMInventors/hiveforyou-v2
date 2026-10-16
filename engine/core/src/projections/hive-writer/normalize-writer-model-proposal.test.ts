import { describe, expect, it } from "vitest";

import { parseHiveWriterProposal } from "@hiveforyou/shared/hive-writer-proposal";

import { projectCanonicalStudyReport } from "../project-canonical-study-report.js";
import { buildDeterministicHiveUiTree } from "../build-deterministic-hive-ui-tree.js";
import { assertHiveUiTree, HiveUiTreeValidationError } from "../validate-hive-ui-tree.js";
import { CANONICAL_STUDY_DEBUG_PACK_APPROVAL } from "../../study/resolve-approved-proposal-domain-pack.js";
import {
  buildSyntheticFoundation,
  mockPages,
  planGoalDoc,
  SYNTHETIC_PACK,
} from "../../study/canonical-study/test-fixtures.js";
import { buildCanonicalStudy } from "../../study/canonical-study/index.js";

import {
  buildHiveWriterPresentationBinding,
} from "./build-hive-writer-model-input.js";
import { resolveHiveWriterDomainBinding } from "./resolve-hive-writer-domain-binding.js";
import {
  normalizeWriterModelElementArrayToMap,
  normalizeWriterModelProposalBeforeValidation,
  WriterModelProposalNormalizationError,
} from "./normalize-writer-model-proposal.js";

const PACK_SHA = "a".repeat(64);

function buildSampleContext() {
  const foundation = buildSyntheticFoundation({
    documents: [
      {
        sourceDocumentId: "plan-a",
        pages: mockPages("plan-a", 1, "reading Read fluently"),
        parsedModelJson: planGoalDoc("plan-a", "doc.plan", "Read fluently", "2024-01-01"),
      },
    ],
  });
  const artifact = buildCanonicalStudy({
    pack: SYNTHETIC_PACK,
    packContentSha256: PACK_SHA,
    foundation,
    studyRunId: "study-run-test",
    caseId: "case-test",
  });
  const projection = projectCanonicalStudyReport({
    artifact,
    audience: "customer",
    customerProReportsPermitted: false,
    packApprovalLabel: CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
  });
  const tree = buildDeterministicHiveUiTree(projection)!;
  return { artifact, projection, tree };
}

function treeToWriterArrayProposal(
  artifact: ReturnType<typeof buildCanonicalStudy>,
  projection: ReturnType<typeof projectCanonicalStudyReport>,
  tree: NonNullable<ReturnType<typeof buildDeterministicHiveUiTree>>,
) {
  return {
    schemaVersion: "hive-writer-proposal/1",
    domainBinding: resolveHiveWriterDomainBinding({ artifact, projection }),
    presentationBinding: buildHiveWriterPresentationBinding(projection),
    hiveUiTree: {
      ...tree,
      elements: Object.entries(tree.elements).map(([id, element]) => ({
        id,
        ...element,
      })),
    },
    writerMetadata: { writerImplementationVersion: "1" },
  };
}

describe("normalizeWriterModelProposalBeforeValidation", () => {
  it("normalizes element array to canonical map keyed by id", () => {
    const { artifact, projection, tree } = buildSampleContext();
    const raw = treeToWriterArrayProposal(artifact, projection, tree);
    const normalized = normalizeWriterModelProposalBeforeValidation(raw) as typeof raw;
    expect(Array.isArray(normalized.hiveUiTree.elements)).toBe(false);
    expect(normalized.hiveUiTree.elements).toEqual(tree.elements);
  });

  it("rejects duplicate element ids", () => {
    expect(() =>
      normalizeWriterModelElementArrayToMap([
        { id: "a", type: "ReportRoot", props: {} },
        { id: "a", type: "StorySection", props: { sectionId: "s1" } },
      ]),
    ).toThrow(WriterModelProposalNormalizationError);
  });

  it("rejects missing element id", () => {
    expect(() =>
      normalizeWriterModelElementArrayToMap([{ type: "ReportRoot", props: {} }]),
    ).toThrow(WriterModelProposalNormalizationError);
  });

  it("passes map-shaped elements through unchanged", () => {
    const { tree } = buildSampleContext();
    const raw = { hiveUiTree: tree };
    expect(normalizeWriterModelProposalBeforeValidation(raw)).toEqual(raw);
  });

  it("accepts normalized proposal through Zod and hive-ui-tree validation", () => {
    const { artifact, projection, tree } = buildSampleContext();
    const normalized = normalizeWriterModelProposalBeforeValidation(
      treeToWriterArrayProposal(artifact, projection, tree),
    );
    const proposal = parseHiveWriterProposal(normalized);
    expect(() => assertHiveUiTree(artifact, projection, proposal.hiveUiTree)).not.toThrow();
  });

  it("rejects missing child references after normalization", () => {
    const { artifact, projection, tree } = buildSampleContext();
    const raw = treeToWriterArrayProposal(artifact, projection, tree);
    const root = raw.hiveUiTree.elements.find((entry) => entry.id === raw.hiveUiTree.root);
    root!.children = [...(root!.children ?? []), "missing-child"];
    const normalized = normalizeWriterModelProposalBeforeValidation(raw);
    const proposal = parseHiveWriterProposal(normalized);
    expect(() => assertHiveUiTree(artifact, projection, proposal.hiveUiTree)).toThrow(
      HiveUiTreeValidationError,
    );
  });

  it("rejects unknown component types after normalization", () => {
    const { artifact, projection, tree } = buildSampleContext();
    const raw = treeToWriterArrayProposal(artifact, projection, tree);
    raw.hiveUiTree.elements.push({
      id: "rogue",
      type: "NotAComponent" as "ReportRoot",
      props: {},
    });
    const normalized = normalizeWriterModelProposalBeforeValidation(raw);
    const proposal = parseHiveWriterProposal(normalized);
    expect(() => assertHiveUiTree(artifact, projection, proposal.hiveUiTree)).toThrow(
      HiveUiTreeValidationError,
    );
  });

  it("rejects invalid props after normalization", () => {
    const { artifact, projection, tree } = buildSampleContext();
    const raw = treeToWriterArrayProposal(artifact, projection, tree);
    const fact = raw.hiveUiTree.elements.find((entry) => entry.type === "FactRow");
    fact!.props = { displayText: "forbidden narrative" } as typeof fact.props;
    const normalized = normalizeWriterModelProposalBeforeValidation(raw);
    const proposal = parseHiveWriterProposal(normalized);
    expect(() => assertHiveUiTree(artifact, projection, proposal.hiveUiTree)).toThrow(
      HiveUiTreeValidationError,
    );
  });

  it("rejects invalid claim references after normalization", () => {
    const { artifact, projection, tree } = buildSampleContext();
    const raw = treeToWriterArrayProposal(artifact, projection, tree);
    const fact = raw.hiveUiTree.elements.find((entry) => entry.type === "FactRow");
    fact!.props = {
      claimRef: { fieldKey: "does-not-exist-in-canonical" },
    } as typeof fact.props;
    const normalized = normalizeWriterModelProposalBeforeValidation(raw);
    const proposal = parseHiveWriterProposal(normalized);
    expect(() => assertHiveUiTree(artifact, projection, proposal.hiveUiTree)).toThrow(
      HiveUiTreeValidationError,
    );
  });
});
