import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const shadowServicePath = join(
  process.cwd(),
  "src/lib/hive-writer/hive-writer-shadow-service-server.ts",
);
const canonicalReportPath = join(
  process.cwd(),
  "src/lib/canonical-report/canonical-report-service-server.ts",
);
const uiTreeRoutePath = join(
  process.cwd(),
  "src/app/api/case/[caseId]/hive-writer-shadow/ui-tree/route.ts",
);

describe("hive-writer-shadow ui-tree route wiring", () => {
  it("ui-tree loader re-validates persisted records without calling runHiveWriterShadow", () => {
    const source = readFileSync(shadowServicePath, "utf8");
    expect(source).toMatch(/resolveWriterHiveUiTreeForPreview/);
    const previewStart = source.indexOf("export async function loadWriterHiveUiTreePreviewForSession");
    expect(previewStart).toBeGreaterThan(-1);
    const previewFn = source.slice(previewStart, previewStart + 600);
    expect(previewFn).not.toMatch(/runHiveWriterShadow/);
    expect(previewFn).not.toMatch(/createWriterHttpClient/);
  });

  it("ui-tree route is read-only GET", () => {
    const source = readFileSync(uiTreeRoutePath, "utf8");
    expect(source).toMatch(/loadWriterHiveUiTreePreviewForSession/);
    expect(source).not.toMatch(/runHiveWriterShadowForSession/);
  });

  it("canonical report GET path does not invoke Writer shadow generation", () => {
    const source = readFileSync(canonicalReportPath, "utf8");
    expect(source).not.toMatch(/runHiveWriterShadow/);
    expect(source).not.toMatch(/hive-writer-shadow/);
  });

  it("preview enqueue does not open a Writer HTTP client", () => {
    const source = readFileSync(shadowServicePath, "utf8");
    expect(source).toMatch(/HIVE_EVENT_WRITER_SHADOW_REQUESTED/);
    expect(source).toMatch(/planWriterShadowPreviewRequest/);
    expect(source).not.toMatch(/createWriterHttpClient/);
    expect(source).not.toMatch(/runHiveWriterShadow\(/);
  });
});
