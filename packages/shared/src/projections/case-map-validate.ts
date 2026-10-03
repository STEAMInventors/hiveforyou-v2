import type { CaseMap } from "./case-map";
import { CASE_MAP_ATTENTION_KINDS, CASE_MAP_NODE_KINDS, CASE_MAP_SCHEMA } from "./case-map";

export type CaseMapValidationIssue = { path: string; message: string };

export function validateCaseMap(input: unknown): {
  ok: boolean;
  issues: CaseMapValidationIssue[];
  value?: CaseMap;
} {
  const issues: CaseMapValidationIssue[] = [];
  if (!input || typeof input !== "object") {
    return { ok: false, issues: [{ path: "", message: "Expected object" }] };
  }
  const map = input as CaseMap;
  if (map.schemaVersion !== CASE_MAP_SCHEMA) {
    issues.push({ path: "schemaVersion", message: "Invalid schema version" });
  }
  if (!map.caseId?.trim()) {
    issues.push({ path: "caseId", message: "Required" });
  }
  if (!map.studyRunId?.trim()) {
    issues.push({ path: "studyRunId", message: "Required" });
  }
  if (!Number.isInteger(map.intelligenceVersion) || map.intelligenceVersion < 1) {
    issues.push({ path: "intelligenceVersion", message: "Invalid version" });
  }
  if (!map.rootNodeId?.trim()) {
    issues.push({ path: "rootNodeId", message: "Required" });
  }
  if (!Array.isArray(map.nodes)) {
    issues.push({ path: "nodes", message: "Must be array" });
    return { ok: false, issues };
  }
  const nodeIds = new Set<string>();
  for (const [index, node] of map.nodes.entries()) {
    if (!node.id?.trim()) {
      issues.push({ path: `nodes[${index}].id`, message: "Required" });
    } else if (nodeIds.has(node.id)) {
      issues.push({ path: `nodes[${index}].id`, message: "Duplicate node id" });
    } else {
      nodeIds.add(node.id);
    }
    if (!CASE_MAP_NODE_KINDS.includes(node.kind)) {
      issues.push({ path: `nodes[${index}].kind`, message: "Invalid kind" });
    }
    if (!node.label?.trim()) {
      issues.push({ path: `nodes[${index}].label`, message: "Required label" });
    }
    if (node.kind === "fact" || node.kind === "decision") {
      if (!node.claimIds?.length) {
        issues.push({ path: `nodes[${index}].claimIds`, message: "Fact nodes require claimIds" });
      }
    }
    if (node.kind === "ghost" && !node.unresolvedId?.trim()) {
      issues.push({ path: `nodes[${index}].unresolvedId`, message: "Ghost requires unresolvedId" });
    }
  }
  if (!nodeIds.has(map.rootNodeId)) {
    issues.push({ path: "rootNodeId", message: "Root node missing from nodes" });
  }
  if (!Array.isArray(map.edges)) {
    issues.push({ path: "edges", message: "Must be array" });
  } else {
    for (const [index, edge] of map.edges.entries()) {
      if (!edge.id?.trim()) {
        issues.push({ path: `edges[${index}].id`, message: "Required" });
      }
      if (!nodeIds.has(edge.fromNodeId)) {
        issues.push({ path: `edges[${index}].fromNodeId`, message: "Unknown node" });
      }
      if (!nodeIds.has(edge.toNodeId)) {
        issues.push({ path: `edges[${index}].toNodeId`, message: "Unknown node" });
      }
    }
  }
  if (!Array.isArray(map.attention)) {
    issues.push({ path: "attention", message: "Must be array" });
  } else {
    for (const [index, item] of map.attention.entries()) {
      if (!CASE_MAP_ATTENTION_KINDS.includes(item.kind)) {
        issues.push({ path: `attention[${index}].kind`, message: "Invalid kind" });
      }
    }
  }
  if (!Array.isArray(map.chronology)) {
    issues.push({ path: "chronology", message: "Must be array" });
  }
  return issues.length ? { ok: false, issues } : { ok: true, issues: [], value: map };
}
