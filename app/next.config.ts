import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Temporary for staging: allow Vercel deploy while shared type debt is cleared. */
const allowTypeErrors = process.env.HIVE_ALLOW_TYPE_ERRORS === "1";

/** Pack-driven study idempotency reads this file at queue time (see queueCanonicalStudyRun). */
const packDrivenProposalPackTracePath = path.join(
  __dirname,
  "..",
  "brain",
  "domain-packs",
  "iep",
  "iep-pack.v0.3.proposed.json",
);

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
