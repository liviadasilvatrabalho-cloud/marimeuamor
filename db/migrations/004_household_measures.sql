-- Migration 004: Medidas caseiras e conversões por alimento
-- Our Little Kitchen - Neon Postgres

CREATE TABLE IF NOT EXISTS household_measures (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  short_label       TEXT,
  typical_volume_ml NUMERIC(7,2),
  description       TEXT,
  visual_icon       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Conversão de uma medida caseira para gramas/mililitros, vinculada a um alimento específico
-- quando a conversão depende da densidade/ formato (ex: 1 xícara de arroz ≠ 1 xícara de batata).
CREATE TABLE IF NOT EXISTS food_household_conversions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  food_id              UUID NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  household_measure_id UUID NOT NULL REFERENCES household_measures(id) ON DELETE CASCADE,
  grams                NUMERIC(7,2) NOT NULL,
  milliliters          NUMERIC(7,2),
  estimation_method    TEXT,
  conversion_origin    TEXT,
  UNIQUE (food_id, household_measure_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_food_household_conversions_food ON food_household_conversions(food_id);
CREATE INDEX IF NOT EXISTS idx_food_household_conversions_measure ON food_household_conversions(household_measure_id);

COMMENT ON TABLE household_measures IS 'Catálogo de medidas caseiras (colher de sopa, xícara, copo, unidade, fatia, etc.).';
COMMENT ON TABLE food_household_conversions IS 'Conversão de medida caseira para gramas/ml, específica a cada alimento.';
