import type { AssembledDocument, Block } from "../document/assembly";
import type { CallModel } from "../model/call-model";
import { PROMPTS } from "../prompts/generated-prompts";
import {
  TIER1_PROFILE_JSON_SCHEMA,
  TIER1_STATEMENTS_JSON_SCHEMA,
} from "./schemas/tier1-schemas";
import { maskIdentifiersForModel, restorePlaceholdersInText, type MaskPlaceholderMap } from "./mask";
import type {
  DocumentProfile,
  Force,
  Party,
  Reference,
  Statement,
  Term,
} from "./types";

export type Tier1SemanticResult = {
  profile: DocumentProfile;
  statements: Statement[];
  parties: Party[];
  references: Reference[];
  terms: Term[];
  usage: { inputTokens: number; outputTokens: number };
};

let tier1Seq = 0;

function readUsageTokens(usage: unknown): { inputTokens: number; outputTokens: number } {
  if (!usage || typeof usage !== "object") {
    return { inputTokens: 0, outputTokens: 0 };
  }
  const record = usage as Record<string, unknown>;
  const inputTokens =
    typeof record.inputTokens === "number"
      ? record.inputTokens
      : typeof record.input_tokens === "number"
        ? record.input_tokens
        : 0;
  const outputTokens =
    typeof record.outputTokens === "number"
      ? record.outputTokens
      : typeof record.output_tokens === "number"
        ? record.output_tokens
        : 0;
  return { inputTokens, outputTokens };
}

function nextId(prefix: string): string {
  tier1Seq += 1;
  return `${prefix}-${tier1Seq}`;
}

/** Strict structured output uses null for optional strings. Null means the field is absent. */
function mapNullToAbsent(value: string | null | undefined): string | null {
  return value == null ? null : value;
}

function restoreIfPresent(value: string | null | undefined, map: MaskPlaceholderMap): string | null {
  const present = mapNullToAbsent(value);
  if (present == null) {
    return null;
  }
  return restorePlaceholdersInText(present, map);
}

const TIER1_LOG_LABEL = "hive-atoms";

function proseSections(assembled: AssembledDocument): Block[][] {
  const tableIds = new Set(
    assembled.blocks.filter((b) => b.kind === "table").map((b) => b.id),
  );
  const sections: Block[][] = [];
  let current: Block[] = [];
  for (const block of assembled.blocks) {
    if (block.parentBlockId && tableIds.has(block.parentBlockId)) {
      continue;
    }
    if (block.kind === "form_field" || block.kind === "option" || block.kind === "furniture") {
      continue;
    }
    if (block.kind === "heading" || block.kind === "title") {
      if (current.length > 0) {
        sections.push(current);
        current = [];
      }
      continue;
    }
    if (block.kind === "line" && !block.isEmpty) {
      current.push(block);
    }
  }
  if (current.length > 0) {
    sections.push(current);
  }
  return sections;
}

function parseProfileResponse(
  documentId: string,
  parsed: Record<string, unknown>,
  map: MaskPlaceholderMap,
): Omit<Tier1SemanticResult, "usage"> {
  const parties = (parsed.parties as { name: string; role: string | null; quote: string }[]).map(
    (p) => ({
      id: nextId("party"),
      documentId,
      nameRaw: restorePlaceholdersInText(p.name, map),
      nameNorm: restorePlaceholdersInText(p.name, map).trim().toLowerCase(),
      role: mapNullToAbsent(p.role),
      evidence: [
        {
          documentId,
          pageNumber: 1,
          blockId: "",
          cellId: null,
          wordRange: [0, 0] as [number, number],
          quote: restorePlaceholdersInText(p.quote, map),
          bbox: [0, 0, 0, 0] as [number, number, number, number],
        },
      ],
    }),
  );

  const references = (parsed.references as { description: string; quote: string }[]).map((r) => ({
    id: nextId("ref"),
    documentId,
    targetDescription: restorePlaceholdersInText(r.description, map),
    evidence: [
      {
        documentId,
        pageNumber: 1,
        blockId: "",
        cellId: null,
        wordRange: [0, 0] as [number, number],
        quote: restorePlaceholdersInText(r.quote, map),
        bbox: [0, 0, 0, 0] as [number, number, number, number],
      },
    ],
  }));

  const terms = (parsed.terms as { text: string; quote: string }[]).map((t) => ({
    id: nextId("term"),
    documentId,
    text: restorePlaceholdersInText(t.text, map),
    evidence: [
      {
        documentId,
        pageNumber: 1,
        blockId: "",
        cellId: null,
        wordRange: [0, 0] as [number, number],
        quote: restorePlaceholdersInText(t.quote, map),
        bbox: [0, 0, 0, 0] as [number, number, number, number],
      },
    ],
  }));

  const profile: DocumentProfile = {
    documentId,
    kind: mapNullToAbsent(parsed.kind as string | null),
    purpose: mapNullToAbsent(parsed.purpose as string | null),
    issuedDate: mapNullToAbsent(parsed.issuedDate as string | null),
    periodFrom: mapNullToAbsent(parsed.periodFrom as string | null),
    periodTo: mapNullToAbsent(parsed.periodTo as string | null),
    authorId: null,
    requests: (parsed.requests as { text: string; quote: string }[]).map((r) => ({
      text: restorePlaceholdersInText(r.text, map),
      evidence: [
        {
          documentId,
          pageNumber: 1,
          blockId: "",
          cellId: null,
          wordRange: [0, 0] as [number, number],
          quote: restorePlaceholdersInText(r.quote, map),
          bbox: [0, 0, 0, 0] as [number, number, number, number],
        },
      ],
    })),
  };

  return { profile, statements: [], parties, references, terms };
}

