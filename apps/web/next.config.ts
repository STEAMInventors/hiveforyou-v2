import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: [
    "@hiveforyou/shared",
    "@hiveforyou/core",
    "@hiveforyou/canonical",
    "@hiveforyou/domain-packs",
  ],
  outputFileTracingIncludes: {
    "/api/study/run": ["../../packages/core/prompts/**/*"],
  },
};

export default nextConfig;
