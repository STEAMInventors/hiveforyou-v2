import { describe, expect, it } from "vitest";

import {
  CANONICAL_STUDY_PROPOSAL_SCHEMA_V3,
  CANONICAL_STUDY_PROPOSAL_V3_OPENAI_JSON_SCHEMA,
  CLAIM_VALUE_V3_JSON_SCHEMA,
  validateCanonicalStudyProposal,
  type CanonicalStudyProposal,
  type ClaimValue,
} from "@hiveforyou/shared/case-intelligence/3";

import { MalformedCanonicalStudyProposalError } from "./study-engine-errors";
import { normalizeOpenAIClaimValue } from "./normalize-openai-claim-value-v3";

type JsonSchemaNode = Record<string, unknown>;

const UNSUPPORTED_KEYWORDS = [
  "oneOf",
  "allOf",
  "not",
  "if",
  "then",
  "else",
  "dependentRequired",
  "dependentSchemas",
  "patternProperties",
  "unevaluatedProperties",
  "unevaluatedItems",
] as const;

function isObjectSchema(schema: JsonSchemaNode): boolean {
  const type = schema.type;
  if (type === "object") {
    return true;
  }
  if (Array.isArray(type) && type.includes("object")) {
    return true;
  }
  return schema.properties != null;
}

function visitSchemaNodes(
  node: unknown,
  path: string,
  visit: (schema: JsonSchemaNode, path: string) => void,
): void {
  if (Array.isArray(node)) {
    node.forEach((entry, index) => visitSchemaNodes(entry, `${path}[${index}]`, visit));
    return;
  }
  if (typeof node !== "object" || node === null) {
    return;
  }
  const schema = node as JsonSchemaNode;
  visit(schema, path);
  for (const [key, child] of Object.entries(schema)) {
    if (key === "description" || key === "enum" || key === "required" || key === "type") {
      continue;
    }
    visitSchemaNodes(child, `${path}.${key}`, visit);
  }
}

function assertNoUntypedConstOrEnum(schemaRoot: unknown, label: string): void {
  visitSchemaNodes(schemaRoot, "root", (schema, path) => {
    if (schema.const !== undefined && schema.type === undefined) {
      expect.fail(`${label} ${path}: const without type`);
    }
    if (schema.enum !== undefined && schema.type === undefined) {
      expect.fail(`${label} ${path}: enum without type`);
    }
    if (Array.isArray(schema.enum) && schema.enum.includes(null)) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      expect(types, `${label} ${path}: nullable enum`).toContain("null");
    }
  });
}

function assertStrictOpenAISchema(schemaRoot: unknown, label: string): void {
  visitSchemaNodes(schemaRoot, "root", (schema, path) => {
    if (!isObjectSchema(schema)) {
      return;
    }
    expect(schema.additionalProperties, `${label} ${path}: additionalProperties`).toBe(false);
    expect(schema.properties, `${label} ${path}: properties`).toEqual(expect.any(Object));
    const properties = schema.properties as Record<string, unknown>;
    const propertyKeys = Object.keys(properties).sort();
    const requiredKeys = [...((schema.required as string[] | undefined) ?? [])].sort();
    expect(requiredKeys, `${label} ${path}: required keys`).toEqual(propertyKeys);
  });
}

function pathsWithKeyword(schemaRoot: unknown, keyword: string): string[] {
  const found: string[] = [];
  visitSchemaNodes(schemaRoot, "root", (schema, path) => {
    if (Object.prototype.hasOwnProperty.call(schema, keyword)) {
      found.push(`${path}.${keyword}`);
    }
  });
  return found;
}

