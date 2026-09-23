import { pool } from '~/server/db'

export async function ensureEcommProductReviewsTable() {
  await pool.query(`CREATE TABLE IF NOT EXISTS ecomm_product_reviews (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    order_id TEXT NOT NULL REFERENCES ecomm_orders(id) ON DELETE CASCADE,
    order_item_id TEXT NOT NULL, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id TEXT NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5), review_text TEXT NOT NULL,
    photos JSONB NOT NULL DEFAULT '[]'::jsonb, status TEXT NOT NULL DEFAULT 'APPROVED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, order_id, order_item_id)
  )`)
}
