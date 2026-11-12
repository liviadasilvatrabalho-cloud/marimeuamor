-- Migration 002: Banco de alimentos (prioridade máxima)
-- Our Little Kitchen - Neon Postgres

CREATE TABLE IF NOT EXISTS foods (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kitchen_space_id       UUID NOT NULL REFERENCES kitchen_spaces(id) ON DELETE CASCADE,
  created_by             UUID REFERENCES profiles(id) ON DELETE SET NULL,
  name                   TEXT NOT NULL,
  alternative_name       TEXT,
  brand                  TEXT,
  category               TEXT NOT NULL,
  description            TEXT,
  prep_state             TEXT NOT NULL DEFAULT 'cru'
                        CHECK (prep_state IN ('cru','cozido','assado','grelhado','frito','refogado','no_vapor')),
  reference_unit         TEXT NOT NULL DEFAULT '100g',
  -- Valores nutricionais por 100g (aceitam NULL quando a fonte não informar; nunca preencher com zero automático)
  calories_per_100g      NUMERIC(7,2),
  protein_per_100g       NUMERIC(7,2),
  carbs_per_100g         NUMERIC(7,2),
  fat_total_per_100g     NUMERIC(7,2),
  fat_saturated_per_100g NUMERIC(7,2),
  fiber_per_100g         NUMERIC(7,2),
  sugars_per_100g        NUMERIC(7,2),
  sodium_per_100g        NUMERIC(7,2),
  -- Procedência
  nutrition_source       TEXT NOT NULL DEFAULT 'Manual'
                        CHECK (nutrition_source IN ('TACO','TBCA','USDA','Open Food Facts','Manual','Rótulo')),
  data_origin            TEXT NOT NULL,                       -- identificação da origem dos dados
  verification_status    TEXT NOT NULL DEFAULT 'pending'
                        CHECK (verification_status IN ('pending','verified','rejected')),
  verified_by            UUID REFERENCES profiles(id) ON DELETE SET NULL,
  verified_at            TIMESTAMPTZ,
  -- Soft delete
  deleted_at             TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_foods_space ON foods(kitchen_space_id);
-- Unicidade de nome dentro de um espaço, ignorando caixa (expressão -> índice único, não constraint de tabela)
CREATE UNIQUE INDEX IF NOT EXISTS idx_foods_unique_name_space
  ON foods (kitchen_space_id, LOWER(name)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_foods_created_by ON foods(created_by);
CREATE INDEX IF NOT EXISTS idx_foods_category ON foods(category);
CREATE INDEX IF NOT EXISTS idx_foods_name ON foods(name);
CREATE INDEX IF NOT EXISTS idx_foods_deleted_at ON foods(deleted_at);

-- Histórico de correções nutricionais de alimentos (não sobrescreve silenciosamente)
CREATE TABLE IF NOT EXISTS food_nutrition_history (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  food_id          UUID NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  changed_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  previous_values  JSONB NOT NULL,
  new_values       JSONB NOT NULL,
  change_reason    TEXT,
  data_source      TEXT,
  changed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_food_nutrition_history_food ON food_nutrition_history(food_id);
CREATE INDEX IF NOT EXISTS idx_food_nutrition_history_changed_at ON food_nutrition_history(changed_at DESC);

COMMENT ON TABLE foods IS 'Tabela principal de alimentos com valores nutricionais por 100g e procedência.';
COMMENT ON TABLE food_nutrition_history IS 'Audit trail de alterações nutricionais de alimentos (antes/depois).';