function assertSupportedAnyOf(schemaRoot: unknown, label: string): void {
  visitSchemaNodes(schemaRoot, "root", (schema, path) => {
    if (!Object.prototype.hasOwnProperty.call(schema, "anyOf")) {
      return;
    }
    expect(path, `${label}: anyOf is not allowed at the schema root`).not.toBe("root");
    expect(Array.isArray(schema.anyOf), `${label} ${path}: anyOf`).toBe(true);
    const branches = schema.anyOf as unknown[];
    expect(branches.length, `${label} ${path}: anyOf branches`).toBeGreaterThan(0);
    for (const [index, branch] of branches.entries()) {
      expect(typeof branch, `${label} ${path}.anyOf[${index}]`).toBe("object");
      const branchSchema = branch as JsonSchemaNode;
      expect(branchSchema.type, `${label} ${path}.anyOf[${index}] type`).toBe("object");
      expect(
        branchSchema.additionalProperties,
        `${label} ${path}.anyOf[${index}] additionalProperties`,
      ).toBe(false);
      const properties = branchSchema.properties as Record<string, unknown> | undefined;
      expect(properties, `${label} ${path}.anyOf[${index}] properties`).toEqual(expect.any(Object));
      const propertyKeys = Object.keys(properties ?? {}).sort();
      const requiredKeys = [...((branchSchema.required as string[] | undefined) ?? [])].sort();
      expect(requiredKeys, `${label} ${path}.anyOf[${index}] required`).toEqual(propertyKeys);
    }
  });
}

type ValueSchema = {
  type: string;
  additionalProperties: boolean;
  properties: {
    kind: { type: string; enum: string[] };
  } & Record<string, { type?: string | string[] }>;
  required: string[];
};

function claimValueSchema(): ValueSchema {
  const root = CANONICAL_STUDY_PROPOSAL_V3_OPENAI_JSON_SCHEMA as unknown as {
    properties: {
      claims: { items: { properties: { value: ValueSchema } } };
    };
  };
  return root.properties.claims.items.properties.value;
}

function emptyTransport(kind: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const schema = claimValueSchema();
  const transport: Record<string, unknown> = {};
  for (const key of schema.required) {
    transport[key] = key === "kind" ? kind : null;
  }
  return { ...transport, ...overrides, kind };
}

function proposalWithValue(value: unknown, unit?: string): CanonicalStudyProposal {
  return {
    schemaVersion: CANONICAL_STUDY_PROPOSAL_SCHEMA_V3,
    domainId: "domain-a",
    entities: [],
    claims: [
      {
        id: "claim-1",
        subjectEntityId: "entity-1",
        construct: "observed_fact",
        value: value as ClaimValue,
        ...(unit !== undefined ? { unit } : {}),
        role: "observed",
        evidenceRefs: [
          {
            id: "ev-1",
            sourceDocumentId: "src-1",
            sourceType: "document",
            page: 1,
          },
        ],
      },
    ],
    conflicts: [],
    missingInformation: [],
    modelMetadata: {
      providerId: "test",
      proposalMode: "production",
    },
    proposedAt: "2026-09-29T00:00:00.000Z",
  };
}

function expectRejected(value: unknown, options?: { claimUnit?: string | null }): void {
  expect(() => normalizeOpenAIClaimValue(value, options)).toThrow(MalformedCanonicalStudyProposalError);
  try {
    normalizeOpenAIClaimValue(value, options);
  } catch (error) {
    expect(error).toBeInstanceOf(MalformedCanonicalStudyProposalError);
    expect((error as MalformedCanonicalStudyProposalError).proposal).toBeUndefined();
    expect((error as Error).message).toContain("MALFORMED_PROPOSAL:invalid_claim_value");
  }
}

