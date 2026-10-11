// Structural validator for a Hive domain pack (proposal schema 0.3).
// Usage: node validate-pack.js <pack.json> [review-check.json]
// Checks referential integrity and the identity rules. It does not certify legal content.
import * as fs from "fs";

type Json = any;
const [packPath, outPath] = process.argv.slice(2);
const pack: Json = JSON.parse(fs.readFileSync(packPath, "utf8"));
const errors: string[] = [];
const warnings: string[] = [];
const err = (m: string) => errors.push(m);

const records = new Map<string, Json>();
for (const r of pack.recordTypes) {
  if (records.has(r.id)) err(`duplicate record type ${r.id}`);
  records.set(r.id, r);
}
const docTypes = new Map<string, Json>();
for (const d of pack.documentTypes) {
  if (docTypes.has(d.id)) err(`duplicate document type ${d.id}`);
  docTypes.set(d.id, d);
}
const roles = new Set<string>(pack.authorRoles.map((a: Json) => a.id));
const fieldIds = (r: Json) => new Set<string>(r.fields.map((f: Json) => f.id));

// Resolve "record.field" or "record.field.sub" against the pack.
function hasPath(path: string): boolean {
  const [rec, ...rest] = path.split(".");
  const r = records.get(rec);
  if (!r) return false;
  const ids = fieldIds(r);
  for (let n = rest.length; n > 0; n--) if (ids.has(rest.slice(0, n).join("."))) return true;
  return false;
}
const hasField = (rec: string, field: string) => !!records.get(rec) && fieldIds(records.get(rec)).has(field);

// Record types: fields, keys, sources, constructs
const FORBIDDEN_KEY = /^(plan|document|document_id|plan_id|case)$/;
let keyCount = 0;
for (const r of pack.recordTypes) {
  const ids = fieldIds(r);
  if (ids.size !== r.fields.length) err(`${r.id}: duplicate field ids`);
  const id = r.identity;
  if (!id?.versionAxis) err(`${r.id}: no versionAxis`);
  for (const k of [...id.keyFields, ...id.keyFieldsIfPresent, ...id.disambiguators]) {
    if (!ids.has(k)) err(`${r.id}: key or disambiguator '${k}' is not a field`);
    if (FORBIDDEN_KEY.test(k)) err(`${r.id}: key '${k}' is a version axis, not content`);
  }
  if (id.keyFields.length) keyCount++;
  else if (r.repeatable && id.scope !== "document") warnings.push(`${r.id}: repeatable with empty key`);
  for (const f of r.fields) {
    if (f.source.includes("classified") && !f.enum) err(`${r.id}.${f.id}: classified without enum`);
    if (f.source.includes("derived")) {
      if (!f.derivation) err(`${r.id}.${f.id}: derived without derivation`);
      else for (const o of f.derivation.operands)
        if (!ids.has(o) && !hasPath(o)) err(`${r.id}.${f.id}: derivation operand '${o}' not found`);
    }
  }
  for (const c of r.usesConstructs ?? []) {
    const con = pack.constructs[c];
    if (!con) { err(`${r.id}: unknown construct ${c}`); continue; }
    for (const f of [...con.requiredFields, ...con.comparedIfBothPresent])
      if (!ids.has(`${c}.${f}`)) err(`${r.id}: construct ${c} needs field ${c}.${f}`);
  }
}

// Document types
for (const d of pack.documentTypes) {
  if (!roles.has(d.authorRole)) err(`${d.id}: unknown author role ${d.authorRole}`);
  if (!d.orderingDate || !hasPath(d.orderingDate)) err(`${d.id}: ordering date '${d.orderingDate}' not found`);
  for (const c of d.checklist) if (!records.has(c)) err(`${d.id}: checklist record ${c} unknown`);
  if (d.amends && !docTypes.has(d.amends)) err(`${d.id}: amends unknown ${d.amends}`);
}
// Where a record is expected comes only from checklists (one source of truth).
for (const rid of records.keys())
  if (!pack.documentTypes.some((d: Json) => d.checklist.includes(rid))) err(`${rid}: in no document checklist`);

// Requirements
for (const rule of pack.requirements.rules) {
  for (const c of rule.checks) {
    if (!records.has(c.record)) err(`requirement ${rule.id}: unknown record ${c.record}`);
    for (const f of c.fields ?? []) if (!hasField(c.record, f)) err(`requirement ${rule.id}: ${c.record}.${f} not found`);
  }
  const w = rule.when;
  if (w?.record && !hasField(w.record, w.field)) err(`requirement ${rule.id}: when ${w.record}.${w.field} not found`);
  for (const p of [w?.birthDate, w?.onDate].filter(Boolean)) if (!hasPath(p)) err(`requirement ${rule.id}: when path ${p} not found`);
  if (!rule.citation || !rule.jurisdiction || !rule.sourceEffectiveDate) err(`requirement ${rule.id}: missing citation, jurisdiction or date`);
}

