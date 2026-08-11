/**
 * Push VITE_EDITOR_ORIGIN to existing storefront projects and rebuild them.
 *
 * The storefront only accepts preview/element-picker messages from origins in
 * VITE_EDITOR_ORIGIN. Add a new editor URL (e.g. https://local.markit.co.in)
 * and existing storefronts keep ignoring it until they are REBUILT - VITE_ vars
 * are baked in at build time, so updating the Vercel env alone changes nothing.
 *
 *   node scripts/resync-editor-origin.cjs            dry run
 *   node scripts/resync-editor-origin.cjs --apply    update env + redeploy preview
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const APPLY = process.argv.includes("--apply");
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

async function vercel(e, p, init = {}) {
  const sep = p.includes("?") ? "&" : "?";
  const url = `https://api.vercel.com${p}${sep}teamId=${encodeURIComponent(e.VERCEL_STOREFRONT_TEAM_ID)}`;
  const r = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${e.VERCEL_STOREFRONT_TOKEN}`, "Content-Type": "application/json", ...init.headers },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${text.slice(0, 250)}`);
  return text ? JSON.parse(text) : null;
}

(async () => {
  const e = env();
  const origin = e.VERCEL_STOREFRONT_EDITOR_ORIGIN;
  if (!origin) throw new Error("VERCEL_STOREFRONT_EDITOR_ORIGIN missing from .env");
  console.log(`${APPLY ? "APPLYING" : "DRY RUN"}\nVITE_EDITOR_ORIGIN = ${origin}\n`);

  const db = new Client({ connectionString: e.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    const { rows } = await db.query(
      `SELECT repository_id, repository_full_name, vercel_project_id
         FROM storefront_sources
        WHERE vercel_project_id IS NOT NULL AND repository_id IS NOT NULL`
    );
    for (const r of rows) {
      const projectName = r.repository_full_name.split("/").pop();
      console.log(r.repository_full_name);
      if (!APPLY) { console.log("  would update env + redeploy preview\n"); continue; }

      // Preview only. Production deliberately gets an empty value so a live
      // storefront never accepts editor messages from anywhere.
      await vercel(e, `/v10/projects/${encodeURIComponent(r.vercel_project_id)}/env?upsert=true`, {
        method: "POST",
        body: JSON.stringify({ key: "VITE_EDITOR_ORIGIN", value: origin, type: "plain", target: ["preview"] }),
      });
      console.log("  env updated");

      const d = await vercel(e, "/v13/deployments", {
        method: "POST",
        body: JSON.stringify({
          name: projectName,
          project: r.vercel_project_id,
          gitSource: { type: "github", repoId: Number(r.repository_id), ref: "preview" },
        }),
      });
      console.log(`  rebuilding preview -> ${d.id || d.uid}\n`);
    }
    if (!APPLY) console.log("Re-run with --apply.");
  } finally { await db.end(); }
})().catch((err) => { console.error("FAILED:", err.message); process.exit(1); });
