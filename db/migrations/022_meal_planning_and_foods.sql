-- Migration 022: Planejamento de refeições e suporte a todos os tipos de refeição
-- Our Little Kitchen - Neon Postgres

-- 1. Remove restrição antiga de meal_type para permitir 'lanche_manha', 'lanche_tarde' e outros tipos de refeição
ALTER TABLE meals DROP CONSTRAINT IF EXISTS meals_meal_type_check;

-- 2. Adiciona coluna is_planned para diferenciar refeições planejadas de consumo real
ALTER TABLE meals ADD COLUMN IF NOT EXISTS is_planned BOOLEAN NOT NULL DEFAULT false;

-- 3. Adiciona timestamp de quando a refeição planejada foi marcada como consumida
ALTER TABLE meals ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ;

-- 4. Índices para busca rápida por data e status de planejamento
CREATE INDEX IF NOT EXISTS idx_meals_is_planned ON meals(is_planned);
CREATE INDEX IF NOT EXISTS idx_meals_date_planned ON meals(meal_date, is_planned);
