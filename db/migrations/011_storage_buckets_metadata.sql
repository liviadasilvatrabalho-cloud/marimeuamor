-- Migration 011: Metadados de buckets de armazenamento (Supabase Storage / Neon Object Storage)
-- Our Little Kitchen - Neon Postgres
-- Os buckets físicos são criados no provider de storage; esta tabela registra metadados e caminhos.

CREATE TABLE IF NOT EXISTS storage_buckets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT UNIQUE NOT NULL,
  description TEXT,
  access      TEXT NOT NULL DEFAULT 'private' CHECK (access IN ('private','public_read')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Registra os buckets padrão da aplicação
INSERT INTO storage_buckets (name, description, access) VALUES
  ('food-photos', 'Fotografias de alimentos', 'private'),
  ('product-photos', 'Fotografias de produtos', 'private'),
  ('label-photos', 'Fotografias de rótulos', 'private'),
  ('recipe-photos', 'Fotografias de receitas', 'private'),
  ('marmita-photos', 'Fotografias de marmitas', 'private'),
  ('meal-photos', 'Fotografias das refeições', 'private')
ON CONFLICT (name) DO NOTHING;

-- Tabela de arquivos armazenados (apenas caminhos e metadados, nunca o binário)
CREATE TABLE IF NOT EXISTS storage_files (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket       TEXT NOT NULL,
  file_path    TEXT NOT NULL,
  file_name    TEXT NOT NULL,
  mime_type    TEXT,
  size_bytes   BIGINT,
  uploaded_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  signed_url   TEXT,          -- URL assinada temporária (cache)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_storage_files_bucket_path ON storage_files(bucket, file_path);
CREATE INDEX IF NOT EXISTS idx_storage_files_uploaded_by ON storage_files(uploaded_by);

COMMENT ON TABLE storage_buckets IS 'Buckets de armazenamento de fotografias (privados, URLs assinadas quando necessário).';
COMMENT ON TABLE storage_files IS 'Metadados de arquivos armazenados (caminhos, nunca binário no Postgres).';
