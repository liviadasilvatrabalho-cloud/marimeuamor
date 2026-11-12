-- Migration 008: Análises de imagem (scanner de fotografias e IA)
-- Our Little Kitchen - Neon Postgres

CREATE TABLE IF NOT EXISTS image_analyses (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kitchen_space_id   UUID NOT NULL REFERENCES kitchen_spaces(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  original_photo_path TEXT NOT NULL,       -- caminho no Storage (bucket de refeições/rótulos)
  analysis_date      TIMESTAMPTZ NOT NULL DEFAULT now(),
  identified_ingredients JSONB,            -- ingredientes identificados pela IA
  estimated_quantities   JSONB,            -- quantidades estimadas
  estimated_nutrition    JSONB,            -- valores nutricionais estimados
  confidence_level       INTEGER CHECK (confidence_level BETWEEN 0 AND 100),
  ai_model               TEXT,             -- modelo de IA utilizado
  status                 TEXT NOT NULL DEFAULT 'pendente'
                        CHECK (status IN ('pendente','corrigido','confirmado','rejeitado')),
  user_corrections       JSONB,            -- correções feitas pelo usuário
  final_result           JSONB,            -- resultado final confirmado
  meal_id                UUID REFERENCES meals(id) ON DELETE SET NULL,  -- refeição definitiva gerada
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_image_analyses_space ON image_analyses(kitchen_space_id);
CREATE INDEX IF NOT EXISTS idx_image_analyses_user ON image_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_image_analyses_analysis_date ON image_analyses(analysis_date DESC);
CREATE INDEX IF NOT EXISTS idx_image_analyses_status ON image_analyses(status);
CREATE INDEX IF NOT EXISTS idx_image_analyses_meal ON image_analyses(meal_id);

COMMENT ON TABLE image_analyses IS 'Resultado do reconhecimento de imagem: análise original e resultado corrigido separados.';
