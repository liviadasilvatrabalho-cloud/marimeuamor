-- Migration 016: Integração, autenticação, sincronização e correções
-- Our Little Kitchen - Neon Postgres
-- Corrige colunas/triggers ausentes, adiciona identidade estável para os
-- registros vindos do frontend legado, sessões de perfil e eventos de sync.

-- ---------------------------------------------------------------------------
-- 1. Colunas de auditoria que o código da API já utiliza
-- ---------------------------------------------------------------------------
ALTER TABLE foods    ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE orders   ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE recipes  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE marmitas ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE meals    ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 2. Identificador externo estável (id do frontend legado / importações)
--    Permite sincronizar o documento AppState com as tabelas normalizadas
--    sem duplicar registros a cada salvamento.
-- ---------------------------------------------------------------------------
ALTER TABLE foods           ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE products        ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE recipes         ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE marmitas        ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE meals           ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE orders          ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE shopping_lists  ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE image_analyses  ADD COLUMN IF NOT EXISTS external_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_foods_external
  ON foods (kitchen_space_id, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_external
  ON products (kitchen_space_id, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_recipes_external
  ON recipes (kitchen_space_id, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_marmitas_external
  ON marmitas (kitchen_space_id, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_meals_external
  ON meals (kitchen_space_id, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_external
  ON orders (kitchen_space_id, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_shopping_lists_external
  ON shopping_lists (kitchen_space_id, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_image_analyses_external
  ON image_analyses (kitchen_space_id, external_id) WHERE external_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Prevenção de duplicidade de alimentos manuais
--    Mesmo nome + estado de preparo + marca dentro do espaço compartilhado.
--    A comparação é case-insensitive e ignora espaços em branco.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_foods_dedupe
  ON foods (
    kitchen_space_id,
    lower(btrim(name)),
    prep_state,
    lower(btrim(COALESCE(brand, '')))
  )
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Triggers inválidos criados na migration 013
--    Algumas tabelas não possuem updated_at; o trigger falharia em runtime.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_memberships_updated_at ON memberships;
DROP TRIGGER IF EXISTS trg_marmita_items_updated_at ON marmita_items;
DROP TRIGGER IF EXISTS trg_meal_items_updated_at ON meal_items;
DROP TRIGGER IF EXISTS trg_order_status_history_updated_at ON order_status_history;
DROP TRIGGER IF EXISTS trg_food_nutrition_history_updated_at ON food_nutrition_history;
DROP TRIGGER IF EXISTS trg_product_nutrition_history_updated_at ON product_nutrition_history;
DROP TRIGGER IF EXISTS trg_storage_files_updated_at ON storage_files;

-- ---------------------------------------------------------------------------
-- 5. Função de cálculo com assinatura curta (2 argumentos)
--    Mantém compatibilidade com /api/calc/food-portion.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calc_food_portion(
  p_grams NUMERIC,
  p_calories_100g NUMERIC
) RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'portion_grams', p_grams,
    'calories', CASE WHEN p_calories_100g IS NULL THEN NULL
                     ELSE p_calories_100g * (COALESCE(p_grams, 0) / 100) END,
    'ratio', COALESCE(p_grams, 0) / 100
  );
$$;

-- ---------------------------------------------------------------------------
-- 6. Recálculo automático de totais (receitas, marmitas e refeições)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalc_recipe_totals(p_recipe_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE recipes r SET
    calories_per_serving = t.cal,
    protein_per_serving  = t.pro,
    carbs_per_serving    = t.car,
    fat_per_serving      = t.fat,
    fiber_per_serving    = t.fib
  FROM (
    SELECT
      sum(calories) AS cal, sum(protein) AS pro, sum(carbs) AS car,
      sum(fat) AS fat, sum(fiber) AS fib
    FROM recipe_ingredients WHERE recipe_id = p_recipe_id
  ) t
  WHERE r.id = p_recipe_id;
END;
$$;

CREATE OR REPLACE FUNCTION recalc_marmita_totals(p_marmita_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE marmitas m SET
    total_calories = t.cal, total_protein = t.pro, total_carbs = t.car,
    total_fat = t.fat, total_fiber = t.fib
  FROM (
    SELECT
      sum(calories) AS cal, sum(protein) AS pro, sum(carbs) AS car,
      sum(fat) AS fat, sum(fiber) AS fib
    FROM marmita_items WHERE marmita_id = p_marmita_id
  ) t
  WHERE m.id = p_marmita_id;
END;
$$;

CREATE OR REPLACE FUNCTION recalc_meal_totals(p_meal_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE meals m SET
    total_calories = t.cal, total_protein = t.pro, total_carbs = t.car,
    total_fat = t.fat, total_fiber = t.fib
  FROM (
    SELECT
      sum(calories) AS cal, sum(protein) AS pro, sum(carbs) AS car,
      sum(fat) AS fat, sum(fiber) AS fib
    FROM meal_items WHERE meal_id = p_meal_id
  ) t
  WHERE m.id = p_meal_id;
END;
$$;

CREATE OR REPLACE FUNCTION trg_recalc_recipe_totals() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM recalc_recipe_totals(COALESCE(NEW.recipe_id, OLD.recipe_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION trg_recalc_marmita_totals() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM recalc_marmita_totals(COALESCE(NEW.marmita_id, OLD.marmita_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION trg_recalc_meal_totals() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM recalc_meal_totals(COALESCE(NEW.meal_id, OLD.meal_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recipe_ingredients_totals ON recipe_ingredients;
CREATE TRIGGER trg_recipe_ingredients_totals
  AFTER INSERT OR UPDATE OR DELETE ON recipe_ingredients
  FOR EACH ROW EXECUTE FUNCTION trg_recalc_recipe_totals();

DROP TRIGGER IF EXISTS trg_marmita_items_totals ON marmita_items;
CREATE TRIGGER trg_marmita_items_totals
  AFTER INSERT OR UPDATE OR DELETE ON marmita_items
  FOR EACH ROW EXECUTE FUNCTION trg_recalc_marmita_totals();

DROP TRIGGER IF EXISTS trg_meal_items_totals ON meal_items;
CREATE TRIGGER trg_meal_items_totals
  AFTER INSERT OR UPDATE OR DELETE ON meal_items
  FOR EACH ROW EXECUTE FUNCTION trg_recalc_meal_totals();

-- ---------------------------------------------------------------------------
-- 7. Histórico automático de status dos pedidos
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_order_status_history() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO order_status_history (order_id, previous_status, new_status, changed_by)
    VALUES (NEW.id, NULL, NEW.status, NEW.requester_id);
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO order_status_history (order_id, previous_status, new_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, COALESCE(NEW.updated_by, NEW.requester_id));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_status_history ON orders;
CREATE TRIGGER trg_orders_status_history
  AFTER INSERT OR UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION trg_order_status_history();

-- ---------------------------------------------------------------------------
-- 8. Sessões de perfil (login por PIN, hash scrypt no backend)
--    A coluna auth_user_id continua disponível para o Neon Auth.
-- ---------------------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pin_hash TEXT;

CREATE TABLE IF NOT EXISTS profile_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  user_agent  TEXT,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_profile_sessions_profile ON profile_sessions(profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_sessions_expires ON profile_sessions(expires_at);

-- ---------------------------------------------------------------------------
-- 9. Eventos de sincronização (polling/SSE entre Lívia e Mariana)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_events (
  id             BIGSERIAL PRIMARY KEY,
  kitchen_space_id UUID NOT NULL REFERENCES kitchen_spaces(id) ON DELETE CASCADE,
  entity         TEXT NOT NULL,
  entity_id      UUID,
  action         TEXT NOT NULL CHECK (action IN ('insert','update','delete','sync')),
  payload        JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sync_events_space_id ON sync_events(kitchen_space_id, id DESC);

CREATE OR REPLACE FUNCTION emit_sync_event(
  p_space_id UUID, p_entity TEXT, p_entity_id UUID, p_action TEXT, p_payload JSONB DEFAULT NULL
) RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO sync_events (kitchen_space_id, entity, entity_id, action, payload)
  VALUES (p_space_id, p_entity, p_entity_id, p_action, p_payload);
$$;

-- ---------------------------------------------------------------------------
-- 10. RLS das novas tabelas e políticas complementares
-- ---------------------------------------------------------------------------
ALTER TABLE profile_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profile_sessions_select ON profile_sessions;
CREATE POLICY profile_sessions_select ON profile_sessions
  FOR SELECT TO PUBLIC USING (profile_id = current_profile_id());

DROP POLICY IF EXISTS sync_events_select ON sync_events;
CREATE POLICY sync_events_select ON sync_events
  FOR SELECT TO PUBLIC
  USING (kitchen_space_id = ANY(current_kitchen_space_ids()));

-- Perfis: cada usuário atualiza o próprio perfil; admin atualiza o espaço.
DROP POLICY IF EXISTS profiles_update ON profiles;
CREATE POLICY profiles_update ON profiles
  FOR UPDATE TO PUBLIC
  USING (
    id = current_profile_id()
    OR EXISTS (
      SELECT 1
      FROM memberships target
      JOIN memberships admin_m ON admin_m.kitchen_space_id = target.kitchen_space_id
      WHERE target.profile_id = profiles.id
        AND admin_m.profile_id = current_profile_id()
        AND admin_m.role_in_space = 'admin'
    )
  )
  WITH CHECK (
    id = current_profile_id()
    OR EXISTS (
      SELECT 1
      FROM memberships target
      JOIN memberships admin_m ON admin_m.kitchen_space_id = target.kitchen_space_id
      WHERE target.profile_id = profiles.id
        AND admin_m.profile_id = current_profile_id()
        AND admin_m.role_in_space = 'admin'
    )
  );

-- Medidas caseiras vinculadas a alimentos (faltavam políticas na 014)
ALTER TABLE food_household_conversions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS food_household_conversions_select ON food_household_conversions;
CREATE POLICY food_household_conversions_select ON food_household_conversions
  FOR SELECT TO PUBLIC
  USING (food_id IN (SELECT id FROM foods WHERE kitchen_space_id = ANY(current_kitchen_space_ids())));

DROP POLICY IF EXISTS food_household_conversions_insert ON food_household_conversions;
CREATE POLICY food_household_conversions_insert ON food_household_conversions
  FOR INSERT TO PUBLIC
  WITH CHECK (food_id IN (SELECT id FROM foods WHERE kitchen_space_id = ANY(current_kitchen_space_ids())));

DROP POLICY IF EXISTS food_household_conversions_update ON food_household_conversions;
CREATE POLICY food_household_conversions_update ON food_household_conversions
  FOR UPDATE TO PUBLIC
  USING (food_id IN (SELECT id FROM foods WHERE kitchen_space_id = ANY(current_kitchen_space_ids())))
  WITH CHECK (food_id IN (SELECT id FROM foods WHERE kitchen_space_id = ANY(current_kitchen_space_ids())));

DROP POLICY IF EXISTS food_household_conversions_delete ON food_household_conversions;
CREATE POLICY food_household_conversions_delete ON food_household_conversions
  FOR DELETE TO PUBLIC
  USING (food_id IN (SELECT id FROM foods WHERE kitchen_space_id = ANY(current_kitchen_space_ids())));

-- Itens filhos: permitir remoção segura por membros do espaço
DROP POLICY IF EXISTS recipe_ingredients_delete ON recipe_ingredients;
CREATE POLICY recipe_ingredients_delete ON recipe_ingredients
  FOR DELETE TO PUBLIC
  USING (recipe_id IN (SELECT id FROM recipes WHERE kitchen_space_id = ANY(current_kitchen_space_ids())));

DROP POLICY IF EXISTS marmita_items_delete ON marmita_items;
CREATE POLICY marmita_items_delete ON marmita_items
  FOR DELETE TO PUBLIC
  USING (marmita_id IN (SELECT id FROM marmitas WHERE kitchen_space_id = ANY(current_kitchen_space_ids())));

DROP POLICY IF EXISTS meal_items_delete ON meal_items;
CREATE POLICY meal_items_delete ON meal_items
  FOR DELETE TO PUBLIC
  USING (meal_id IN (SELECT id FROM meals WHERE kitchen_space_id = ANY(current_kitchen_space_ids())));

DROP POLICY IF EXISTS shopping_list_items_delete ON shopping_list_items;
CREATE POLICY shopping_list_items_delete ON shopping_list_items
  FOR DELETE TO PUBLIC
  USING (shopping_list_id IN (SELECT id FROM shopping_lists WHERE kitchen_space_id = ANY(current_kitchen_space_ids())));

DROP POLICY IF EXISTS order_status_history_insert ON order_status_history;
CREATE POLICY order_status_history_insert ON order_status_history
  FOR INSERT TO PUBLIC
  WITH CHECK (order_id IN (SELECT id FROM orders WHERE kitchen_space_id = ANY(current_kitchen_space_ids())));

-- Armazenamento: membros autenticados podem registrar metadados de arquivos
DROP POLICY IF EXISTS storage_files_insert ON storage_files;
CREATE POLICY storage_files_insert ON storage_files
  FOR INSERT TO PUBLIC
  WITH CHECK (uploaded_by = current_profile_id());

-- ---------------------------------------------------------------------------
-- 11. Funções auxiliares de autorização usadas pela API
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION profile_is_space_admin(p_profile_id UUID, p_space_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships
    WHERE profile_id = p_profile_id
      AND kitchen_space_id = p_space_id
      AND role_in_space = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION profile_in_space(p_profile_id UUID, p_space_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships
    WHERE profile_id = p_profile_id
      AND kitchen_space_id = p_space_id
  );
$$;

COMMENT ON TABLE profile_sessions IS 'Sessões opacas de perfil. Apenas o hash SHA-256 do token é armazenado.';
COMMENT ON TABLE sync_events IS 'Fila de eventos para sincronização incremental entre os membros do espaço.';
COMMENT ON COLUMN foods.external_id IS 'ID estável do registro no documento AppState do frontend legado.';