function parseStatementsResponse(
  documentId: string,
  parsed: Record<string, unknown>,
  map: MaskPlaceholderMap,
): Statement[] {
  const rows = parsed.statements as {
    subjectLabel: string;
    attributeRaw: string;
    attributeKey: string | null;
    valueRaw: string | null;
    force: string;
    appliesFrom: string | null;
    appliesTo: string | null;
    conditionRaw: string | null;
    quote: string;
  }[];
  return rows.map((row) => ({
    id: nextId("t1"),
    documentId,
    tier: 1 as const,
    subjectId: `party:${restorePlaceholdersInText(row.subjectLabel, map).trim().toLowerCase()}`,
    attributeRaw: restorePlaceholdersInText(row.attributeRaw, map),
    attributeKey: mapNullToAbsent(row.attributeKey),
    valueRaw: restoreIfPresent(row.valueRaw, map),
    valueNorm: restoreIfPresent(row.valueRaw, map),
    unit: null,
    appliesFrom: restoreIfPresent(row.appliesFrom, map),
    appliesTo: restoreIfPresent(row.appliesTo, map),
    conditionRaw: restoreIfPresent(row.conditionRaw, map),
    speakerId: null,
    sourceRefId: null,
    force: row.force as Force,
    isEmpty: false,
    evidence: [
      {
        documentId,
        pageNumber: 1,
        blockId: "",
        cellId: null,
        wordRange: [0, 0] as [number, number],
        quote: restorePlaceholdersInText(row.quote, map),
        bbox: [0, 0, 0, 0] as [number, number, number, number],
      },
    ],
  }));
}

export async function runTier1Semantic(input: {
  assembled: AssembledDocument;
  callModel: CallModel;
  model: string;
}): Promise<Tier1SemanticResult> {
  tier1Seq = 0;
  const map: MaskPlaceholderMap = new Map();
  const maskedDocText = maskIdentifiersForModel(
    input.assembled.blocks
      .filter((b) => b.kind === "line" || b.kind === "heading" || b.kind === "title")
      .map((b) => b.text)
      .join("\n"),
    map,
  );

  let inputTokens = 0;
  let outputTokens = 0;

  const profileResp = await input.callModel({
    model: input.model,
    systemPrompt: PROMPTS["atoms/tier1-profile.md"],
    userContent: maskedDocText,
    textFormat: TIER1_PROFILE_JSON_SCHEMA,
    logLabel: TIER1_LOG_LABEL,
  });
  inputTokens += readUsageTokens(profileResp.usage).inputTokens;
  outputTokens += readUsageTokens(profileResp.usage).outputTokens;
  const profileParsed = JSON.parse(profileResp.outputText ?? "{}") as Record<string, unknown>;
  const base = parseProfileResponse(input.assembled.documentId, profileParsed, map);

  const statements: Statement[] = [];
  for (const section of proseSections(input.assembled)) {
    const sectionText = maskIdentifiersForModel(
      section.map((b) => b.text).join("\n"),
      map,
    );
    const resp = await input.callModel({
      model: input.model,
      systemPrompt: PROMPTS["atoms/tier1-statements.md"],
      userContent: sectionText,
      textFormat: TIER1_STATEMENTS_JSON_SCHEMA,
      logLabel: TIER1_LOG_LABEL,
    });
    inputTokens += readUsageTokens(resp.usage).inputTokens;
    outputTokens += readUsageTokens(resp.usage).outputTokens;
    const parsed = JSON.parse(resp.outputText ?? "{}") as Record<string, unknown>;
    statements.push(...parseStatementsResponse(input.assembled.documentId, parsed, map));
  }

  return {
    profile: base.profile,
    statements,
    parties: base.parties,
    references: base.references,
    terms: base.terms,
    usage: { inputTokens, outputTokens },
  };
}