describe("CANONICAL_STUDY_PROPOSAL_V3_OPENAI_JSON_SCHEMA", () => {
  it("has no oneOf anywhere", () => {
    expect(pathsWithKeyword(CANONICAL_STUDY_PROPOSAL_V3_OPENAI_JSON_SCHEMA, "oneOf")).toEqual([]);
  });

  it("has no allOf anywhere", () => {
    expect(pathsWithKeyword(CANONICAL_STUDY_PROPOSAL_V3_OPENAI_JSON_SCHEMA, "allOf")).toEqual([]);
  });

  it("has no unsupported composition keywords", () => {
    for (const keyword of UNSUPPORTED_KEYWORDS) {
      expect(
        pathsWithKeyword(CANONICAL_STUDY_PROPOSAL_V3_OPENAI_JSON_SCHEMA, keyword),
        keyword,
      ).toEqual([]);
    }
  });

  it("has no unsupported anyOf patterns", () => {
    assertSupportedAnyOf(CANONICAL_STUDY_PROPOSAL_V3_OPENAI_JSON_SCHEMA, "proposal-v3-openai");
    expect(pathsWithKeyword(CANONICAL_STUDY_PROPOSAL_V3_OPENAI_JSON_SCHEMA, "anyOf")).toEqual([]);
  });

  it("has no untyped const or enum leaf schemas", () => {
    assertNoUntypedConstOrEnum(
      CANONICAL_STUDY_PROPOSAL_V3_OPENAI_JSON_SCHEMA,
      "proposal-v3-openai",
    );
  });

  it("requires additionalProperties false and every property on every object", () => {
    assertStrictOpenAISchema(CANONICAL_STUDY_PROPOSAL_V3_OPENAI_JSON_SCHEMA, "proposal-v3-openai");
  });

  it("accepts only canonical-study-proposal/3 for schemaVersion", () => {
    const root = CANONICAL_STUDY_PROPOSAL_V3_OPENAI_JSON_SCHEMA as unknown as {
      properties: { schemaVersion: { type: string; enum: string[] } };
    };
    expect(root.properties.schemaVersion.type).toBe("string");
    expect(root.properties.schemaVersion.enum).toEqual([CANONICAL_STUDY_PROPOSAL_SCHEMA_V3]);
    expect(root.properties.schemaVersion.enum).toHaveLength(1);
  });

  it("expresses ClaimValue as one strict object instead of oneOf", () => {
    const value = claimValueSchema();
    expect(value.type).toBe("object");
    expect(value.additionalProperties).toBe(false);
    expect(value.properties.kind.type).toBe("string");
    expect(value.properties.kind.enum).toEqual([
      "quantity",
      "text",
      "code",
      "boolean",
      "entity_ref",
      "date",
      "period",
      "unknown",
    ]);
    expect(Object.keys(value.properties).sort()).toEqual(
      [
        "booleanValue",
        "codeValue",
        "dateValue",
        "entityId",
        "kind",
        "numberValue",
        "periodEnd",
        "periodStart",
        "textValue",
        "unit",
      ].sort(),
    );
    expect([...value.required].sort()).toEqual(Object.keys(value.properties).sort());
  });
});

