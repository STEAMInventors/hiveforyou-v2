import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Temporary for staging: allow Vercel deploy while shared type debt is cleared. */
const allowTypeErrors = process.env.HIVE_ALLOW_TYPE_ERRORS === "1";

/**
 * Pack-driven study idempotency reads this file at queue time (see queueCanonicalStudyRun).
 * Include globs are resolved from the Next project dir (`app/`), not `outputFileTracingRoot`.
 * Use a monorepo-relative path (`../brain/…`); absolute paths duplicate on Vercel
 * (`…/app/vercel/path0/brain/…`).
 */
const packDrivenProposalPackTracePath = path.posix.join(
  "..",
  "brain",
  "domain-packs",
  "iep",
  "iep-pack.v0.3.proposed.json",
);

/** Reader envelope pin for persisted extractions (content-addressed snapshot). */
const readerHistoricalPackSnapshotHash =
  "c2baa0439d32496a3110f5388f6048395a9f4c8fdce79b3d0cec36ae6b9a7775";

const readerHistoricalPackSnapshotTracePath = path.posix.join(
  "..",
  "brain",
  "domain-packs",
  "iep",
  "snapshots",
  `${readerHistoricalPackSnapshotHash}.json`,
);

/** Canonical Study Inspector resolves envelope pins from snapshots before the live proposed pack. */
const canonicalStudyRunPackTracePaths = [
  packDrivenProposalPackTracePath,
  readerHistoricalPackSnapshotTracePath,
] as const;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: allowTypeErrors,
  },
  serverExternalPackages: [
    "pdfjs-dist",
    "pdfjs-dist/legacy/build/pdf.mjs",
    "@napi-rs/canvas",
    "@napi-rs/canvas-win32-x64-msvc",
    "@gutenye/ocr-node",
    "onnxruntime-node",
    "alasql",
  ],
  outputFileTracingRoot: path.join(__dirname, ".."),
  outputFileTracingIncludes: {
    "/api/intake/runs/[intakeRunId]/study": [packDrivenProposalPackTracePath],
    "/api/case/[caseId]/canonical-study/run": [...canonicalStudyRunPackTracePaths],
  },
  transpilePackages: [
    "@hiveforyou/shared",
    "@hiveforyou/core",
    "@hiveforyou/canonical",
    "@hiveforyou/domain-pack",
    "@hiveforyou/domain-packs",
    "@hiveforyou/intake",
    "@hiveforyou/intake-node",
  ],
  webpack(config) {
    config.resolve ??= {};
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    return config;
  },
};

export default nextConfig;
