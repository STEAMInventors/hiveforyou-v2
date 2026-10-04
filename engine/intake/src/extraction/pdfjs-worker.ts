import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type PdfJsModule = {
  getDocument: (params: Record<string, unknown>) => { promise: Promise<unknown> };
  GlobalWorkerOptions: { workerSrc: string };
  OPS?: {
    paintImageXObject: number;
    paintImageXObjectRepeat: number;
    paintInlineImageXObject: number;
  };
};

export type PdfJsWithOps = {
  getDocument: PdfJsModule["getDocument"];
  OPS: NonNullable<PdfJsModule["OPS"]>;
};

const require = createRequire(import.meta.url);

function toWorkerSrc(pathOrUrl: string): string {
  if (
    pathOrUrl.startsWith("file:") ||
    pathOrUrl.startsWith("data:") ||
    pathOrUrl.startsWith("http:") ||
    pathOrUrl.startsWith("https:")
  ) {
    return pathOrUrl;
  }
  return pathToFileURL(pathOrUrl).href;
}

function resolvePdfJsModulePaths(): { mainHref: string; workerSrc: string | null } {
  try {
    const mainPath = require.resolve("pdfjs-dist/legacy/build/pdf.mjs");
    let workerSrc: string | null = null;
    try {
      workerSrc = toWorkerSrc(require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"));
    } catch {
      workerSrc = null;
    }
    return { mainHref: pathToFileURL(mainPath).href, workerSrc };
  } catch {
    // Fall back to legacy layout discovery (tests / odd monorepo layouts).
  }

  const cwd = process.cwd();
  const bases = [cwd, path.join(cwd, ".."), path.join(cwd, "../.."), path.join(cwd, "../../..")];
  for (const base of bases) {
    for (const root of [
      path.join(base, "node_modules", "pdfjs-dist"),
      path.join(base, "engine", "intake", "node_modules", "pdfjs-dist"),
      path.join(base, "packages", "intake", "node_modules", "pdfjs-dist"),
    ]) {
      const mainPath = path.join(root, "legacy", "build", "pdf.mjs");
      if (existsSync(mainPath)) {
        const workerPath = path.join(root, "legacy", "build", "pdf.worker.mjs");
        return {
          mainHref: pathToFileURL(mainPath).href,
          workerSrc: existsSync(workerPath) ? toWorkerSrc(workerPath) : null,
        };
      }
    }
  }
  throw new Error("pdfjs-dist legacy build could not be resolved from node_modules");
}

let cachedPdfJs: PdfJsModule | undefined;
let workerConfigured = false;

export async function loadPdfJsWithOps(): Promise<PdfJsWithOps> {
  const mod = await loadPdfJs();
  if (!mod.OPS) {
    throw new Error("pdfjs-dist OPS table is unavailable");
  }
  return { getDocument: mod.getDocument, OPS: mod.OPS };
}

export async function loadPdfJs(): Promise<PdfJsModule> {
  if (cachedPdfJs) {
    return cachedPdfJs;
  }
  try {
    const { mainHref, workerSrc } = resolvePdfJsModulePaths();
    const mod = (await import(/* webpackIgnore: true */ mainHref)) as PdfJsModule;
    if (!workerConfigured && workerSrc) {
      mod.GlobalWorkerOptions.workerSrc = workerSrc;
      workerConfigured = true;
    }
    cachedPdfJs = mod;
    return mod;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`pdfjs-dist could not be loaded: ${message}`);
  }
}
