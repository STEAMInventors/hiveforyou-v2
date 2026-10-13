import { createHash } from "node:crypto";

export function stableId(material: string): string {
  return createHash("sha256").update(material).digest("hex").slice(0, 16);
}
