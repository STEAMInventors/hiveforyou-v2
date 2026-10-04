/**
 * Intake's pdfjs loader walks `packages/intake/node_modules/pdfjs-dist` from repo roots.
 * After the engine/ layout move, wire that legacy path to `engine/intake` for tests only.
 */
import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const iepRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(iepRoot, "../../..");
const engineIntake = path.join(repoRoot, "engine", "intake");
const packagesDir = path.join(repoRoot, "packages");
const packagesIntake = path.join(packagesDir, "intake");

if (existsSync(engineIntake) && !existsSync(packagesIntake)) {
  mkdirSync(packagesDir, { recursive: true });
  symlinkSync(engineIntake, packagesIntake, "junction");
}
