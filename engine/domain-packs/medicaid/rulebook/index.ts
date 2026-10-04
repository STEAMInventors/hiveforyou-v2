import type { Rulebook } from "@hiveforyou/domain-pack-shared/rulebook/schema";

import { MEDICAID_NOTICE_GUIDE } from "./guides/notice-of-action.ts";
import { MEDICAID_RULES } from "./rules.ts";
import { MEDICAID_TERMS } from "./terms.ts";

export const medicaidRulebook = {
  domain: "medicaid",
  jurisdiction: "US federal",
  reviewStatus: "draft",
  version: "0.1.0",
  rules: MEDICAID_RULES,
  terms: MEDICAID_TERMS,
  guides: [MEDICAID_NOTICE_GUIDE],
} satisfies Rulebook;
