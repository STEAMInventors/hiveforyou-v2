import {
  pushError,
  pushWarning,
  type PackValidationError,
  type PackValidationWarning,
} from "./errors.ts";
import {
  isPackStudyPrimitive,
  PACK_PRIMITIVE_MAP,
  type PackStudyPrimitive,
} from "./primitive-map.ts";
import type {
  CaseAttributeDefinition,
  DomainPackV2,
  PackDocumentTypes,
  PackQuestion,
  PackViews,
} from "./types.ts";
import { validateBehaviorsBlock } from "./validate-behaviors.ts";
import { walkLegalNumbers } from "./validate-legal-numbers.ts";
import {
  CASE_ATTRIBUTE_DEF_KEYS,
  DOCUMENT_TYPE_KEY_RE,
  WINDOW_BOOLEAN_FLAGS,
  asString,
  isRecord,
  pathJoin,
} from "./util.ts";

const DOMAIN_PACK_TOP_LEVEL = new Set([
  "pack",
  "version",
  "pro",
  "anchor",
  "jurisdiction_overlay",
  "questions",
  "behaviors",
  "views",
  "case_attributes",
  "document_types",
]);

const QUESTION_KEYS = new Set([
  "id",
  "ask",
  "primitives",
  "weight",
  "per",
  "requires",
  "requires_from",
  "track",
  "comparable_on",
  "match",
  "record",
  "audience",
  "window",
  "windows_from",
  "threshold",
  "applies_when",
  "runs_when",
  "as_of",
  "explanation_sources",
  "open_terms",
]);

const AUDIENCE_VALUES = new Set(["pro", "customer", "both"]);

function validateOverlayOperand(
  value: unknown,
  file: string,
  path: string,
  errors: PackValidationError[],
): void {
  if (!isRecord(value)) {
    pushError(errors, file, path, "overlay reference must be a mapping with from and key");
    return;
  }
  if (value.from !== "jurisdiction_overlay") {
    pushError(errors, file, pathJoin(path, "from"), "from must be jurisdiction_overlay");
  }
  if (typeof value.key !== "string" || value.key.trim() === "") {
    pushError(errors, file, pathJoin(path, "key"), "key must be a non-empty string");
  }
  for (const key of Object.keys(value)) {
    if (key !== "from" && key !== "key") {
      pushError(errors, file, pathJoin(path, key), "unknown key on overlay reference");
    }
  }
}

function validateWhenObject(
  when: unknown,
  file: string,
  path: string,
  errors: PackValidationError[],
): void {
  if (!isRecord(when)) {
    pushError(errors, file, path, "when must be a mapping");
    return;
  }
  for (const key of Object.keys(when)) {
    if (key === "field" || key === "equals") {
      continue;
    }
    if (key === "student_age_at_anchor_gte") {
      validateOverlayOperand(when[key], file, pathJoin(path, key), errors);
      continue;
    }
    pushError(errors, file, pathJoin(path, key), "unknown when comparison operator");
  }
  if ("field" in when) {
    if (typeof when.field !== "string") {
      pushError(errors, file, pathJoin(path, "field"), "field must be a string");
    }
    if (!("equals" in when)) {
      pushError(errors, file, path, "when with field must include equals");
    } else if (typeof when.equals !== "string") {
      pushError(errors, file, pathJoin(path, "equals"), "equals must be a string");
    }
  }
}

function validateRequiresEntry(
  entry: unknown,
  file: string,
  path: string,
  errors: PackValidationError[],
): void {
  if (typeof entry === "string") {
    return;
  }
  if (!isRecord(entry)) {
    pushError(errors, file, path, "requires entry must be a string or mapping");
    return;
  }
  const keys = Object.keys(entry);
  if (keys.length !== 1) {
    pushError(errors, file, path, "structured requires entry must have exactly one key");
    return;
  }
  const name = keys[0]!;
  const body = entry[name];
  if (!isRecord(body)) {
    pushError(errors, file, pathJoin(path, name), "requires body must be a mapping");
    return;
  }
  for (const prop of Object.keys(body)) {
    if (prop !== "when" && prop !== "parts") {
      pushError(errors, file, pathJoin(path, name, prop), "unknown property on requires entry");
    }
  }
  if (body.when !== undefined) {
    validateWhenObject(body.when, file, pathJoin(path, name, "when"), errors);
  }
  if (body.parts !== undefined) {
    if (!Array.isArray(body.parts) || !body.parts.every((p) => typeof p === "string")) {
      pushError(errors, file, pathJoin(path, name, "parts"), "parts must be a string array");
    }
  }
}

