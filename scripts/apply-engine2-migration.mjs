/**
 * Applies 20260928180000_engine2_study_artifacts_projections.sql when DATABASE_URL
 * (or SUPABASE_DB_URL / DIRECT_URL) is set. Safe to re-run (IF NOT EXISTS).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i);
    let v = t.slice(i + 1);
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv(path.join(root, "app/.env.local"));
loadEnv(path.join(root, ".env.local"));

const dbUrl =
  process.env.DATABASE_URL ??
  process.env.SUPABASE_DB_URL ??
  process.env.DIRECT_URL;

if (!dbUrl) {
  console.error(
    "Set DATABASE_URL, SUPABASE_DB_URL, or DIRECT_URL (Session pooler / direct Postgres) in app/.env.local.",
  );
  process.exit(1);
}

const require = createRequire(import.meta.url);
const pg = require("pg");

const migrationPath = path.join(
  root,
  "supabase/migrations/20260928180000_engine2_study_artifacts_projections.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8");

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
try {
  await client.query(sql);
  console.log("Applied:", path.basename(migrationPath));
} finally {
  await client.end();
}
