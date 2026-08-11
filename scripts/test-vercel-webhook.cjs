/**
 * Exercises the Vercel webhook route without waiting for a real deployment.
 *
 * Sends a correctly signed payload (must be accepted and update the DB) and a
 * badly signed one (must be rejected 401). Reads the secret from .env so it
 * never appears on a command line.
 *
 *   node scripts/test-vercel-webhook.cjs [url]
 *   default url: http://localhost:3000/api/webhooks/vercel
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHmac } = require("node:crypto");
const { Client } = require("pg");

const ROOT = path.resolve(__dirname, "..");
const URL_ = process.argv[2] || "http://localhost:3000/api/webhooks/vercel";

function env() {
  const out = {};
  for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

async function post(body, signature) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { "content-type": "application/json", "x-vercel-signature": signature },
    body,
  });
  return { status: r.status, text: (await r.text()).slice(0, 200) };
}

(async () => {
  const e = env();
  if (!e.VERCEL_WEBHOOK_SECRET) throw new Error("VERCEL_WEBHOOK_SECRET missing from .env");

  const db = new Client({ connectionString: e.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const { rows } = await db.query(
    `SELECT vercel_project_id, preview_deployment_status FROM storefront_sources
      WHERE vercel_project_id IS NOT NULL LIMIT 1`
  );
  if (!rows[0]) throw new Error("no storefront with a vercel_project_id to test against");
  const projectId = rows[0].vercel_project_id;
  console.log(`target project ${projectId}`);
  console.log(`preview status before: ${rows[0].preview_deployment_status}`);

  const payload = JSON.stringify({
    id: "evt_test",
    type: "deployment.succeeded",
    payload: {
      project: { id: projectId },
      deployment: {
        id: "dpl_webhook_test",
        url: "preview-reezc.markit.co.in",
        meta: { githubCommitRef: "preview" },
      },
      target: "preview",
    },
  });
  const good = createHmac("sha1", e.VERCEL_WEBHOOK_SECRET).update(payload).digest("hex");

  console.log("\n1. bad signature (expect 401)");
  console.log("  ", JSON.stringify(await post(payload, "deadbeef")));

  console.log("\n2. no signature (expect 401)");
  console.log("  ", JSON.stringify(await post(payload, undefined)));

  console.log("\n3. valid signature (expect 200)");
  console.log("  ", JSON.stringify(await post(payload, good)));

  const after = await db.query(
    `SELECT preview_deployment_id, preview_deployment_status, preview_deployment_url
       FROM storefront_sources WHERE vercel_project_id = $1`, [projectId]
  );
  console.log("\npreview columns after:", JSON.stringify(after.rows[0]));
  await db.end();
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
