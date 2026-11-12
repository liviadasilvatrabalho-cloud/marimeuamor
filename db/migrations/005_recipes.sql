-- Migration 005: Receitas e ingredientes da receita
-- Our Little Kitchen - Neon Postgres

CREATE TABLE IF NOT EXISTS recipes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kitchen_space_id   UUID NOT NULL REFERENCES kitchen_spaces(id) ON DELETE CASCADE,
  author_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  title              TEXT NOT NULL,
  description        TEXT,
  photo_path         TEXT,          -- caminho no Storage (bucket de receitas)
  instructions       TEXT,
  servings           INTEGER NOT NULL DEFAULT 1,
  prep_time_minutes  INTEGER,
  status             TEXT NOT NULL DEFAULT 'sugerida'
                    CHECK (status IN ('sugerida','aprovada','publicada','arquivada')),
  -- Valores nutricionais por porção (recalculados quando ingredientes mudam)
  calories_per_serving NUMERIC(9,2),
  protein_per_serving  NUMERIC(7,2),
  carbs_per_serving    NUMERIC(7,2),
  fat_per_serving      NUMERIC(7,2),
  fiber_per_serving    NUMERIC(7,2),
  is_favorite          BOOLEAN DEFAULT false,
  carinho_tip          TEXT,
  -- Soft delete
  deleted_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ingredientes da receita com valores calculados
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id     UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  food_id       UUID REFERENCES foods(id) ON DELETE SET NULL,
  product_id    UUID REFERENCES products(id) ON DELETE SET NULL,
  quantity      NUMERIC(7,2) NOT NULL,
  unit          TEXT NOT NULL,
  weight_grams  NUMERIC(7,2) NOT NULL,
  calories      NUMERIC(9,2),
  protein       NUMERIC(7,2),
  carbs         NUMERIC(7,2),
  fat           NUMERIC(7,2),
  fiber         NUMERIC(7,2),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_recipes_space ON recipes(kitchen_space_id);
CREATE INDEX IF NOT EXISTS idx_recipes_author ON recipes(author_id);
CREATE INDEX IF NOT EXISTS idx_recipes_status ON recipes(status);
CREATE INDEX IF NOT EXISTS idx_recipes_deleted_at ON recipes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_food ON recipe_ingredients(food_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_product ON recipe_ingredients(product_id);

COMMENT ON TABLE recipes IS 'Receitas com status (sugerida/aprovada/publicada/arquivada) e valores nutricionais por porção.';
COMMENT ON TABLE recipe_ingredients IS 'Ingredientes de uma receita com peso em gramas e macros calculados.';