function validateWindow(
  window: unknown,
  file: string,
  path: string,
  errors: PackValidationError[],
): void {
  if (!isRecord(window)) {
    pushError(errors, file, path, "window must be a mapping");
    return;
  }
  if (window.from !== "jurisdiction_overlay") {
    pushError(errors, file, pathJoin(path, "from"), "from must be jurisdiction_overlay");
  }
  if (typeof window.key !== "string") {
    pushError(errors, file, pathJoin(path, "key"), "key must be a string");
  }
  for (const key of Object.keys(window)) {
    if (key === "from" || key === "key") {
      continue;
    }
    if (WINDOW_BOOLEAN_FLAGS.has(key)) {
      if (typeof window[key] !== "boolean") {
        pushError(errors, file, pathJoin(path, key), `${key} must be a boolean`);
      }
      continue;
    }
    pushError(errors, file, pathJoin(path, key), "unknown window property");
  }
}

function validateThreshold(
  threshold: unknown,
  file: string,
  path: string,
  errors: PackValidationError[],
): void {
  if (!isRecord(threshold)) {
    pushError(errors, file, path, "threshold must be a mapping");
    return;
  }
  if (threshold.from !== "jurisdiction_overlay") {
    pushError(errors, file, pathJoin(path, "from"), "from must be jurisdiction_overlay");
  }
  const hasKey = typeof threshold.key === "string";
  const hasKeyByChapter = isRecord(threshold.key_by_chapter);
  if (!hasKey && !hasKeyByChapter) {
    pushError(errors, file, path, "threshold must have key or key_by_chapter");
  }
  if (hasKeyByChapter) {
    for (const [ch, ref] of Object.entries(threshold.key_by_chapter as Record<string, unknown>)) {
      if (typeof ref !== "string") {
        pushError(errors, file, pathJoin(path, "key_by_chapter", ch), "chapter key must map to overlay key string");
      }
    }
  }
  for (const key of Object.keys(threshold)) {
    if (key === "from" || key === "key" || key === "key_by_chapter") {
      continue;
    }
    pushError(errors, file, pathJoin(path, key), "unknown threshold property");
  }
}

function validateAppliesWhen(
  appliesWhen: unknown,
  file: string,
  path: string,
  caseAttributes: Record<string, CaseAttributeDefinition>,
  errors: PackValidationError[],
): void {
  if (!isRecord(appliesWhen)) {
    pushError(errors, file, path, "applies_when must be a mapping");
    return;
  }
  for (const [attr, values] of Object.entries(appliesWhen)) {
    const attrPath = pathJoin(path, attr);
    if (!(attr in caseAttributes)) {
      pushError(errors, file, attrPath, "applies_when references undeclared case attribute");
      continue;
    }
    if (!Array.isArray(values) || !values.every((v) => typeof v === "string")) {
      pushError(errors, file, attrPath, "applies_when values must be a string array");
      continue;
    }
    const allowed = caseAttributes[attr]?.values;
    if (allowed) {
      const allowedSet = new Set(allowed);
      for (let i = 0; i < values.length; i++) {
        const v = values[i] as string;
        if (!allowedSet.has(v)) {
          pushError(
            errors,
            file,
            pathJoin(attrPath, i),
            "applies_when value not in case attribute values",
          );
        }
      }
    }
  }
}

