-- Migration 019: Endurecimento de RLS para arquivos e criação de perfis
-- Our Little Kitchen - Neon Postgres

-- Arquivos só são visíveis para quem compartilha um espaço com quem os enviou.
DROP POLICY IF EXISTS storage_files_select ON storage_files;
CREATE POLICY storage_files_select ON storage_files
  FOR SELECT TO PUBLIC
  USING (
    uploaded_by IS NULL
    OR uploaded_by IN (
      SELECT profile_id
        FROM memberships
       WHERE kitchen_space_id = ANY(current_kitchen_space_ids())
    )
  );

-- Novos perfis só podem ser criados por administradores de algum espaço.
-- O cadastro público fica desabilitado; o login usa perfis já existentes.
DROP POLICY IF EXISTS profiles_insert ON profiles;
CREATE POLICY profiles_insert ON profiles
  FOR INSERT TO PUBLIC
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM memberships
       WHERE profile_id = current_profile_id()
         AND role_in_space = 'admin'
    )
  );

COMMENT ON POLICY storage_files_select ON storage_files IS 'Metadados de arquivos restritos a membros do espaço de quem enviou.';
COMMENT ON POLICY profiles_insert ON profiles IS 'Somente administradores criam novos perfis.';
