import type { Rulebook } from "@hiveforyou/domain-pack-shared/rulebook/schema";

import { IEP_DOCUMENT_GUIDE } from "./guides/iep.ts";
import { IEP_RULES } from "./rules.ts";
import { IEP_TERMS } from "./terms.ts";

export const iepRulebook = {
  domain: "iep",
  jurisdiction: "US federal",
  reviewStatus: "reviewed",
  version: "1.0.1",
  rules: IEP_RULES,
  terms: IEP_TERMS,
  guides: [IEP_DOCUMENT_GUIDE],
} satisfies Rulebook;

export { IEP_DOCUMENT_GUIDE, IEP_RULES, IEP_TERMS };
