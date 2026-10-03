import type { Rulebook } from "@hiveforyou/domain-pack-shared/rulebook/schema";

import { BANKRUPTCY_RULES } from "./rules.ts";
import { BANKRUPTCY_TERMS } from "./terms.ts";

export const bankruptcyRulebook = {
  domain: "bankruptcy",
  jurisdiction: "US federal",
  reviewStatus: "draft",
  version: "0.1.0",
  rules: BANKRUPTCY_RULES,
  terms: BANKRUPTCY_TERMS,
  guides: [],
} satisfies Rulebook;
