/**
 * One-off backfill: attach custom domains to storefronts created before domain
 * assignment existed.
 *
 *   node scripts/backfill-storefront-domains.js            dry run (default)
 *   node scripts/backfill-storefront-domains.js --apply    actually do it
 *
 * Derives the hostname from repository_full_name rather than store_unique_name,
 * because the repo name is what the Vercel project was actually named - using a
 * different source could produce a hostname that doesn't match the project.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const APPLY = process.argv.includes("--apply");
const ROOT = path.resolve(__dirname, "..");

function env() {
  const out = {};
  for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

/** Same normalisation as vercelProjectName(), so hostname and project agree. */
function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[._-]+|[._-]+$/g, "").slice(0, 100);
}

async function vercel(cfg, p, init = {}) {
  const sep = p.includes("?") ? "&" : "?";
  const url = `https://api.vercel.com${p}${cfg.teamId ? `${sep}teamId=${encodeURIComponent(cfg.teamId)}` : ""}`;
  const r = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json", ...init.headers },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

(async () => {
  const e = env();
  const cfg = { token: e.VERCEL_STOREFRONT_TOKEN, teamId: e.VERCEL_STOREFRONT_TEAM_ID };
  const rootDomain = e.STOREFRONT_ROOT_DOMAIN || "markit.co.in";
  if (!cfg.token) throw new Error("VERCEL_STOREFRONT_TOKEN missing from .env");

  const db = new Client({ connectionString: e.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  try {
    const { rows } = await db.query(
      `SELECT company_id, repository_full_name, vercel_project_id, production_url, preview_branch_url
         FROM storefront_sources
        WHERE vercel_project_id IS NOT NULL AND repository_full_name IS NOT NULL`
    );
    console.log(`${APPLY ? "APPLYING" : "DRY RUN"} - ${rows.length} storefront(s), root domain ${rootDomain}\n`);

    for (const r of rows) {
      const name = slug(r.repository_full_name.split("/").pop());
      const production = `${name}.${rootDomain}`;
      const preview = `preview-${name}.${rootDomain}`;
      console.log(`${r.repository_full_name}`);
      console.log(`  production -> ${production}`);
      console.log(`  preview    -> ${preview}`);

      if (!APPLY) { console.log("  (dry run, nothing changed)\n"); continue; }

      for (const [host, branch] of [[production, null], [preview, "preview"]]) {
        try {
          await vercel(cfg, `/v10/projects/${encodeURIComponent(r.vercel_project_id)}/domains`, {
            method: "POST",
            body: JSON.stringify({ name: host, ...(branch ? { gitBranch: branch } : {}) }),
          });
          console.log(`  attached ${host}`);
        } catch (err) {
          // 409 usually means "already attached to this project" - fine.
          const msg = String(err.message);
          if (msg.startsWith("409")) console.log(`  ${host} already attached`);
          else console.log(`  FAILED ${host}: ${msg}`);
        }
      }

      await db.query(
        `UPDATE storefront_sources
            SET production_url = $2, preview_branch_url = $3, updated_at = NOW()
          WHERE company_id = $1`,
        [r.company_id, `https://${production}`, `https://${preview}`]
      );
      console.log("  db updated\n");
    }

    if (!APPLY) console.log("Re-run with --apply to make these changes.");
  } finally { await db.end(); }
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
