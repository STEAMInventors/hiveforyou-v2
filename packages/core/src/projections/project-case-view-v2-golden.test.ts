import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  l001CaseViewV2ProjectionLogicalDocuments,
  l001CaseViewV2ProjectionSnapshot,
} from "./fixtures/l001-case-view-v2-projection";
import { projectCaseViewV2Minimal } from "./project-case-view-v2-minimal";
import { renderCaseViewV2ClientText } from "./render-case-view-v2-client-text";

const here = dirname(fileURLToPath(import.meta.url));
const goldenPath = join(here, "fixtures", "l001-case-view-v2-golden.txt");

describe("L001 client view golden text", () => {
  it("matches approved plain-text snapshot", () => {
    const view = projectCaseViewV2Minimal({
      intelligence: l001CaseViewV2ProjectionSnapshot(),
      logicalDocuments: l001CaseViewV2ProjectionLogicalDocuments(),
      userText: "Prepare for my IEP meeting",
    });
    const text = renderCaseViewV2ClientText(view);
    const expected = readFileSync(goldenPath, "utf8");
    expect(text.replace(/\r\n/g, "\n")).toBe(expected.replace(/\r\n/g, "\n"));
  });
});
