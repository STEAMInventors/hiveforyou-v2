import type {
  ProposalDomainPack,
  ProposalMatchingPolicy,
  ProposalMatchingPolicyDimension,
  ProposalRecordType,
} from "@hiveforyou/domain-pack/pack-driven-reader";

import type { DeclarativeFactType, DeclarativePackRaw, DeclarativeRelationship } from "./types.js";

function splitFactId(factId: string): { recordId: string; fieldId: string } {
  const dot = factId.indexOf(".");
  if (dot <= 0) {
    throw new Error(`invalid fact id ${factId}`);
  }
  return { recordId: factId.slice(0, dot), fieldId: factId.slice(dot + 1) };
}

function camelToSnake(value: string): string {
  return value.replace(/([A-Z])/g, "_$1").replace(/^_/, "").toLowerCase();
}

function mapValueKind(kind: string): ProposalRecordType["fields"][0]["valueKind"] {
  switch (kind) {
    case "number":
      return "number";
    case "date":
      return "date";
    case "boolean":
      return "boolean";
    case "code":
      return "code";
    default:
      return "text";
  }
}

function mapSources(fact: DeclarativeFactType): string[] {
  const allowed = fact.evidencePolicy?.allowedProvenance ?? ["quoted"];
  const mapped = allowed.map((item) => (item === "classified" ? "classified" : "quoted"));
  const unique = [...new Set(mapped)];
  if (unique.includes("classified") && !(fact.allowedUnits?.length ?? 0)) {
    return unique.filter((item) => item !== "classified");
  }
  return unique.length > 0 ? unique : ["quoted"];
}

function buildMatchingPolicy(raw: DeclarativePackRaw): Record<string, ProposalMatchingPolicy> {
  const byField = new Map<string, Set<ProposalMatchingPolicyDimension>>();
  const add = (fieldId: string, dimension: ProposalMatchingPolicyDimension) => {
    const set = byField.get(fieldId) ?? new Set<ProposalMatchingPolicyDimension>();
    set.add(dimension);
    byField.set(fieldId, set);
  };

  for (const rel of raw.relationships.relationships ?? []) {
    const require = new Set(rel.require ?? []);
    for (const fieldId of [...rel.from, ...rel.to]) {
      if (require.has("compatible_measure") || require.has("same_subject")) {
        add(fieldId, "construct");
      }
      if (require.has("same_value_and_unit") || require.has("compatible_measure")) {
        add(fieldId, "unit");
      }
      if (require.has("plan_scope") || require.has("compatible_area") || require.has("supported_link")) {
        add(fieldId, "context");
      }
      if (require.has("same_observation") || require.has("baseline_role_not_postbaseline_progress")) {
        add(fieldId, "temporal");
      }
      if (require.has("no_value_only_match") || require.has("distinct_goal_and_measurement_identity")) {
        add(fieldId, "construct");
        add(fieldId, "context");
        add(fieldId, "unit");
      }
    }
  }

  const output: Record<string, ProposalMatchingPolicy> = {};
  for (const [fieldId, dimensions] of byField) {
    output[fieldId] = {
      requiredDimensions: [...dimensions].sort() as ProposalMatchingPolicyDimension[],
    };
  }
  return output;
}

function buildConstructs(raw: DeclarativePackRaw): ProposalDomainPack["constructs"] {
  const constructs: NonNullable<ProposalDomainPack["constructs"]> = {};
  const factsByRecord = new Map<string, DeclarativeFactType[]>();
  for (const fact of raw.factTypes.factTypes) {
    const { recordId } = splitFactId(fact.id);
    const list = factsByRecord.get(recordId) ?? [];
    list.push(fact);
    factsByRecord.set(recordId, list);
  }

  for (const [recordId, facts] of factsByRecord) {
    const fieldIds = facts.map((fact) => splitFactId(fact.id).fieldId);
    const requiredFields = fieldIds.filter((fieldId) =>
      ["value", "statement", "area", "task", "score_type", "unit", "observed_on", "baseline_value"].includes(
        fieldId,
      ),
    );
    if (requiredFields.length === 0) {
      continue;
    }
    constructs[recordId] = {
      requiredFields,
      comparedIfBothPresent: fieldIds.filter((fieldId) =>
        ["task", "score_type", "area", "context", "instrument"].includes(fieldId),
      ),
      seriesRestatementPolicy:
        recordId === "measurement"
          ? {
              eventIdentityFieldIds: ["measurement.observed_on"],
              allowExplicitRestatementCorroboration: true,
            }
          : undefined,
    };
  }
  return constructs;
}

function mapInsightChecks(raw: DeclarativePackRaw): ProposalDomainPack["insightChecks"] {
  const enginePrimitives = new Set<string>();
  const checks: NonNullable<ProposalDomainPack["insightChecks"]>["checks"] = [];

  for (const check of raw.insightChecks.insightChecks ?? []) {
    if (check.primitive === "missing") {
      enginePrimitives.add("absenceOf");
      const [presentFact, absentFact] = check.inputs;
      if (!presentFact || !absentFact) {
        continue;
      }
      const present = splitFactId(presentFact);
      const absent = splitFactId(absentFact);
      checks.push({
        id: check.id,
        primitive: "absenceOf",
        present: { record: present.recordId, field: presentFact },
        absent: { record: absent.recordId, field: absentFact },
        question: check.questionTemplate,
      });
      continue;
    }
    if (check.primitive === "series") {
      enginePrimitives.add("series");
      checks.push({
        id: check.id,
        primitive: "series",
        question: check.questionTemplate,
      });
    }
  }

  return {
    enginePrimitivesRequired: [...enginePrimitives].sort(),
    checks,
  };
}