function validateQuestion(
  raw: unknown,
  index: number,
  file: string,
  caseAttributes: Record<string, CaseAttributeDefinition>,
  errors: PackValidationError[],
): PackQuestion {
  const path = `questions[${index}]`;
  if (!isRecord(raw)) {
    pushError(errors, file, path, "question must be a mapping");
    return raw as PackQuestion;
  }
  for (const key of Object.keys(raw)) {
    if (!QUESTION_KEYS.has(key)) {
      pushError(errors, file, pathJoin(path, key), "unknown question field");
    }
  }

  const id = raw.id;
  if (typeof id !== "string" || id.trim() === "") {
    pushError(errors, file, pathJoin(path, "id"), "id must be a non-empty string");
  }

  if (typeof raw.ask !== "string" || raw.ask.trim() === "") {
    pushError(errors, file, pathJoin(path, "ask"), "ask must be a non-empty string");
  }

  if (!Array.isArray(raw.primitives) || raw.primitives.length === 0) {
    pushError(errors, file, pathJoin(path, "primitives"), "primitives must be a non-empty array");
  } else {
    for (let i = 0; i < raw.primitives.length; i++) {
      const p = raw.primitives[i];
      if (typeof p !== "string" || !isPackStudyPrimitive(p)) {
        pushError(errors, file, pathJoin(path, "primitives", i), "unknown primitive name");
      }
    }
  }

  const weight = raw.weight;
  if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0 || weight > 100) {
    pushError(errors, file, pathJoin(path, "weight"), "weight must be a number from 0 to 100");
  }

  if (raw.match !== undefined && raw.match !== "model_proposed") {
    pushError(errors, file, pathJoin(path, "match"), "match must be model_proposed");
  }

  if (raw.audience !== undefined && (typeof raw.audience !== "string" || !AUDIENCE_VALUES.has(raw.audience))) {
    pushError(errors, file, pathJoin(path, "audience"), "audience must be pro, customer, or both");
  }

  if (raw.window !== undefined) {
    validateWindow(raw.window, file, pathJoin(path, "window"), errors);
  }

  if (raw.windows_from !== undefined && raw.windows_from !== "jurisdiction_overlay") {
    pushError(errors, file, pathJoin(path, "windows_from"), "windows_from must be jurisdiction_overlay");
  }

  if (raw.threshold !== undefined) {
    validateThreshold(raw.threshold, file, pathJoin(path, "threshold"), errors);
  }

  if (raw.requires !== undefined) {
    if (!Array.isArray(raw.requires)) {
      pushError(errors, file, pathJoin(path, "requires"), "requires must be an array");
    } else {
      for (let i = 0; i < raw.requires.length; i++) {
        validateRequiresEntry(raw.requires[i], file, pathJoin(path, "requires", i), errors);
      }
    }
  }

  if (raw.runs_when !== undefined) {
    if (!isRecord(raw.runs_when) || !Array.isArray(raw.runs_when.documents_present)) {
      pushError(errors, file, pathJoin(path, "runs_when"), "runs_when must be {documents_present: string[]}");
    } else if (!raw.runs_when.documents_present.every((d) => typeof d === "string")) {
      pushError(errors, file, pathJoin(path, "runs_when", "documents_present"), "documents must be strings");
    }
  }

  if (raw.as_of !== undefined) {
    if (!isRecord(raw.as_of) || typeof raw.as_of.case_attribute !== "string") {
      pushError(errors, file, pathJoin(path, "as_of"), "as_of must be {case_attribute: string}");
    } else if (!(raw.as_of.case_attribute in caseAttributes)) {
      pushError(errors, file, pathJoin(path, "as_of", "case_attribute"), "undeclared case attribute");
    }
  }

  if (raw.applies_when !== undefined) {
    validateAppliesWhen(raw.applies_when, file, pathJoin(path, "applies_when"), caseAttributes, errors);
  }

  return raw as unknown as PackQuestion;
}

function validateCaseAttributes(
  raw: unknown,
  file: string,
  errors: PackValidationError[],
): Record<string, CaseAttributeDefinition> {
  const result: Record<string, CaseAttributeDefinition> = {};
  if (raw === undefined) {
    return result;
  }
  if (!isRecord(raw)) {
    pushError(errors, file, "case_attributes", "case_attributes must be a mapping");
    return result;
  }
  for (const [name, def] of Object.entries(raw)) {
    const attrPath = pathJoin("case_attributes", name);
    if (!isRecord(def)) {
      pushError(errors, file, attrPath, "case attribute must be a mapping");
      continue;
    }
    for (const key of Object.keys(def)) {
      if (!CASE_ATTRIBUTE_DEF_KEYS.has(key)) {
        pushError(errors, file, pathJoin(attrPath, key), "unknown case attribute property");
      }
    }
    const parsed: CaseAttributeDefinition = {};
    if (def.values !== undefined) {
      if (!Array.isArray(def.values) || !def.values.every((v) => typeof v === "string")) {
        pushError(errors, file, pathJoin(attrPath, "values"), "values must be a string array");
      } else {
        parsed.values = def.values as string[];
      }
    }
    if (def.source !== undefined) {
      if (typeof def.source !== "string") {
        pushError(errors, file, pathJoin(attrPath, "source"), "source must be a string");
      } else {
        parsed.source = def.source;
      }
    }
    if (def.proposed_from !== undefined) {
      if (!Array.isArray(def.proposed_from) || !def.proposed_from.every((v) => typeof v === "string")) {
        pushError(errors, file, pathJoin(attrPath, "proposed_from"), "proposed_from must be a string array");
      } else {
        parsed.proposed_from = def.proposed_from as string[];
      }
    }
    result[name] = parsed;
  }
  return result;
}

