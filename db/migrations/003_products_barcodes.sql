-- Migration 003: Produtos industrializados e códigos de barras
-- Our Little Kitchen - Neon Postgres

CREATE TABLE IF NOT EXISTS products (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kitchen_space_id      UUID NOT NULL REFERENCES kitchen_spaces(id) ON DELETE CASCADE,
  created_by            UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- Código de barras com escopo global (EAN-8, UPC-A, EAN-13). Unicidade global do produto.
  barcode               TEXT NOT NULL UNIQUE,
  commercial_name       TEXT NOT NULL,
  brand                 TEXT,
  manufacturer          TEXT,
  category              TEXT,
  description           TEXT,
  image_path            TEXT,   -- caminho no Storage (bucket de produtos), não o arquivo binário
  package_size          TEXT,
  serving_quantity      NUMERIC(7,2),
  serving_unit          TEXT,
  calories_per_serving  NUMERIC(7,2),
  calories_per_100      NUMERIC(7,2),
  protein_per_100       NUMERIC(7,2),
  carbs_per_100         NUMERIC(7,2),
  fat_per_100           NUMERIC(7,2),
  fiber_per_100         NUMERIC(7,2),
  sodium_per_100        NUMERIC(7,2),
  data_source           TEXT NOT NULL DEFAULT 'Manual'
                       CHECK (data_source IN ('Open Food Facts','Manual','Rótulo')),
  last_updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  verification_status   TEXT NOT NULL DEFAULT 'pending'
                       CHECK (verification_status IN ('pending','verified','rejected')),
  -- Soft delete
  deleted_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_products_space ON products(kitchen_space_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_created_by ON products(created_by);
CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON products(deleted_at);

-- Histórico de alterações nutricionais de produtos
CREATE TABLE IF NOT EXISTS product_nutrition_history (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  changed_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  previous_values  JSONB NOT NULL,
  new_values       JSONB NOT NULL,
  change_reason    TEXT,
  data_source      TEXT,
  changed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_nutrition_history_product ON product_nutrition_history(product_id);
CREATE INDEX IF NOT EXISTS idx_product_nutrition_history_changed_at ON product_nutrition_history(changed_at DESC);

COMMENT ON TABLE products IS 'Produtos industrializados com código de barras e valores nutricionais.';
COMMENT ON TABLE product_nutrition_history IS 'Audit trail de alterações nutricionais de produtos.';
