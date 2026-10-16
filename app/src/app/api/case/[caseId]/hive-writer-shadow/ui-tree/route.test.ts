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
const runRoutePath = join(
  process.cwd(),
  "src/app/api/case/[caseId]/hive-writer-shadow/run/route.ts",
);
const emitWriterShadowPath = join(process.cwd(), "src/lib/hive-writer/emit-writer-shadow-requested.ts");

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

  it("run POST enqueues Inngest and never constructs the Writer HTTP client", () => {
    const serviceSource = readFileSync(shadowServicePath, "utf8");
    const runStart = serviceSource.indexOf("export async function runHiveWriterShadowForSession");
    expect(runStart).toBeGreaterThan(-1);
    const runFn = serviceSource.slice(runStart, runStart + 1200);
    expect(runFn).toMatch(/enqueueHiveWriterShadowPreviewRequest/);
    expect(runFn).toMatch(/emitWriterShadowRequestedEvent/);
    expect(runFn).not.toMatch(/createWriterHttpClient/);
    expect(runFn).not.toMatch(/runHiveWriterShadow\(/);

    const routeSource = readFileSync(runRoutePath, "utf8");
    expect(routeSource).toMatch(/runHiveWriterShadowForSession/);
    expect(routeSource).not.toMatch(/createWriterHttpClient/);

    const emitSource = readFileSync(emitWriterShadowPath, "utf8");
    expect(emitSource).toMatch(/HIVE_EVENT_WRITER_SHADOW_REQUESTED/);
    expect(emitSource).not.toMatch(/createWriterHttpClient/);
  });
});
