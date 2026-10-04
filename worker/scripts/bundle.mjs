import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerRoot = path.join(__dirname, "..");
const repoRoot = path.join(workerRoot, "..");

const RUNTIME_EXTERNAL_EXACT = new Set(["inngest", "@supabase/supabase-js"]);
const RUNTIME_EXTERNAL_PREFIXES = [
  "@napi-rs/canvas",
  "pdfjs-dist",
  "onnxruntime-node",
  "@gutenye/ocr-node",
];

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function isHiveWorkspaceImport(importPath) {
  return importPath === "@hiveforyou" || importPath.startsWith("@hiveforyou/");
}

function isRuntimeExternal(importPath) {
  if (RUNTIME_EXTERNAL_EXACT.has(importPath)) {
    return true;
  }
  return RUNTIME_EXTERNAL_PREFIXES.some(
    (prefix) => importPath === prefix || importPath.startsWith(`${prefix}/`),
  );
}

mkdirSync(path.join(workerRoot, "dist"), { recursive: true });

await esbuild.build({
  entryPoints: [path.join(workerRoot, "src/main.ts")],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: path.join(workerRoot, "dist/main.js"),
  sourcemap: true,
  logLevel: "info",
  plugins: [
    {
      name: "bundle-with-runtime-externals",
      setup(build) {
        build.onResolve({ filter: /.*/ }, (args) => {
          if (args.path.startsWith(".") || path.isAbsolute(args.path)) {
            return undefined;
          }
          if (args.path.startsWith("node:")) {
            return undefined;
          }
          if (isHiveWorkspaceImport(args.path)) {
            return undefined;
          }
          if (isRuntimeExternal(args.path)) {
            return { path: args.path, external: true };
          }
          return undefined;
        });
      },
    },
  ],
});

const workerPkg = readJson("worker/package.json");
const dependencies = Object.fromEntries(
  Object.entries(workerPkg.dependencies ?? {}).filter(
    ([, version]) => typeof version === "string" && !version.startsWith("workspace:"),
  ),
);

const runtimePackage = {
  name: "@hiveforyou/worker-runtime",
  private: true,
  type: "module",
  engines: workerPkg.engines ?? { node: ">=22.4" },
  dependencies,
};

writeFileSync(
  path.join(workerRoot, "dist/package.json"),
  `${JSON.stringify(runtimePackage, null, 2)}\n`,
  "utf8",
);

console.info("[worker] bundled dist/main.js (Inngest + native packages external)");