function validateDocumentTypes(
  raw: unknown,
  file: string,
  distinctiveOwner: Map<string, string> | undefined,
  errors: PackValidationError[],
): PackDocumentTypes | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!isRecord(raw)) {
    pushError(errors, file, "document_types", "document_types must be a mapping");
    return undefined;
  }
  const readSection = (section: "distinctive" | "shared"): string[] => {
    const value = raw[section];
    if (value === undefined) {
      return [];
    }
    if (!Array.isArray(value) || !value.every((e) => typeof e === "string")) {
      pushError(errors, file, pathJoin("document_types", section), "must be a string array");
      return [];
    }
    for (let i = 0; i < value.length; i++) {
      const key = value[i] as string;
      if (!DOCUMENT_TYPE_KEY_RE.test(key)) {
        pushError(errors, file, pathJoin("document_types", section, i), "key must match ^[a-z][a-z0-9_]*$");
      }
    }
    return value as string[];
  };

  const distinctive = readSection("distinctive");
  const shared = readSection("shared");

  if (distinctiveOwner) {
    for (const key of distinctive) {
      const prior = distinctiveOwner.get(key);
      if (prior) {
        pushError(
          errors,
          file,
          pathJoin("document_types", "distinctive", key),
          `distinctive key ${key} already used in ${prior}`,
        );
      } else {
        distinctiveOwner.set(key, file);
      }
    }
  }

  for (const key of Object.keys(raw)) {
    if (key !== "distinctive" && key !== "shared") {
      pushError(errors, file, pathJoin("document_types", key), "unknown document_types key");
    }
  }

  return { distinctive, shared };
}

function validateViews(
  raw: unknown,
  file: string,
  caseAttributes: Record<string, CaseAttributeDefinition>,
  errors: PackValidationError[],
): PackViews | null {
  if (!isRecord(raw)) {
    pushError(errors, file, "views", "views must be a mapping");
    return raw as PackViews;
  }
  const customer = raw.customer;
  if (!isRecord(customer)) {
    pushError(errors, file, "views.customer", "customer view must be a mapping");
  } else {
    if (typeof customer.tone !== "string") {
      pushError(errors, file, "views.customer.tone", "tone must be a string");
    }
    if (!Array.isArray(customer.forbidden)) {
      pushError(errors, file, "views.customer.forbidden", "forbidden must be an array");
    } else if (!customer.forbidden.every((w) => typeof w === "string")) {
      pushError(errors, file, "views.customer.forbidden", "forbidden entries must be strings");
    }
    if (!Array.isArray(customer.sections)) {
      pushError(errors, file, "views.customer.sections", "sections must be an array");
    } else if (!customer.sections.every((s) => typeof s === "string")) {
      pushError(errors, file, "views.customer.sections", "sections entries must be strings");
    }
  }

  const pro = raw.pro;
  if (!isRecord(pro)) {
    pushError(errors, file, "views.pro", "pro view must be a mapping");
  } else {
    if (!isRecord(pro.templates)) {
      pushError(errors, file, "views.pro.templates", "templates must be a mapping");
    } else {
      for (const [name, tpl] of Object.entries(pro.templates)) {
        if (!isRecord(tpl)) {
          pushError(errors, file, pathJoin("views.pro.templates", name), "template must be a mapping");
          continue;
        }
        if (tpl.applies_when !== undefined) {
          validateAppliesWhen(
            tpl.applies_when,
            file,
            pathJoin("views.pro.templates", name, "applies_when"),
            caseAttributes,
            errors,
          );
        }
      }
    }
    if (!Array.isArray(pro.export)) {
      pushError(errors, file, "views.pro.export", "export must be an array");
    } else if (!pro.export.every((e) => typeof e === "string")) {
      pushError(errors, file, "views.pro.export", "export entries must be strings");
    }
  }

  return raw as unknown as PackViews;
}

