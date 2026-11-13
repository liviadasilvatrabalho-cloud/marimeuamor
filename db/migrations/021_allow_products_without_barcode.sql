-- Migration 021: Permitir cadastro de produtos por foto sem código de barras obrigatório
-- Our Little Kitchen - Neon Postgres

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN
    ALTER TABLE products ALTER COLUMN barcode DROP NOT NULL;
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_barcode_key;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_unique ON products(barcode) WHERE barcode IS NOT NULL AND barcode <> '';
  END IF;
END $$;
