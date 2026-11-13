-- Migration 020: Enriquecimento nutricional completo, conformidade ANVISA e proveniência para produtos
-- Our Little Kitchen - Neon Postgres

-- 1. Novos campos de macronutrientes e rotulagem detalhada
ALTER TABLE products ADD COLUMN IF NOT EXISTS sugars_per_100 NUMERIC(7,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS added_sugars_per_100 NUMERIC(7,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS saturated_fat_per_100 NUMERIC(7,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS trans_fat_per_100 NUMERIC(7,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS ingredients TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(5,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS provenance JSONB;
ALTER TABLE products ADD COLUMN IF NOT EXISTS nutrition_source TEXT;

-- 2. Relaxar check constraints legadas para permitir novas fontes e status
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_data_source_check;
ALTER TABLE products ADD CONSTRAINT products_data_source_check
  CHECK (data_source IN ('Open Food Facts', 'FatSecret', 'Manual', 'Rótulo', 'IA Gemini', 'TACO/TBCA', 'Banco Local'));

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_verification_status_check;
ALTER TABLE products ADD CONSTRAINT products_verification_status_check
  CHECK (verification_status IN ('pending', 'verified', 'rejected', 'user_confirmed'));

-- 3. Índice para busca textual por nome comercial e marca
CREATE INDEX IF NOT EXISTS idx_products_name_brand
  ON products (lower(commercial_name), lower(COALESCE(brand, '')));
