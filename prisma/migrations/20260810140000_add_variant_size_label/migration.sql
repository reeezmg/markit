-- Size labels: what `items.size` is CALLED for a variant ("Size" / "Shade" /
-- "Thickness" / ...). The value itself still lives in items.size — nothing is
-- renamed or moved. Purely additive, both columns have defaults so existing
-- rows read exactly as they did before.

-- Company-level list of allowed labels (mirrors variant_inputs.unit for qty).
-- One entry ⇒ the product form hides the picker and applies it silently.
ALTER TABLE "variant_inputs"
    ADD COLUMN IF NOT EXISTS "size_labels" TEXT[] NOT NULL DEFAULT ARRAY['Size']::TEXT[];

-- The label a given variant chose.
ALTER TABLE "variants"
    ADD COLUMN IF NOT EXISTS "size_label" TEXT DEFAULT 'Size';
