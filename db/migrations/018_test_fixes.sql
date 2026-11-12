-- Migration 018: Correções encontradas pelos testes de integração
-- Our Little Kitchen - Neon Postgres
--
-- 1. calc_recipe_ingredient acessava campos de um RECORD não atribuído
--    quando o ingrediente era um alimento (sem produto). Reescreve usando
--    variáveis escalares, sem tocar em records vazios.
-- 2. Triggers genéricos de updated_at em tabelas que não possuem a coluna
--    (ex.: shopping_list_items) quebravam UPDATEs. Remove dinamicamente.
-- 3. Funções de autorização usadas por políticas RLS precisam ser
--    SECURITY DEFINER para não recursarem na própria policy de memberships.

-- ---------------------------------------------------------------------------
-- 1. Cálculo de ingrediente de receita (alimento OU produto)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calc_recipe_ingredient(
  p_food_id      UUID,
  p_product_id   UUID,
  p_weight_grams NUMERIC
) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_ratio      NUMERIC := COALESCE(p_weight_grams, 0) / 100;
  v_food_cal   NUMERIC;
  v_food_pro   NUMERIC;
  v_food_car   NUMERIC;
  v_food_fat   NUMERIC;
  v_food_fib   NUMERIC;
  v_prod_cal   NUMERIC;
  v_prod_pro   NUMERIC;
  v_prod_car   NUMERIC;
  v_prod_fat   NUMERIC;
  v_prod_fib   NUMERIC;
BEGIN
  IF p_food_id IS NOT NULL THEN
    SELECT calories_per_100g, protein_per_100g, carbs_per_100g,
           fat_total_per_100g, fiber_per_100g
      INTO v_food_cal, v_food_pro, v_food_car, v_food_fat, v_food_fib
      FROM foods
     WHERE id = p_food_id AND deleted_at IS NULL;
  END IF;

  IF v_food_cal IS NULL AND p_product_id IS NOT NULL THEN
    SELECT calories_per_100, protein_per_100, carbs_per_100,
           fat_per_100, fiber_per_100
      INTO v_prod_cal, v_prod_pro, v_prod_car, v_prod_fat, v_prod_fib
      FROM products
     WHERE id = p_product_id AND deleted_at IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'weight_grams', p_weight_grams,
    'calories', COALESCE(v_food_cal, v_prod_cal) * v_ratio,
    'protein',  COALESCE(v_food_pro, v_prod_pro) * v_ratio,
    'carbs',    COALESCE(v_food_car, v_prod_car) * v_ratio,
    'fat',      COALESCE(v_food_fat, v_prod_fat) * v_ratio,
    'fiber',    COALESCE(v_food_fib, v_prod_fib) * v_ratio
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Remove triggers trg_*_updated_at de tabelas sem coluna updated_at
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name, t.tgname AS trigger_name
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND NOT t.tgisinternal
       AND t.tgname LIKE 'trg_%_updated_at'
       AND NOT EXISTS (
         SELECT 1
           FROM information_schema.columns col
          WHERE col.table_schema = 'public'
            AND col.table_name = c.relname
            AND col.column_name = 'updated_at'
       )
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', r.trigger_name, r.table_name);
    RAISE NOTICE 'Trigger inválido removido: % em %', r.trigger_name, r.table_name;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Funções de autorização para RLS (SECURITY DEFINER evita recursão)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_kitchen_space_ids()
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY(
    SELECT kitchen_space_id
      FROM memberships
     WHERE profile_id = current_profile_id()
  );
$$;

CREATE OR REPLACE FUNCTION is_space_admin(space_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM memberships
     WHERE profile_id = current_profile_id()
       AND kitchen_space_id = space_id
       AND role_in_space = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION profile_is_space_admin(p_profile_id UUID, p_space_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM memberships
     WHERE profile_id = p_profile_id
       AND kitchen_space_id = p_space_id
       AND role_in_space = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION profile_in_space(p_profile_id UUID, p_space_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM memberships
     WHERE profile_id = p_profile_id
       AND kitchen_space_id = p_space_id
  );
$$;

COMMENT ON FUNCTION calc_recipe_ingredient IS 'Calcula valores nutricionais de um ingrediente a partir do alimento ou produto, sem acessar records vazios.';
COMMENT ON FUNCTION current_kitchen_space_ids IS 'Espaços do perfil atual. SECURITY DEFINER para evitar recursão de RLS em memberships.';
