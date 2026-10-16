import type { HiveUiElement, HiveUiElementMap } from "@hiveforyou/shared/hive-ui-tree";

export class WriterModelProposalNormalizationError extends Error {
  readonly code = "WRITER_PROPOSAL_NORMALIZATION_FAILED";

  constructor(message: string) {
    super(message);
    this.name = "WriterModelProposalNormalizationError";
  }
}

type WriterModelElementEntry = {
  id: string;
  type: HiveUiElement["type"];
  props: HiveUiElement["props"];
  children?: string[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeElementEntry(raw: unknown): WriterModelElementEntry {
  if (!isPlainObject(raw)) {
    throw new WriterModelProposalNormalizationError("Writer element entry must be an object.");
  }
  const id = raw.id;
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new WriterModelProposalNormalizationError("Writer element entry requires a non-empty id.");
  }
  const type = raw.type;
  if (typeof type !== "string" || type.trim().length === 0) {
    throw new WriterModelProposalNormalizationError(`Writer element ${id} requires type.`);
  }
  if (!isPlainObject(raw.props)) {
    throw new WriterModelProposalNormalizationError(`Writer element ${id} requires props object.`);
  }
  const entry: WriterModelElementEntry = {
    id,
    type: type as HiveUiElement["type"],
    props: raw.props as HiveUiElement["props"],
  };
  if (raw.children !== undefined) {
    if (!Array.isArray(raw.children) || raw.children.some((child) => typeof child !== "string")) {
      throw new WriterModelProposalNormalizationError(
        `Writer element ${id} children must be string ids when present.`,
      );
    }
    entry.children = raw.children;
  }
  return entry;
}

export function normalizeWriterModelElementArrayToMap(elements: unknown[]): HiveUiElementMap {
  const map: HiveUiElementMap = {};
  for (const raw of elements) {
    const entry = normalizeElementEntry(raw);
    if (Object.prototype.hasOwnProperty.call(map, entry.id)) {
      throw new WriterModelProposalNormalizationError(
        `Duplicate Writer element id ${entry.id}.`,
      );
    }
    map[entry.id] = {
      type: entry.type,
      props: entry.props,
      ...(entry.children ? { children: entry.children } : {}),
    };
  }
  return map;
}

/**
 * Converts Anthropic Writer output (`hiveUiTree.elements` array with stable ids) into
 * canonical hive-ui-tree/1 (`elements` map keyed by id). Map-shaped elements pass through.
 */
export function normalizeWriterModelProposalBeforeValidation(value: unknown): unknown {
  if (!isPlainObject(value)) {
    return value;
  }
  const hiveUiTree = value.hiveUiTree;
  if (!isPlainObject(hiveUiTree)) {
    return value;
  }
  const elements = hiveUiTree.elements;
  if (!Array.isArray(elements)) {
    return value;
  }
  const elementMap = normalizeWriterModelElementArrayToMap(elements);
  return {
    ...value,
    hiveUiTree: {
      ...hiveUiTree,
      elements: elementMap,
    },
  };
}
