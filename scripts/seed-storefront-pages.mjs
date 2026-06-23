/**
 * One-shot seed: upserts all default storefront page configs for a company.
 * Usage:  node scripts/seed-storefront-pages.mjs [companyId]
 * Default company: 02856c86-60b8-41a4-ba18-79dbd55bf016
 */
import { createRequire } from 'module'
import { readFileSync }  from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join }  from 'path'
import pg from 'pg'

const require = createRequire(import.meta.url)
const __dir   = dirname(fileURLToPath(import.meta.url))

// ── Config ────────────────────────────────────────────────────────────────────

const COMPANY_ID = process.argv[2] || '02856c86-60b8-41a4-ba18-79dbd55bf016'

// Read DATABASE_URL from .env (simple line-based parser)
const envPath = join(__dir, '..', '.env')
const envLines = readFileSync(envPath, 'utf8').split('\n')
let DATABASE_URL = ''
for (const line of envLines) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('#') && trimmed.startsWith('DATABASE_URL=')) {
    DATABASE_URL = trimmed.replace('DATABASE_URL=', '').replace(/^["']|["']$/g, '')
    break
  }
}

if (!DATABASE_URL) {
  console.error('❌  DATABASE_URL not found in .env')
  process.exit(1)
}

// ── Load page configs ─────────────────────────────────────────────────────────

const pagesDir = join(__dir, '..', 'lib', 'ecom-engine-default-pages')

const PAGES = {
  home:          JSON.parse(readFileSync(join(pagesDir, 'home.json'),        'utf8')),
  about:         JSON.parse(readFileSync(join(pagesDir, 'about.json'),       'utf8')),
  contact:       JSON.parse(readFileSync(join(pagesDir, 'contact.json'),     'utf8')),
  blog:          JSON.parse(readFileSync(join(pagesDir, 'blog.json'),        'utf8')),
  'how-to-use':  JSON.parse(readFileSync(join(pagesDir, 'how-to-use.json'), 'utf8')),
  track:         JSON.parse(readFileSync(join(pagesDir, 'track.json'),       'utf8')),
}

// ── Seed ──────────────────────────────────────────────────────────────────────

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
})

async function seed() {
  const client = await pool.connect()
  try {
    // Ensure table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS storefront_pages (
        id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        company_id  TEXT NOT NULL,
        slug        TEXT NOT NULL,
        config      JSONB NOT NULL DEFAULT '{}',
        published   BOOLEAN NOT NULL DEFAULT FALSE,
        UNIQUE (company_id, slug)
      )
    `)

    console.log(`\n🌱  Seeding storefront pages for company: ${COMPANY_ID}\n`)

    for (const [slug, config] of Object.entries(PAGES)) {
      await client.query(
        `INSERT INTO storefront_pages (company_id, slug, config, published)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (company_id, slug)
         DO UPDATE SET config = EXCLUDED.config, published = true, updated_at = NOW()`,
        [COMPANY_ID, slug, JSON.stringify(config)]
      )
      console.log(`  ✅  ${slug}`)
    }

    console.log(`\n✔  All ${Object.keys(PAGES).length} pages seeded and published.\n`)
  } finally {
    client.release()
    await pool.end()
  }
}

seed().catch(err => {
  console.error('❌  Seed failed:', err.message)
  process.exit(1)
})
