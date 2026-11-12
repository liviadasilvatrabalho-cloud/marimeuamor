-- Migration 001: Espaços de cozinha compartilhados, perfis e associações
-- Our Little Kitchen - Neon Postgres
-- Aplica em: kitchen_spaces, profiles, memberships

-- Espaço compartilhado (household / kitchen_space).
-- Lívia e Mariana pertencem ao mesmo espaço.
CREATE TABLE IF NOT EXISTS kitchen_spaces (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL DEFAULT 'Nossa Cozinha',
  slug          TEXT UNIQUE NOT NULL DEFAULT 'nossa-cozinha',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Perfis de usuário. Vinculáveis futuramente a Supabase Auth / Neon Auth via auth_user_id.
CREATE TABLE IF NOT EXISTS profiles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id      UUID UNIQUE,            -- identidade do provedor de auth (deixado NULL até configurar auth)
  name              TEXT NOT NULL,
  email             TEXT UNIQUE NOT NULL,
  role              TEXT NOT NULL DEFAULT 'user'
                   CHECK (role IN ('admin', 'user')),
  calorie_goal      INTEGER,
  protein_goal_g    INTEGER,
  carbs_goal_g      INTEGER,
  fat_goal_g        INTEGER,
  water_goal_ml     INTEGER,
  current_weight_kg NUMERIC(5,2),
  target_weight_kg  NUMERIC(5,2),
  height_cm         INTEGER,
  diet_preference   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Associação perfil <-> espaço compartilhado.
-- Define quem pode acessar quais dados.
CREATE TABLE IF NOT EXISTS memberships (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kitchen_space_id UUID NOT NULL REFERENCES kitchen_spaces(id) ON DELETE CASCADE,
  profile_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_in_space    TEXT NOT NULL DEFAULT 'member'
                   CHECK (role_in_space IN ('admin', 'member')),
  joined_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kitchen_space_id, profile_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_memberships_space ON memberships(kitchen_space_id);
CREATE INDEX IF NOT EXISTS idx_memberships_profile ON memberships(profile_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_auth_user ON profiles(auth_user_id);

-- Comentários de documentação
COMMENT ON TABLE kitchen_spaces IS 'Espaço de cozinha compartilhado entre usuários (ex: Lívia e Mariana).';
COMMENT ON TABLE profiles IS 'Perfis de usuário com metadados nutricionais e papel (admin/user).';
COMMENT ON TABLE memberships IS 'Vincula perfis a espaços compartilhados, definindo papel dentro do espaço.';
