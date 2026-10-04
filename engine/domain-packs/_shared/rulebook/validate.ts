import type { DomainPack } from "@hiveforyou/domain-pack";

import { listPackDocumentTypes, listPackSlots } from "./pack-context.ts";
import type { DocumentGuide, QuestionTemplate, Rulebook } from "./schema.ts";

/** Case verdict language — not general regulatory descriptions (e.g. “a district must have …”). */
const VERDICT_WORDS =
  /violat|illegal|unlawful|failed to|\b(you|your child|this plan|this iep)\b[^\n]{0,60}\b(must have|is required to)\b/i;

function extractSlotRefs(text: string): string[] {
  const matches = text.matchAll(/\{([a-zA-Z0-9_.?+\s]+)\}/g);
  return [...matches].map((m) => m[1]!.trim());
}

function checkVerdictWords(label: string, text: string, errors: string[]): void {
  if (VERDICT_WORDS.test(text)) {
    errors.push(`${label} contains disallowed verdict language`);
  }
}

function validateQuestions(
  questions: QuestionTemplate[],
  slotIds: Set<string>,
  errors: string[],
  prefix: string,
): void {
  for (const q of questions) {
    checkVerdictWords(`${prefix} question ask`, q.ask, errors);
    for (const slot of extractSlotRefs(q.ask)) {
      if (!slotIds.has(slot)) {
        errors.push(`${prefix} question references unknown slot '${slot}'`);
      }
    }
  }
}

function validateGuide(
  guide: DocumentGuide,
  ruleRefs: Set<string>,
  termIds: Set<string>,
  slotIds: Set<string>,
  docTypes: Set<string>,
  errors: string[],
): void {
  if (!docTypes.has(guide.docType)) {
    errors.push(`guide docType '${guide.docType}' is not in the pack document type list`);
  }
  for (const slot of extractSlotRefs(guide.pageTitle)) {
    if (!slotIds.has(slot)) {
      errors.push(`guide pageTitle references unknown slot '${slot}'`);
    }
  }
  for (const termId of guide.basics) {
    if (!termIds.has(termId)) {
      errors.push(`guide basics references unknown term '${termId}'`);
    }
  }
  for (const section of guide.sections) {
    const prefix = `section '${section.id}'`;
    for (const ref of section.rules) {
      if (!ruleRefs.has(ref)) {
        errors.push(`${prefix} references unknown rule '${ref}'`);
      }
    }
    for (const termId of section.terms) {
      if (!termIds.has(termId)) {
        errors.push(`${prefix} references unknown term '${termId}'`);
      }
    }
    for (const slot of section.slots) {
      if (!slotIds.has(slot)) {
        errors.push(`${prefix} references unknown slot '${slot}'`);
      }
    }
    if (section.format) {
      for (const template of Object.values(section.format)) {
        for (const slot of extractSlotRefs(template)) {
          if (!slotIds.has(slot)) {
            errors.push(`${prefix} format references unknown slot '${slot}'`);
          }
        }
      }
    }
    validateQuestions(section.questions, slotIds, errors, prefix);
  }
  for (const right of guide.rights) {
    checkVerdictWords(`right '${right.title}'`, right.plain, errors);
    for (const ref of right.rules) {
      if (!ruleRefs.has(ref)) {
        errors.push(`right '${right.title}' references unknown rule '${ref}'`);
      }
    }
    for (const termId of right.terms ?? []) {
      if (!termIds.has(termId)) {
        errors.push(`right '${right.title}' references unknown term '${termId}'`);
      }
    }
  }
}

export function validate(
  rulebook: Rulebook,
  pack: DomainPack,
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  const ruleRefs = new Set<string>();
  for (const rule of rulebook.rules) {
    if (ruleRefs.has(rule.ref)) {
      errors.push(`duplicate rule ref '${rule.ref}'`);
    }
    ruleRefs.add(rule.ref);
    checkVerdictWords(`rule '${rule.ref}' plain`, rule.plain, errors);
  }

  const termIds = new Set<string>();
  for (const term of rulebook.terms) {
    if (termIds.has(term.id)) {
      errors.push(`duplicate term id '${term.id}'`);
    }
    termIds.add(term.id);
    checkVerdictWords(`term '${term.id}' plain`, term.plain, errors);
    if (term.source === "regulation" && term.cites.length === 0) {
      errors.push(`term '${term.id}' has source regulation but no cites`);
    }
    for (const cite of term.cites) {
      if (!ruleRefs.has(cite.ref)) {
        errors.push(`term '${term.id}' cites unknown rule '${cite.ref}'`);
      }
    }
  }

  const slotIds = new Set(listPackSlots(pack).map((s) => s.id));
  const docTypes = new Set(listPackDocumentTypes(pack));

  for (const guide of rulebook.guides) {
    validateGuide(guide, ruleRefs, termIds, slotIds, docTypes, errors);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true };
}
