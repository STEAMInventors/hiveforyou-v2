import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

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

function pdfJsInstallRoots(): string[] {
  const cwd = process.cwd();
  const bases = [cwd, path.join(cwd, ".."), path.join(cwd, "../.."), path.join(cwd, "../../..")];
  const roots: string[] = [];
  for (const base of bases) {
    roots.push(path.join(base, "node_modules", "pdfjs-dist"));
    roots.push(path.join(base, "packages", "intake", "node_modules", "pdfjs-dist"));
    roots.push(path.join(base, "apps", "web", "node_modules", "pdfjs-dist"));
  }
  return roots;
}

function resolvePdfJsMainModuleHref(): string {
  for (const root of pdfJsInstallRoots()) {
    const mainPath = path.join(root, "legacy", "build", "pdf.mjs");
    if (existsSync(mainPath)) {
      return pathToFileURL(mainPath).href;
    }
  }
  throw new Error("pdfjs-dist legacy build could not be resolved from node_modules");
}

function resolveWorkerFileUrl(): string | null {
  for (const root of pdfJsInstallRoots()) {
    const workerPath = path.join(root, "legacy", "build", "pdf.worker.mjs");
    if (existsSync(workerPath)) {
      return toWorkerSrc(workerPath);
    }
  }
  return null;
}

let cachedPdfJs: PdfJsModule | null | undefined;
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
  if (cachedPdfJs === null) {
    throw new Error("pdfjs-dist could not be loaded");
  }
  try {
    const mainHref = resolvePdfJsMainModuleHref();
    const mod = (await import(/* webpackIgnore: true */ mainHref)) as PdfJsModule;
    if (!workerConfigured) {
      const workerSrc = resolveWorkerFileUrl();
      if (workerSrc) {
        mod.GlobalWorkerOptions.workerSrc = workerSrc;
      }
      workerConfigured = true;
    }
    cachedPdfJs = mod;
    return mod;
  } catch (error) {
    cachedPdfJs = null;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`pdfjs-dist could not be loaded: ${message}`);
  }
}