function buildRecordTypes(raw: DeclarativePackRaw): ProposalRecordType[] {
  const byRecord = new Map<string, DeclarativeFactType[]>();
  for (const fact of raw.factTypes.factTypes) {
    const { recordId } = splitFactId(fact.id);
    const list = byRecord.get(recordId) ?? [];
    list.push(fact);
    byRecord.set(recordId, list);
  }

  const constructs = buildConstructs(raw) ?? {};
  const recordTypes: ProposalRecordType[] = [];

  for (const [recordId, facts] of [...byRecord.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const keyFields = new Set<string>();
    let scope = "document";
    const repeatable = facts.some((fact) => fact.multiplicity === "multiple");
    for (const fact of facts) {
      for (const key of fact.identity?.keys ?? []) {
        const fieldKey = camelToSnake(key);
        const matched = facts.find((candidate) => splitFactId(candidate.id).fieldId === fieldKey);
        if (matched) {
          keyFields.add(matched.id);
        }
      }
      if (fact.identity?.scope?.includes("caseId")) {
        scope = "case";
      }
    }

    const fields = facts
      .map((fact) => {
        const { fieldId: fieldSuffix } = splitFactId(fact.id);
        const sources = mapSources(fact);
        const field: ProposalRecordType["fields"][0] = {
          id: fact.id,
          valueKind: mapValueKind(fact.valueKind),
          source: sources,
          modality: ["observed"],
        };
        if (fact.assertionSemantics === "explicit_denial") {
          field.comparison = "none";
        } else if (["value", "baseline_value", "target_value"].includes(fieldSuffix)) {
          field.comparison = "value";
        }
        if (sources.includes("classified") && fact.allowedUnits?.length) {
          field.enum = [...fact.allowedUnits];
        }
        return field;
      })
      .sort((a, b) => a.id.localeCompare(b.id));

    recordTypes.push({
      id: recordId,
      repeatable,
      usesConstructs: constructs[recordId] ? [recordId] : undefined,
      identity: {
        scope,
        keyFields: [...keyFields].sort(),
        versionAxis: "document.orderingDate",
        crossDocumentMerge:
          recordId === "measurement" || recordId === "assessment" ? "independent_assertions" : "version",
      },
      fields,
    });
  }

  return recordTypes;
}

function checklistRecordIdsForDocument(checklist: Array<{ factTypeId: string }>): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const item of checklist) {
    const { recordId } = splitFactId(item.factTypeId);
    if (!seen.has(recordId)) {
      seen.add(recordId);
      ordered.push(recordId);
    }
  }
  return ordered;
}

function readingNotesFromRaw(raw: DeclarativePackRaw): ProposalDomainPack["readingNotes"] {
  const global = Array.isArray(raw.readingNotes.global)
    ? raw.readingNotes.global.join("\n")
    : String(raw.readingNotes.global ?? "");
  const byDocumentType: Record<string, string> = {};
  for (const [docTypeId, notes] of Object.entries(raw.readingNotes.documentSpecific ?? {})) {
    byDocumentType[docTypeId] = notes.join("\n");
  }
  return { global, byDocumentType };
}

export function compileDeclarativePackToProposal(raw: DeclarativePackRaw): ProposalDomainPack {
  return {
    schemaVersion: "hive.domain-pack.declarative-compiled/0.2.1",
    status: "compiled_from_declarative",
    manifest: {
      id: raw.manifest.id,
      version: raw.manifest.packVersion,
      name: raw.manifest.name,
    },
    documentTypes: (raw.documentTypes.documentTypes ?? []).map((doc) => ({
      id: doc.id,
      label: doc.label,
      discoverLabels: doc.recognitionHints,
      checklist: checklistRecordIdsForDocument(doc.checklist),
      checklistPolicy: "look_for_all_listed; never_invent_if_absent; extract_other_pack_records_if_found",
      orderingDate: "document.date",
    })),
    recordTypes: buildRecordTypes(raw),
    readingNotes: readingNotesFromRaw(raw),
    constructs: buildConstructs(raw),
    relationshipRules: {
      changeRequiresTemporalSuccession: true,
      temporalSuccessionFieldIds: [
        "document.effective_start",
        "document.effective_end",
        "measurement.observed_on",
        "document.date",
      ],
      conflictWhenDifferentParties: true,
      unchangedRequiresLogicalSuccession: true,
      matchingPolicyByFieldId: buildMatchingPolicy(raw),
    },
    seriesObservationDateFieldIds: [
      "measurement.observed_on",
      "measurement.reporting_period_start",
      "measurement.reporting_period_end",
      "document.date",
    ],
    seriesOrderingDateFallback: false,
    requirements: { rules: [] },
    insightChecks: mapInsightChecks(raw),
    vocabulary: {
      note: "Compiled from declarative vocabulary.json; abbreviations applied at reader prompt compile time.",
    },
    plainExplainers: raw.plainExplainers,
    referenceTables: raw.referenceTables as ProposalDomainPack["referenceTables"],
  };
}

export function declarativeRelationshipsForDiagnostics(raw: DeclarativePackRaw): DeclarativeRelationship[] {
  return raw.relationships.relationships ?? [];
}
