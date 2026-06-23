-- Migration: Add tax/shortcut/margin fields to subcategories table
ALTER TABLE subcategories
  ADD COLUMN IF NOT EXISTS short_cut          TEXT,
  ADD COLUMN IF NOT EXISTS hsn                TEXT,
  ADD COLUMN IF NOT EXISTS tax_type           TEXT NOT NULL DEFAULT 'FIXED',
  ADD COLUMN IF NOT EXISTS fixed_tax          DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS threshold_amount   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS tax_below_threshold DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS tax_above_threshold DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS margin             DOUBLE PRECISION;