describe("OpenAI ClaimValue transport normalization", () => {
  it("normalizes every kind into the canonical union and drops null slots", () => {
    expect(normalizeOpenAIClaimValue(emptyTransport("quantity", { numberValue: 12 }))).toEqual({
      value: { kind: "quantity", amount: 12 },
      unit: undefined,
    });
    expect(
      normalizeOpenAIClaimValue(emptyTransport("quantity", { numberValue: 0, unit: "mg" })),
    ).toEqual({
      value: { kind: "quantity", amount: 0 },
      unit: "mg",
    });
    expect(normalizeOpenAIClaimValue(emptyTransport("text", { textValue: "annual" }))).toEqual({
      value: { kind: "text", text: "annual" },
      unit: undefined,
    });
    expect(normalizeOpenAIClaimValue(emptyTransport("code", { codeValue: "F84.0" }))).toEqual({
      value: { kind: "code", code: "F84.0" },
      unit: undefined,
    });
    expect(normalizeOpenAIClaimValue(emptyTransport("boolean", { booleanValue: false }))).toEqual({
      value: { kind: "boolean", value: false },
      unit: undefined,
    });
    expect(
      normalizeOpenAIClaimValue(emptyTransport("entity_ref", { entityId: "entity-1" })),
    ).toEqual({
      value: { kind: "entity_ref", entityId: "entity-1" },
      unit: undefined,
    });
    expect(normalizeOpenAIClaimValue(emptyTransport("date", { dateValue: "2024-05-01" }))).toEqual({
      value: { kind: "date", value: "2024-05-01" },
      unit: undefined,
    });
    expect(normalizeOpenAIClaimValue(emptyTransport("period"))).toEqual({
      value: { kind: "period" },
      unit: undefined,
    });
    expect(normalizeOpenAIClaimValue(emptyTransport("period", { periodStart: "2020-01-01" }))).toEqual({
      value: { kind: "period", start: "2020-01-01" },
      unit: undefined,
    });
    expect(normalizeOpenAIClaimValue(emptyTransport("period", { periodEnd: "2021-06-30" }))).toEqual({
      value: { kind: "period", end: "2021-06-30" },
      unit: undefined,
    });
    expect(
      normalizeOpenAIClaimValue(
        emptyTransport("period", { periodStart: "2020-01-01", periodEnd: "2021-06-30" }),
      ),
    ).toEqual({
      value: { kind: "period", start: "2020-01-01", end: "2021-06-30" },
      unit: undefined,
    });
    expect(normalizeOpenAIClaimValue(emptyTransport("unknown"))).toEqual({
      value: { kind: "unknown" },
      unit: undefined,
    });
  });

  it("keeps a matching quantity unit and passes a claim-level unit through", () => {
    expect(
      normalizeOpenAIClaimValue(emptyTransport("quantity", { numberValue: 3, unit: "sessions" }), {
        claimUnit: "sessions",
      }),
    ).toEqual({
      value: { kind: "quantity", amount: 3 },
      unit: "sessions",
    });
    expect(
      normalizeOpenAIClaimValue(emptyTransport("quantity", { numberValue: 3 }), {
        claimUnit: "sessions",
      }),
    ).toEqual({
      value: { kind: "quantity", amount: 3 },
      unit: "sessions",
    });
    expect(
      normalizeOpenAIClaimValue(emptyTransport("text", { textValue: "annual" }), {
        claimUnit: "sessions",
      }).unit,
    ).toBe("sessions");
  });

  it("rejects impossible kind and value combinations before canonical validation", () => {
    expectRejected(emptyTransport("quantity"));
    expectRejected(emptyTransport("quantity", { numberValue: Number.NaN }));
    expectRejected(emptyTransport("quantity", { numberValue: 1, textValue: "nope" }));
    expectRejected(emptyTransport("quantity", { numberValue: 1, unit: "mg" }), {
      claimUnit: "sessions",
    });
    expectRejected(emptyTransport("text"));
    expectRejected(emptyTransport("text", { textValue: "   " }));
    expectRejected(emptyTransport("text", { textValue: "annual", codeValue: "F84.0" }));
    expectRejected(emptyTransport("code"));
    expectRejected(emptyTransport("code", { codeValue: "F84.0", textValue: "annual" }));
    expectRejected(emptyTransport("boolean"));
    expectRejected(emptyTransport("boolean", { booleanValue: false, numberValue: 1 }));
    expectRejected(emptyTransport("entity_ref"));
    expectRejected(emptyTransport("entity_ref", { entityId: " " }));
    expectRejected(emptyTransport("date"));
    expectRejected(emptyTransport("period", { periodStart: "" }));
    expectRejected(emptyTransport("period", { numberValue: 1 }));
    expectRejected(emptyTransport("unknown", { textValue: "maybe" }));
    expectRejected(emptyTransport("unknown", { unit: "mg" }));
    expectRejected(emptyTransport("text", { textValue: "annual", unit: "mg" }));
    expectRejected(emptyTransport("other"));
    expectRejected({ kind: "quantity", amount: 1 });
    expectRejected(null);
    expectRejected([]);
  });

  it("produces values the canonical validator accepts without accepting the transport shape", () => {
    const cases: Array<{ transport: Record<string, unknown>; unit?: string }> = [
      { transport: emptyTransport("quantity", { numberValue: 12, unit: "mg" }), unit: "mg" },
      { transport: emptyTransport("text", { textValue: "annual" }) },
      { transport: emptyTransport("code", { codeValue: "F84.0" }) },
      { transport: emptyTransport("boolean", { booleanValue: true }) },
      { transport: emptyTransport("entity_ref", { entityId: "entity-1" }) },
      { transport: emptyTransport("date", { dateValue: "2024-05-01" }) },
      { transport: emptyTransport("period") },
      { transport: emptyTransport("period", { periodStart: "2020-01-01", periodEnd: "2021-01-01" }) },
      { transport: emptyTransport("unknown") },
    ];

    for (const entry of cases) {
      const normalized = normalizeOpenAIClaimValue(entry.transport);
      const result = validateCanonicalStudyProposal(
        proposalWithValue(normalized.value, normalized.unit),
      );
      expect(result.ok, JSON.stringify(normalized.value)).toBe(true);
    }

    const transportAsCanonical = validateCanonicalStudyProposal(
      proposalWithValue(emptyTransport("quantity", { numberValue: 4 })),
    );
    expect(transportAsCanonical.ok).toBe(false);

    const missingAmount = validateCanonicalStudyProposal(
      proposalWithValue({ kind: "quantity" }),
    );
    expect(missingAmount.ok).toBe(false);

    expect(CLAIM_VALUE_V3_JSON_SCHEMA.oneOf).toHaveLength(8);
  });
});
