-- Migration 007: Refeições e itens da refeição
-- Our Little Kitchen - Neon Postgres

CREATE TABLE IF NOT EXISTS meals (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kitchen_space_id   UUID NOT NULL REFERENCES kitchen_spaces(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  meal_date          DATE NOT NULL,
  meal_type          TEXT NOT NULL
                    CHECK (meal_type IN ('cafe','almoco','lanche','jantar','ceia')),
  title              TEXT,
  photo_path         TEXT,            -- caminho no Storage (bucket de refeições)
  identification_method TEXT NOT NULL
                    CHECK (identification_method IN ('pesagem','manual','foto','rotulo')),
  confidence_level   INTEGER CHECK (confidence_level BETWEEN 0 AND 100),
  confidence_notes   TEXT,
  -- Totais calculados
  total_calories     NUMERIC(9,2),
  total_protein      NUMERIC(7,2),
  total_carbs        NUMERIC(7,2),
  total_fat          NUMERIC(7,2),
  total_fiber        NUMERIC(7,2),
  -- Soft delete
  deleted_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Itens da refeição com o peso usado no cálculo
CREATE TABLE IF NOT EXISTS meal_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id      UUID NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  food_id      UUID REFERENCES foods(id) ON DELETE SET NULL,
  product_id   UUID REFERENCES products(id) ON DELETE SET NULL,
  weight_grams NUMERIC(7,2) NOT NULL,
  calories     NUMERIC(9,2),
  protein      NUMERIC(7,2),
  carbs        NUMERIC(7,2),
  fat          NUMERIC(7,2),
  fiber        NUMERIC(7,2),
  source       TEXT,                    -- TACO / TBCA / USDA / Open Food Facts / Rótulo / Manual / IA
  verified     BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_meals_space ON meals(kitchen_space_id);
CREATE INDEX IF NOT EXISTS idx_meals_user ON meals(user_id);
CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(meal_date);
CREATE INDEX IF NOT EXISTS idx_meals_meal_type ON meals(meal_type);
CREATE INDEX IF NOT EXISTS idx_meals_deleted_at ON meals(deleted_at);
CREATE INDEX IF NOT EXISTS idx_meal_items_meal ON meal_items(meal_id);
CREATE INDEX IF NOT EXISTS idx_meal_items_food ON meal_items(food_id);
CREATE INDEX IF NOT EXISTS idx_meal_items_product ON meal_items(product_id);

COMMENT ON TABLE meals IS 'Refeições registradas com método de identificação e grau de confiança.';
COMMENT ON TABLE meal_items IS 'Itens de uma refeição associados a alimento ou produto com peso utilizado.';
