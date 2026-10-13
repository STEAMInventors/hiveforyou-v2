/**
 * Pack vocabulary.fieldSynonyms — v0.3 documented shape:
 * { field, terms[], category?, value? }
 */
export type ProposalFieldSynonymEntry = {
  field: string;
  terms: readonly string[];
  category?: string;
  value?: string;
};

export class PackVocabularySchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackVocabularySchemaError";
  }
}

export function normalizeSynonymToken(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export function collectFieldSynonymValidationErrors(
  raw: unknown,
  pathPrefix = "vocabulary.fieldSynonyms",
): string[] {
  const errors: string[] = [];
  if (raw === undefined || raw === null) {
    return errors;
  }
  if (!Array.isArray(raw)) {
    errors.push(`${pathPrefix}: must be an array`);
    return errors;
  }
  raw.forEach((entry, index) => {
    const where = `${pathPrefix}[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    const obj = entry as Record<string, unknown>;
    if ("synonyms" in obj && !("terms" in obj)) {
      errors.push(`${where}: use "terms" not "synonyms" (pack v0.3 fieldSynonyms shape)`);
    }
    if (typeof obj.field !== "string" || !obj.field.trim()) {
      errors.push(`${where}: "field" must be a non-empty string`);
    }
    if (!Array.isArray(obj.terms)) {
      errors.push(`${where}: "terms" must be a non-empty array of strings`);
    } else if (obj.terms.length === 0) {
      errors.push(`${where}: "terms" must contain at least one synonym`);
    } else {
      obj.terms.forEach((term, termIndex) => {
        if (typeof term !== "string" || !term.trim()) {
          errors.push(`${where}.terms[${termIndex}]: must be a non-empty string`);
        }
      });
    }
    if ("category" in obj && obj.category != null && typeof obj.category !== "string") {
      errors.push(`${where}: "category" must be a string when present`);
    }
    if ("value" in obj && obj.value != null && typeof obj.value !== "string") {
      errors.push(`${where}: "value" must be a string when present`);
    }
  });
  return errors;
}

export function parseFieldSynonyms(raw: unknown): ProposalFieldSynonymEntry[] {
  const errors = collectFieldSynonymValidationErrors(raw);
  if (errors.length > 0) {
    throw new PackVocabularySchemaError(errors.join("; "));
  }
  if (!raw || !Array.isArray(raw)) {
    return [];
  }
  return raw.map((entry) => {
    const obj = entry as Record<string, unknown>;
    const parsed: ProposalFieldSynonymEntry = {
      field: (obj.field as string).trim(),
      terms: (obj.terms as string[]).map((term) => term.trim()),
    };
    if (typeof obj.category === "string" && obj.category.trim()) {
      parsed.category = obj.category.trim();
    }
    if (typeof obj.value === "string" && obj.value.trim()) {
      parsed.value = obj.value.trim();
    }
    return parsed;
  });
}

/**
 * Map matched synonym terms to canonical normalized text.
 * When `value` is declared, it is the canonical form (e.g. classified enum codes).
 * Otherwise the last segment of `field` is used (e.g. measure.score_type -> score_type).
 */
function entryMatchesFieldPath(entryField: string, fieldPath: string | undefined): boolean {
  if (!fieldPath) {
    return true;
  }
  if (entryField === fieldPath) {
    return true;
  }
  if (fieldPath.endsWith(`.${entryField}`) || fieldPath.endsWith(entryField)) {
    return true;
  }
  const pathFieldId = fieldPath.includes(".") ? fieldPath.slice(fieldPath.lastIndexOf(".") + 1) : fieldPath;
  return entryField === pathFieldId || entryField.endsWith(`.${pathFieldId}`);
}

export function applyFieldSynonymNormalization(
  text: string,
  entries: readonly ProposalFieldSynonymEntry[],
  fieldPath?: string,
): string {
  const normalized = normalizeSynonymToken(text);
  for (const entry of entries) {
    if (!entryMatchesFieldPath(entry.field, fieldPath)) {
      continue;
    }
    for (const term of entry.terms) {
      if (normalized === normalizeSynonymToken(term)) {
        if (entry.value) {
          return entry.value.toLowerCase();
        }
        const suffix = entry.field.split(".").pop();
        return suffix ? suffix.toLowerCase() : normalized;
      }
    }
  }
  return normalized;
}