export type ValidateDomainPackOptions = {
  /** When set, enforces global distinctive document_types uniqueness (loadAllPacks). */
  distinctiveOwner?: Map<string, string>;
};

export function validateDomainPackDocument(
  doc: unknown,
  file: string,
  options: ValidateDomainPackOptions = {},
):
  | { ok: true; pack: DomainPackV2; warnings: PackValidationWarning[] }
  | { ok: false; errors: PackValidationError[] } {
  const errors: PackValidationError[] = [];

  if (!isRecord(doc)) {
    pushError(errors, file, "", "document must be a mapping");
    return { ok: false, errors };
  }

  for (const key of Object.keys(doc)) {
    if (!DOMAIN_PACK_TOP_LEVEL.has(key)) {
      pushError(errors, file, key, "unknown top-level key");
    }
  }

  walkLegalNumbers(doc, "", file, errors);

  const versionRaw = doc.version;
  const versionStr = asString(versionRaw);
  if (versionStr === null) {
    pushError(errors, file, "version", "version is required");
  }

  if (typeof doc.pack !== "string" || doc.pack.trim() === "") {
    pushError(errors, file, "pack", "pack must be a non-empty string");
  }

  if (typeof doc.pro !== "string") {
    pushError(errors, file, "pro", "pro must be a string");
  }

  const overlay = doc.jurisdiction_overlay;
  if (overlay !== "required" && overlay !== "none") {
    pushError(errors, file, "jurisdiction_overlay", "must be required or none");
  }

  if (!isRecord(doc.anchor)) {
    pushError(errors, file, "anchor", "anchor must be a mapping with name and fallback");
  } else {
    if (typeof doc.anchor.name !== "string") {
      pushError(errors, file, "anchor.name", "name must be a string");
    }
    if (typeof doc.anchor.fallback !== "string") {
      pushError(errors, file, "anchor.fallback", "fallback must be a string");
    }
  }

  const requiredTop = ["pack", "version", "pro", "anchor", "jurisdiction_overlay", "questions", "behaviors", "views"];
  for (const key of requiredTop) {
    if (!(key in doc)) {
      pushError(errors, file, key, "missing required top-level key");
    }
  }

  const caseAttributes = validateCaseAttributes(doc.case_attributes, file, errors);
  const documentTypes = validateDocumentTypes(
    doc.document_types,
    file,
    options.distinctiveOwner,
    errors,
  );
  validateBehaviorsBlock(doc.behaviors, file, "behaviors", errors);

  validateViews(doc.views, file, caseAttributes, errors);

  const questions: PackQuestion[] = [];
  if (!Array.isArray(doc.questions)) {
    pushError(errors, file, "questions", "questions must be an array");
  } else {
    const seenIds = new Set<string>();
    for (let i = 0; i < doc.questions.length; i++) {
      const q = validateQuestion(doc.questions[i], i, file, caseAttributes, errors);
      if (typeof q.id === "string") {
        if (seenIds.has(q.id)) {
          pushError(errors, file, pathJoin(`questions[${i}]`, "id"), "duplicate question id");
        }
        seenIds.add(q.id);
      }
      questions.push(q);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const pack: DomainPackV2 = {
    pack: doc.pack as string,
    version: versionStr!,
    pro: doc.pro as string,
    anchor: doc.anchor as DomainPackV2["anchor"],
    jurisdiction_overlay: doc.jurisdiction_overlay as DomainPackV2["jurisdiction_overlay"],
    questions,
    behaviors: doc.behaviors as DomainPackV2["behaviors"],
    views: doc.views as DomainPackV2["views"],
    case_attributes: Object.keys(caseAttributes).length > 0 ? caseAttributes : undefined,
    document_types: documentTypes,
  };

  const warnings: PackValidationWarning[] = [];
  for (let i = 0; i < questions.length; i += 1) {
    const q = questions[i]!;
    const planned = q.primitives.filter(
      (name) => PACK_PRIMITIVE_MAP[name as PackStudyPrimitive]?.status === "planned",
    );
    if (planned.length > 0) {
      pushWarning(
        warnings,
        file,
        pathJoin(`questions[${i}]`, "primitives"),
        `question uses planned primitive(s): ${planned.join(", ")}`,
      );
    }
  }

  return { ok: true, pack, warnings };
}
