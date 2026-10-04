import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: [
    "pdfjs-dist",
    "pdfjs-dist/legacy/build/pdf.mjs",
    "@napi-rs/canvas",
    "@napi-rs/canvas-win32-x64-msvc",
    "@gutenye/ocr-node",
    "onnxruntime-node",
    "alasql",
  ],
  outputFileTracingRoot: path.join(__dirname, "../.."),
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
    "/api/study/run": ["../../engine/core/prompts/**/*"],
  },
};

export default nextConfig;
