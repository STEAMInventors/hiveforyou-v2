import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const publicDir = path.join(root, "public");

const legacyBuild = path.join(root, "node_modules", "pdfjs-dist", "legacy", "build");
const modernBuild = path.join(root, "node_modules", "pdfjs-dist", "build");

function firstExisting(paths) {
  return paths.find((p) => existsSync(p));
}

const workerSource = firstExisting([
  path.join(legacyBuild, "pdf.worker.min.mjs"),
  path.join(modernBuild, "pdf.worker.min.mjs"),
]);
const moduleSource = firstExisting([
  path.join(legacyBuild, "pdf.min.mjs"),
  path.join(modernBuild, "pdf.min.mjs"),
]);

if (!workerSource || !moduleSource) {
  console.warn("[sync-pdf-worker] pdfjs-dist assets not found; skip");
  process.exit(0);
}

copyFileSync(workerSource, path.join(publicDir, "pdf.worker.min.mjs"));
copyFileSync(moduleSource, path.join(publicDir, "pdf.min.mjs"));
console.log(
  `[sync-pdf-worker] synced ${path.relative(root, moduleSource)} → public/pdf.min.mjs, worker → public/pdf.worker.min.mjs`,
);
