import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Temporary for staging: allow Vercel deploy while shared type debt is cleared. */
const allowTypeErrors = process.env.HIVE_ALLOW_TYPE_ERRORS === "1";

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
  transpilePackages: [
    "@hiveforyou/shared",
    "@hiveforyou/core",
    "@hiveforyou/canonical",
    "@hiveforyou/domain-pack",
    "@hiveforyou/domain-packs",
    "@hiveforyou/intake",
    "@hiveforyou/intake-node",
  ],
  outputFileTracingIncludes: {
    "/**/*": ["../engine/core/prompts/**/*"],
  },
};

export default nextConfig;
