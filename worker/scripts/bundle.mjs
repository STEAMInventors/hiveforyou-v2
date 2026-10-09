import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerRoot = path.join(__dirname, "..");
const repoRoot = path.join(workerRoot, "..");
const BUNDLE_TARGETS = [
  {
    entry: path.join(workerRoot, "src/main.ts"),
    outFile: path.join(workerRoot, "dist/main.js"),
    label: "dist/main.js",
  },
  {
    entry: path.join(workerRoot, "scripts/l001-agentic-reader-qualification.ts"),
    outFile: path.join(workerRoot, "dist/l001-agentic-reader-qualification.js"),
    label: "dist/l001-agentic-reader-qualification.js",
  },
];

const ESM_BANNER = `import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
`;

const RUNTIME_EXTERNAL_PREFIXES = [
  "inngest",
  "@supabase/supabase-js",
  "@napi-rs/canvas",
  "pdfjs-dist",
  "onnxruntime-node",
  "@gutenye/ocr-node",
  "zod",
  "standardwebhooks",
];

/** If any marker appears in dist/main.js, that package was bundled instead of external. */
const BUNDLED_MARKERS_BY_EXTERNAL = [
  { label: "inngest", markers: ["inngest/components"] },
  { label: "@supabase/supabase-js", markers: ["@supabase/auth-js", "@supabase/postgrest-js"] },
  { label: "@napi-rs/canvas", markers: ["@napi-rs/canvas/index"] },
  { label: "pdfjs-dist", markers: ["pdfjs-dist/build/pdf"] },
  { label: "onnxruntime-node", markers: ["onnxruntime-node/dist"] },
  { label: "@gutenye/ocr-node", markers: ["@gutenye/ocr-node/dist"] },
];

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function isHiveWorkspaceImport(importPath) {
  return importPath === "@hiveforyou" || importPath.startsWith("@hiveforyou/");
}

function isRuntimeExternal(importPath) {
  return RUNTIME_EXTERNAL_PREFIXES.some(
    (prefix) => importPath === prefix || importPath.startsWith(`${prefix}/`),
  );
}

function assertNoBundledRuntimePackages(bundleText) {
  for (const { label, markers } of BUNDLED_MARKERS_BY_EXTERNAL) {
    for (const marker of markers) {
      if (bundleText.includes(marker)) {
        throw new Error(
          `[worker] bundle verification failed: found "${marker}" (${label} must stay external)`,
        );
      }
    }
  }
}

/** Banner + bundled sources may each import createRequire; keep one top-level import. */
function dedupeCreateRequireImports(bundleText) {
  let seen = false;
  return bundleText.replace(/^import \{ createRequire \} from "node:module";\r?\n/gm, (line) => {
    if (seen) {
      return "";
    }
    seen = true;
    return line;
  });
}

mkdirSync(path.join(workerRoot, "dist"), { recursive: true });

const runtimeExternalPlugin = {
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
};

for (const target of BUNDLE_TARGETS) {
  await esbuild.build({
    entryPoints: [target.entry],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    outfile: target.outFile,
    banner: { js: ESM_BANNER },
    sourcemap: true,
    logLevel: "info",
    plugins: [runtimeExternalPlugin],
  });

  let bundleText = readFileSync(target.outFile, "utf8");
  bundleText = dedupeCreateRequireImports(bundleText);
  writeFileSync(target.outFile, bundleText, "utf8");
  assertNoBundledRuntimePackages(bundleText);
  console.info(`[worker] bundled ${target.label} (Inngest + native packages external)`);
}

const workerPkg = readJson("worker/package.json");
const dependencies = Object.fromEntries(
  Object.entries(workerPkg.dependencies ?? {}).filter(
    ([, version]) => typeof version === "string" && !version.startsWith("workspace:"),
  ),
);

if (!dependencies.inngest) {
  throw new Error("[worker] dist/package.json must list inngest in dependencies");
}

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
