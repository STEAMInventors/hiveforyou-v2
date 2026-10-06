import type { AssembledDocument, Block } from "../document/assembly";
import type { Statement } from "./types";

const PERSON_FIELD_LABELS =
  /^(student|child|client|patient|participant|name of student|student name)$/i;

function normalizePersonName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function partySubjectId(name: string): string {
  return `party:${normalizePersonName(name)}`;
}

function personNameFromBlock(block: Block): string | null {
  if (block.field) {
    for (const field of block.field) {
      if (PERSON_FIELD_LABELS.test(field.label.trim()) && field.value?.trim()) {
        return field.value.trim();
      }
    }
  }
  for (const seg of block.segments) {
    const colon = seg.text.match(/^(.+?):\s*(.+)$/);
    if (colon && PERSON_FIELD_LABELS.test(colon[1]!.trim()) && colon[2]!.trim()) {
      return colon[2]!.trim();
    }
  }
  const joined = block.text.replace(/\s\|\s/g, " ");
  const colon = joined.match(/^(.+?):\s*(.+)$/);
  if (colon && PERSON_FIELD_LABELS.test(colon[1]!.trim()) && colon[2]!.trim()) {
    return colon[2]!.trim();
  }
  return null;
}

function sectionKey(block: Block): string {
  return block.parentBlockId ?? `doc:${block.documentId}:root`;
}

function personNameForSection(blocks: Block[], sectionId: string): string | null {
  for (const block of blocks) {
    if (sectionKey(block) !== sectionId) {
      continue;
    }
    const name = personNameFromBlock(block);
    if (name) {
      return name;
    }
  }
  return null;
}

/** Link doc-level field subjects to the section person (party id). */
export function linkSectionSubjects(input: {
  assembled: AssembledDocument;
  statements: Statement[];
}): Statement[] {
  const blocks = input.assembled.blocks;
  const blockById = new Map(blocks.map((b) => [b.id, b]));
  const sectionPerson = new Map<string, string>();
  for (const block of blocks) {
    const key = sectionKey(block);
    if (!sectionPerson.has(key)) {
      const name = personNameForSection(blocks, key);
      if (name) {
        sectionPerson.set(key, partySubjectId(name));
      }
    }
  }

  return input.statements.map((statement) => {
    const blockId = statement.evidence[0]?.blockId;
    if (!blockId) {
      return statement;
    }
    const block = blockById.get(blockId);
    if (!block) {
      return statement;
    }
    const personId = sectionPerson.get(sectionKey(block));
    if (!personId || statement.subjectId.startsWith("party:")) {
      return statement;
    }
    if (statement.subjectId.startsWith("doc:") || statement.subjectId.startsWith("thing:")) {
      return { ...statement, subjectId: personId };
    }
    return statement;
  });
}
