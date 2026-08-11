/**
 * Re-reads the real latest deployment for each storefront from Vercel and
 * writes it back to storefront_sources.
 *
 * Useful after testing the webhook with a synthetic payload, and as a general
 * reconciliation if the stored ids ever drift from reality.
 *
 *   node scripts/resync-deployment-ids.cjs
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const ROOT = path.resolve(__dirname, "..");

function env() {
  const out = {};
  const strip = (v) => v.replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = strip(m[2].trim());
  }
  return out;
}

async function latest(e, projectId, branch) {
  const url =
    `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}` +
    `&meta-githubCommitRef=${encodeURIComponent(branch)}&limit=1` +
    `&teamId=${encodeURIComponent(e.VERCEL_STOREFRONT_TEAM_ID)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${e.VERCEL_STOREFRONT_TOKEN}` } });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return (j.deployments || [])[0] || null;
}

(async () => {
  const e = env();
  const db = new Client({ connectionString: e.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    const { rows } = await db.query(
      `SELECT company_id, vercel_project_id, repository_full_name
         FROM storefront_sources WHERE vercel_project_id IS NOT NULL`
    );
    for (const r of rows) {
      console.log(r.repository_full_name);
      for (const [branch, col] of [["preview", "preview"], ["main", "production"]]) {
        const d = await latest(e, r.vercel_project_id, branch);
        if (!d) { console.log(`  ${branch}: no deployment found`); continue; }
        const id = d.uid || d.id;
        const state = d.readyState || d.state || "READY";
        await db.query(
          `UPDATE storefront_sources
              SET ${col}_deployment_id = $2, ${col}_deployment_status = $3, updated_at = NOW()
            WHERE company_id = $1`,
          [r.company_id, id, state]
        );
        console.log(`  ${branch}: ${id} (${state})`);
      }
    }
  } finally { await db.end(); }
})().catch((err) => { console.error("FAILED:", err.message); process.exit(1); });
