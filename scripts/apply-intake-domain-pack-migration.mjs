/**
 * Applies 20261001120000_intake_domain_pack.sql when DATABASE_URL
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

loadEnv(path.join(root, "apps/web/.env.local"));
loadEnv(path.join(root, ".env.local"));

const dbUrl =
  process.env.DATABASE_URL ??
  process.env.SUPABASE_DB_URL ??
  process.env.DIRECT_URL;

if (!dbUrl) {
  console.error(
    "Set DATABASE_URL, SUPABASE_DB_URL, or DIRECT_URL in apps/web/.env.local.",
  );
  process.exit(1);
}

const require = createRequire(import.meta.url);
const pg = require("pg");

const migrationPath = path.join(
  root,
  "supabase/migrations/20261001120000_intake_domain_pack.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8");

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
try {
  await client.query(sql);
  const columns = await client.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'hive'
      and table_name = 'intake_runs'
      and column_name in (
        'raw_intent',
        'explicit_domain_id',
        'jev_domain_proposal',
        'jev_domain_confidence',
        'resolved_domain_id',
        'resolution_source',
        'study_path',
        'pack_execution'
      )
    order by column_name
  `);
  console.log(
    JSON.stringify(
      {
        ok: true,
        migration: path.basename(migrationPath),
        intakeRunColumns: columns.rows.map((row) => row.column_name),
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
