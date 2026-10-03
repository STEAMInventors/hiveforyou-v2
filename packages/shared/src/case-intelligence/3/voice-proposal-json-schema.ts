import type { JsonSchema } from "./json-schema";

const nonEmptyString: JsonSchema = { type: "string", minLength: 1 };

/** Contract validator allows null (OpenAI strict uses string | null). */
const stringOrNull: JsonSchema = {
  anyOf: [{ type: "string" }, { enum: [null] as unknown as readonly string[] }],
};

const voiceFromOrNull: JsonSchema = {
  anyOf: [
    { type: "string", enum: ["user_text", "document"] },
    { enum: [null] as unknown as readonly string[] },
  ],
};

const voiceEvidenceRefSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: nonEmptyString,
    sourceDocumentId: nonEmptyString,
    logicalDocumentId: { type: "string" },
    page: { type: "integer", minimum: 1 },
    pageEnd: { type: "integer", minimum: 1 },
    spanStart: { type: "integer", minimum: 0 },
    spanEnd: { type: "integer", minimum: 0 },
    snippet: { type: "string" },
    extractionId: { type: "string" },
    sourceType: { type: "string", enum: ["document"] },
  },
  required: ["id", "sourceDocumentId", "sourceType"],
};

const voiceProposalTokenSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    value: stringOrNull,
    from: voiceFromOrNull,
    evidenceRefs: {
      anyOf: [
        { type: "array", items: voiceEvidenceRefSchema },
        { enum: [null] as unknown as readonly string[] },
      ],
    },
  },
  required: ["value", "from"],
};

export const voiceProposalSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    subject: voiceProposalTokenSchema,
    eventNoun: voiceProposalTokenSchema,
    helperNoun: voiceProposalTokenSchema,
    otherPartyNoun: voiceProposalTokenSchema,
    subjectName: voiceProposalTokenSchema,
  },
  required: ["subject", "eventNoun", "helperNoun", "otherPartyNoun", "subjectName"],
};
