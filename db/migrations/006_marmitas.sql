-- Migration 006: Marmitas e composição
-- Our Little Kitchen - Neon Postgres

CREATE TABLE IF NOT EXISTS marmitas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kitchen_space_id  UUID NOT NULL REFERENCES kitchen_spaces(id) ON DELETE CASCADE,
  prepared_by       UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  recipient_id      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  name              TEXT NOT NULL,
  description       TEXT,
  photo_path        TEXT,            -- caminho no Storage (bucket de marmitas)
  prep_date         DATE,
  expiry_date       DATE,
  status            TEXT NOT NULL DEFAULT 'preparada'
                   CHECK (status IN ('preparada','entregue','consumida','cancelada')),
  -- Valores nutricionais calculados no momento do preparo (preservam histórico)
  total_calories    NUMERIC(9,2),
  total_protein     NUMERIC(7,2),
  total_carbs       NUMERIC(7,2),
  total_fat         NUMERIC(7,2),
  total_fiber       NUMERIC(7,2),
  -- Soft delete
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Composição da marmita (valores armazenados no momento do preparo)
CREATE TABLE IF NOT EXISTS marmita_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marmita_id   UUID NOT NULL REFERENCES marmitas(id) ON DELETE CASCADE,
  food_id      UUID REFERENCES foods(id) ON DELETE SET NULL,
  weight_grams NUMERIC(7,2) NOT NULL,
  calories     NUMERIC(9,2),
  protein      NUMERIC(7,2),
  carbs        NUMERIC(7,2),
  fat          NUMERIC(7,2),
  fiber        NUMERIC(7,2),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_marmitas_space ON marmitas(kitchen_space_id);
CREATE INDEX IF NOT EXISTS idx_marmitas_prepared_by ON marmitas(prepared_by);
CREATE INDEX IF NOT EXISTS idx_marmitas_recipient ON marmitas(recipient_id);
CREATE INDEX IF NOT EXISTS idx_marmitas_status ON marmitas(status);
CREATE INDEX IF NOT EXISTS idx_marmitas_prep_date ON marmitas(prep_date);
CREATE INDEX IF NOT EXISTS idx_marmitas_deleted_at ON marmitas(deleted_at);
CREATE INDEX IF NOT EXISTS idx_marmita_items_marmita ON marmita_items(marmita_id);
CREATE INDEX IF NOT EXISTS idx_marmita_items_food ON marmita_items(food_id);

COMMENT ON TABLE marmitas IS 'Marmitas com data de preparo, validade, responsável e valores nutricionais do momento.';
COMMENT ON TABLE marmita_items IS 'Composição de uma marmita com valores nutricionais congelados no preparo.';