// Insight checks: every {record, field} reference resolves; primitives declared
const prims = new Set<string>(pack.insightChecks.enginePrimitivesRequired);
function walkRefs(o: Json, where: string) {
  if (Array.isArray(o)) return o.forEach((x) => walkRefs(x, where));
  if (o && typeof o === "object") {
    if (typeof o.record === "string" && typeof o.field === "string" && !hasField(o.record, o.field))
      err(`${where}: ${o.record}.${o.field} not found`);
    if (typeof o.record === "string" && typeof o.unitField === "string" && !hasField(o.record, o.unitField))
      err(`${where}: ${o.record}.${o.unitField} not found`);
    Object.values(o).forEach((x) => walkRefs(x, where));
  }
}
for (const c of pack.insightChecks.checks) {
  if (!prims.has(c.primitive)) err(`check ${c.id}: primitive ${c.primitive} not declared`);
  walkRefs(c, `check ${c.id}`);
}
for (const r of pack.recordTypes) for (const f of r.fields)
  if (f.derivation && !prims.has(f.derivation.primitive)) err(`${r.id}.${f.id}: primitive ${f.derivation.primitive} not declared`);

// Other sections
for (const k of Object.keys(pack.plainExplainers.byRecordType)) if (!records.has(k)) err(`explainer for unknown record ${k}`);
for (const k of Object.keys(pack.readingNotes.byDocumentType)) if (!docTypes.has(k)) err(`reading note for unknown document type ${k}`);
for (const s of pack.vocabulary.fieldSynonyms) {
  const [rec, ...rest] = s.field.split(".");
  if (!hasField(rec, rest.join(".")) && !(rec === "measure" && Object.keys(pack.constructs).includes("measure")))
    err(`vocabulary synonym field ${s.field} not found`);
}
const noteChars = JSON.stringify(pack.readingNotes.global).length + JSON.stringify(pack.readingNotes.byDocumentType).length;
if (noteChars > pack.readingNotes.sizeLimitChars) err(`reading notes ${noteChars} chars exceed ${pack.readingNotes.sizeLimitChars}`);

// L001 Initial IEP golden concepts -> record.field (concepts only, no golden values)
const L001: [string, string][] = [
  ["IEP meeting date", "meeting.meeting_date"], ["IEP effective period", "document_header.effective_start"],
  ["Student identity", "student.name"], ["Eligibility", "eligibility.category"],
  ["IEP addresses need", "present_level.area"], ["IEP has goal", "goal.statement"],
  ["IEP has service", "service.service_type"], ["Accommodation 1", "accommodation.description"],
  ["Accommodation 2", "accommodation.description"], ["Team role 1", "meeting_participant.role_code"],
  ["Team role 2", "meeting_participant.role_code"], ["Team role 3", "meeting_participant.role_code"],
  ["Team role 4", "meeting_participant.role_code"], ["Progress reporting frequency", "goal.reporting_frequency"],
  ["Progress reporting method", "goal.reporting_method"], ["Goal subject area", "goal.area"],
  ["Goal condition", "goal.condition"], ["Goal baseline", "goal.baseline_value"],
  ["Goal baseline source", "goal.baseline_source"], ["Goal target", "goal.target_value"],
  ["Goal accuracy criterion", "goal.accuracy_criterion"], ["Goal mastery criterion", "goal.mastery_criterion"],
  ["Goal start date", "goal.start_date"], ["Goal target date", "goal.target_date"],
  ["Goal measurement method", "goal.measurement_method"], ["Service frequency", "service.frequency_text"],
  ["Service minutes", "service.minutes_per_week"], ["Service location", "service.location"],
  ["Service start date", "service.start_date"],
];
const unmapped = L001.filter(([, p]) => !hasPath(p)).map(([c]) => c);
if (unmapped.length) err(`L001 concepts not mapped: ${unmapped.join(", ")}`);

const result = {
  packStatus: pack.status,
  schemaVersion: pack.schemaVersion,
  documentTypes: docTypes.size,
  recordTypes: records.size,
  fields: pack.recordTypes.reduce((n: number, r: Json) => n + r.fields.length, 0),
  recordTypesWithContentKeys: keyCount,
  requirementRules: pack.requirements.rules.length,
  insightChecks: pack.insightChecks.checks.length,
  l001ConceptsMapped: `${L001.length - unmapped.length}/${L001.length}`,
  noVersionAxisInKeys: !errors.some((e) => e.includes("version axis")),
  allReferencesValid: errors.length === 0,
  noExecutableCallbacks: !/"(callback|fn|script|code)"\s*:|=>|function\s*\(/.test(JSON.stringify(pack)),
  requirementsLegallyReviewed: false,
  runtimeCompatible: false,
  errors,
  warnings,
  note: "Structural checks only; no legal certification.",
};
const out = JSON.stringify(result, null, 2);
if (outPath) fs.writeFileSync(outPath, out + "\n");
console.log(out);
process.exit(errors.length ? 1 : 0);
