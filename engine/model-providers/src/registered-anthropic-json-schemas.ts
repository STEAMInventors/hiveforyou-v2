import { CANONICAL_STUDY_PROPOSAL_V3_OPENAI_JSON_SCHEMA } from "../../shared/src/case-intelligence/3/openai-proposal-json-schema";
import { CANONICAL_STUDY_PROPOSAL_V4_OPENAI_JSON_SCHEMA } from "../../shared/src/case-intelligence/4/openai-proposal-json-schema";
import { HIVE_DISCOVER_PROPOSAL_JSON_SCHEMA } from "../../shared/src/discover/json-schema";
import { HIVE_DISCOVER_PROPOSAL_V2_JSON_SCHEMA } from "../../shared/src/discover/json-schema-v2";
import { HIVE_DISCOVER_RESOLUTION_JSON_SCHEMA } from "../../shared/src/discover/json-schema-resolution";
import { CLIENT_SUMMARY_RESPONSE_JSON_SCHEMA } from "../../core/src/study/client-summary-pass";
import { CLIENT_WRITER_RESPONSE_JSON_SCHEMA } from "../../core/src/study/client-writer-pass";
import { STORY_WRITER_JSON_SCHEMA } from "../../core/src/study/story/generateStory";

export type RegisteredAnthropicJsonSchema = {
  name: string;
  schema: Record<string, unknown>;
};

/** Every json_schema name + schema exercised by check:anthropic-schemas and CallModel gates. */
export const REGISTERED_ANTHROPIC_JSON_SCHEMAS: RegisteredAnthropicJsonSchema[] = [
  { name: "hive_discover_proposal_v1", schema: HIVE_DISCOVER_PROPOSAL_JSON_SCHEMA as Record<string, unknown> },
  { name: "hive_discover_proposal_v2", schema: HIVE_DISCOVER_PROPOSAL_V2_JSON_SCHEMA as Record<string, unknown> },
  { name: "hive_discover_resolution", schema: HIVE_DISCOVER_RESOLUTION_JSON_SCHEMA as Record<string, unknown> },
  {
    name: "canonical_study_proposal_v3",
    schema: CANONICAL_STUDY_PROPOSAL_V3_OPENAI_JSON_SCHEMA as Record<string, unknown>,
  },
  {
    name: "canonical_study_proposal_v4",
    schema: CANONICAL_STUDY_PROPOSAL_V4_OPENAI_JSON_SCHEMA as Record<string, unknown>,
  },
  { name: "story_writer_v1", schema: STORY_WRITER_JSON_SCHEMA as Record<string, unknown> },
  { name: "client_summary_v1", schema: CLIENT_SUMMARY_RESPONSE_JSON_SCHEMA as Record<string, unknown> },
  { name: "client_writer_v2", schema: CLIENT_WRITER_RESPONSE_JSON_SCHEMA as Record<string, unknown> },
];
