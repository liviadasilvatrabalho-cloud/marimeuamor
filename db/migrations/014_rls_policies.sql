-- Migration 014: Row Level Security (RLS) e políticas de acesso
-- Our Little Kitchen - Neon Postgres
-- Regras: apenas membros do espaço compartilhado acessam os dados desse espaço.
-- Admin (Lívia) gerencia tudo; usuário (Mariana) consulta e cria conforme permissões.
-- Nunca confiar apenas no frontend; RLS é aplicado no banco.

-- Habilita RLS em todas as tabelas expostas
ALTER TABLE kitchen_spaces    ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships       ENABLE ROW LEVEL SECURITY;
ALTER TABLE foods             ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_nutrition_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE products          ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_nutrition_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_measures ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_household_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE marmitas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE marmita_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE meals             ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_analyses    ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders            ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_lists    ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_buckets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_files     ENABLE ROW LEVEL SECURITY;

-- Helper: retorna o kitchen_space_id do perfil autenticado (via variável de sessão app.current_profile_id)
CREATE OR REPLACE FUNCTION current_profile_id() RETURNS UUID AS $$
  SELECT current_setting('app.current_profile_id', true)::UUID;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION current_profile_role() RETURNS TEXT AS $$
  SELECT current_setting('app.current_profile_role', true);
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION current_kitchen_space_ids() RETURNS UUID[] AS $$
  SELECT ARRAY(SELECT kitchen_space_id FROM memberships WHERE profile_id = current_profile_id());
$$ LANGUAGE sql STABLE;

-- Função: é administrador do espaço?
CREATE OR REPLACE FUNCTION is_space_admin(space_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships
    WHERE profile_id = current_profile_id()
      AND kitchen_space_id = space_id
      AND role_in_space = 'admin'
  );
$$ LANGUAGE sql STABLE;

-- ---------- Políticas SELECT ----------
-- kitchen_spaces: membros do espaço veem o espaço
CREATE POLICY kitchen_spaces_select ON kitchen_spaces
FOR SELECT TO PUBLIC
USING (id = ANY(current_kitchen_space_ids()));

-- profiles: membros veem perfis do próprio espaço
CREATE POLICY profiles_select ON profiles
FOR SELECT TO PUBLIC
USING (id IN (
  SELECT profile_id FROM memberships WHERE kitchen_space_id = ANY(current_kitchen_space_ids())
));

-- memberships: membros veem associações do próprio espaço
CREATE POLICY memberships_select ON memberships
FOR SELECT TO PUBLIC
USING (kitchen_space_id = ANY(current_kitchen_space_ids()));

-- Tabelas de dados: SELECT apenas se kitchen_space_id estiver nos espaços do perfil
CREATE POLICY foods_select ON foods
FOR SELECT TO PUBLIC
USING (kitchen_space_id = ANY(current_kitchen_space_ids()) AND deleted_at IS NULL);

CREATE POLICY products_select ON products
FOR SELECT TO PUBLIC
USING (kitchen_space_id = ANY(current_kitchen_space_ids()) AND deleted_at IS NULL);

CREATE POLICY recipes_select ON recipes
FOR SELECT TO PUBLIC
USING (kitchen_space_id = ANY(current_kitchen_space_ids()) AND deleted_at IS NULL);

CREATE POLICY marmitas_select ON marmitas
FOR SELECT TO PUBLIC
USING (kitchen_space_id = ANY(current_kitchen_space_ids()) AND deleted_at IS NULL);

CREATE POLICY meals_select ON meals
FOR SELECT TO PUBLIC
USING (kitchen_space_id = ANY(current_kitchen_space_ids()) AND deleted_at IS NULL);

CREATE POLICY orders_select ON orders
FOR SELECT TO PUBLIC
USING (kitchen_space_id = ANY(current_kitchen_space_ids()));

CREATE POLICY shopping_lists_select ON shopping_lists
FOR SELECT TO PUBLIC
USING (kitchen_space_id = ANY(current_kitchen_space_ids()));

CREATE POLICY image_analyses_select ON image_analyses
FOR SELECT TO PUBLIC
USING (kitchen_space_id = ANY(current_kitchen_space_ids()));

-- Tabelas filhas (sem kitchen_space_id direto): herdam do pai
CREATE POLICY recipe_ingredients_select ON recipe_ingredients
FOR SELECT TO PUBLIC
USING (recipe_id IN (SELECT id FROM recipes WHERE kitchen_space_id = ANY(current_kitchen_space_ids())));

CREATE POLICY marmita_items_select ON marmita_items
FOR SELECT TO PUBLIC
USING (marmita_id IN (SELECT id FROM marmitas WHERE kitchen_space_id = ANY(current_kitchen_space_ids())));

CREATE POLICY meal_items_select ON meal_items
FOR SELECT TO PUBLIC
USING (meal_id IN (SELECT id FROM meals WHERE kitchen_space_id = ANY(current_kitchen_space_ids())));

CREATE POLICY shopping_list_items_select ON shopping_list_items
FOR SELECT TO PUBLIC
USING (shopping_list_id IN (SELECT id FROM shopping_lists WHERE kitchen_space_id = ANY(current_kitchen_space_ids())));

CREATE POLICY order_status_history_select ON order_status_history
FOR SELECT TO PUBLIC
USING (order_id IN (SELECT id FROM orders WHERE kitchen_space_id = ANY(current_kitchen_space_ids())));

CREATE POLICY food_nutrition_history_select ON food_nutrition_history
FOR SELECT TO PUBLIC
USING (food_id IN (SELECT id FROM foods WHERE kitchen_space_id = ANY(current_kitchen_space_ids())));

CREATE POLICY product_nutrition_history_select ON product_nutrition_history
FOR SELECT TO PUBLIC
USING (product_id IN (SELECT id FROM products WHERE kitchen_space_id = ANY(current_kitchen_space_ids())));

-- storage: membros veem buckets e arquivos
CREATE POLICY storage_buckets_select ON storage_buckets FOR SELECT TO PUBLIC USING (true);
CREATE POLICY storage_files_select ON storage_files FOR SELECT TO PUBLIC USING (true);

-- ---------- Políticas INSERT ----------
CREATE POLICY profiles_insert ON profiles FOR INSERT TO PUBLIC WITH CHECK (true);
CREATE POLICY memberships_insert ON memberships FOR INSERT TO PUBLIC
WITH CHECK (kitchen_space_id = ANY(current_kitchen_space_ids()) AND is_space_admin(kitchen_space_id));

CREATE POLICY foods_insert ON foods FOR INSERT TO PUBLIC
WITH CHECK (kitchen_space_id = ANY(current_kitchen_space_ids()));

CREATE POLICY products_insert ON products FOR INSERT TO PUBLIC
WITH CHECK (kitchen_space_id = ANY(current_kitchen_space_ids()));

CREATE POLICY recipes_insert ON recipes FOR INSERT TO PUBLIC
WITH CHECK (kitchen_space_id = ANY(current_kitchen_space_ids()));

-- Mariana (user) pode sugerir receitas; admin aprova. INSERT permitido para membros.
CREATE POLICY marmitas_insert ON marmitas FOR INSERT TO PUBLIC
WITH CHECK (kitchen_space_id = ANY(current_kitchen_space_ids()));

CREATE POLICY meals_insert ON meals FOR INSERT TO PUBLIC
WITH CHECK (kitchen_space_id = ANY(current_kitchen_space_ids()) AND user_id = current_profile_id());

CREATE POLICY orders_insert ON orders FOR INSERT TO PUBLIC
WITH CHECK (kitchen_space_id = ANY(current_kitchen_space_ids()) AND requester_id = current_profile_id());

CREATE POLICY shopping_lists_insert ON shopping_lists FOR INSERT TO PUBLIC
WITH CHECK (kitchen_space_id = ANY(current_kitchen_space_ids()));

CREATE POLICY image_analyses_insert ON image_analyses FOR INSERT TO PUBLIC
WITH CHECK (kitchen_space_id = ANY(current_kitchen_space_ids()) AND user_id = current_profile_id());

-- Tabelas filhas: INSERT permitido para membros do espaço
CREATE POLICY recipe_ingredients_insert ON recipe_ingredients FOR INSERT TO PUBLIC
WITH CHECK (recipe_id IN (SELECT id FROM recipes WHERE kitchen_space_id = ANY(current_kitchen_space_ids())));

CREATE POLICY marmita_items_insert ON marmita_items FOR INSERT TO PUBLIC
WITH CHECK (marmita_id IN (SELECT id FROM marmitas WHERE kitchen_space_id = ANY(current_kitchen_space_ids())));

CREATE POLICY meal_items_insert ON meal_items FOR INSERT TO PUBLIC
WITH CHECK (meal_id IN (SELECT id FROM meals WHERE kitchen_space_id = ANY(current_kitchen_space_ids())));

CREATE POLICY shopping_list_items_insert ON shopping_list_items FOR INSERT TO PUBLIC
WITH CHECK (shopping_list_id IN (SELECT id FROM shopping_lists WHERE kitchen_space_id = ANY(current_kitchen_space_ids())));

-- ---------- Políticas UPDATE ----------
-- Admin pode atualizar tudo do espaço; usuário apenas o que criou (exceto campos administrativos)
CREATE POLICY foods_update ON foods FOR UPDATE TO PUBLIC
USING (kitchen_space_id = ANY(current_kitchen_space_ids()))
WITH CHECK (
  kitchen_space_id = ANY(current_kitchen_space_ids()) AND
  (is_space_admin(kitchen_space_id) OR created_by = current_profile_id())
);

CREATE POLICY products_update ON products FOR UPDATE TO PUBLIC
USING (kitchen_space_id = ANY(current_kitchen_space_ids()))
WITH CHECK (
  kitchen_space_id = ANY(current_kitchen_space_ids()) AND
  (is_space_admin(kitchen_space_id) OR created_by = current_profile_id())
);

CREATE POLICY recipes_update ON recipes FOR UPDATE TO PUBLIC
USING (kitchen_space_id = ANY(current_kitchen_space_ids()))
WITH CHECK (
  kitchen_space_id = ANY(current_kitchen_space_ids()) AND
  (is_space_admin(kitchen_space_id) OR author_id = current_profile_id())
);

-- Mariana NÃO pode alterar/excluir marmitas publicadas por Lívia (admin)
CREATE POLICY marmitas_update ON marmitas FOR UPDATE TO PUBLIC
USING (kitchen_space_id = ANY(current_kitchen_space_ids()))
WITH CHECK (
  kitchen_space_id = ANY(current_kitchen_space_ids()) AND
  (is_space_admin(kitchen_space_id) OR
   (prepared_by = current_profile_id() AND status <> 'publicada'))
);

CREATE POLICY meals_update ON meals FOR UPDATE TO PUBLIC
USING (kitchen_space_id = ANY(current_kitchen_space_ids()) AND user_id = current_profile_id())
WITH CHECK (kitchen_space_id = ANY(current_kitchen_space_ids()) AND user_id = current_profile_id());

CREATE POLICY orders_update ON orders FOR UPDATE TO PUBLIC
USING (kitchen_space_id = ANY(current_kitchen_space_ids()))
WITH CHECK (
  kitchen_space_id = ANY(current_kitchen_space_ids()) AND
  (is_space_admin(kitchen_space_id) OR requester_id = current_profile_id())
);

CREATE POLICY shopping_lists_update ON shopping_lists FOR UPDATE TO PUBLIC
USING (kitchen_space_id = ANY(current_kitchen_space_ids()))
WITH CHECK (kitchen_space_id = ANY(current_kitchen_space_ids()));

CREATE POLICY image_analyses_update ON image_analyses FOR UPDATE TO PUBLIC
USING (kitchen_space_id = ANY(current_kitchen_space_ids()) AND user_id = current_profile_id())
WITH CHECK (kitchen_space_id = ANY(current_kitchen_space_ids()) AND user_id = current_profile_id());

-- Tabelas filhas: atualização para membros do espaço
CREATE POLICY recipe_ingredients_update ON recipe_ingredients FOR UPDATE TO PUBLIC
USING (recipe_id IN (SELECT id FROM recipes WHERE kitchen_space_id = ANY(current_kitchen_space_ids())))
WITH CHECK (recipe_id IN (SELECT id FROM recipes WHERE kitchen_space_id = ANY(current_kitchen_space_ids())));

CREATE POLICY marmita_items_update ON marmita_items FOR UPDATE TO PUBLIC
USING (marmita_id IN (SELECT id FROM marmitas WHERE kitchen_space_id = ANY(current_kitchen_space_ids())))
WITH CHECK (marmita_id IN (SELECT id FROM marmitas WHERE kitchen_space_id = ANY(current_kitchen_space_ids())));

CREATE POLICY meal_items_update ON meal_items FOR UPDATE TO PUBLIC
USING (meal_id IN (SELECT id FROM meals WHERE kitchen_space_id = ANY(current_kitchen_space_ids())))
WITH CHECK (meal_id IN (SELECT id FROM meals WHERE kitchen_space_id = ANY(current_kitchen_space_ids())));

CREATE POLICY shopping_list_items_update ON shopping_list_items FOR UPDATE TO PUBLIC
USING (shopping_list_id IN (SELECT id FROM shopping_lists WHERE kitchen_space_id = ANY(current_kitchen_space_ids())))
WITH CHECK (shopping_list_id IN (SELECT id FROM shopping_lists WHERE kitchen_space_id = ANY(current_kitchen_space_ids())));

-- ---------- Políticas DELETE ----------
-- Exclusão lógica (deleted_at) quando aplicável; hard delete restrito ao admin
CREATE POLICY foods_delete ON foods FOR DELETE TO PUBLIC
USING (kitchen_space_id = ANY(current_kitchen_space_ids()) AND is_space_admin(kitchen_space_id));

CREATE POLICY products_delete ON products FOR DELETE TO PUBLIC
USING (kitchen_space_id = ANY(current_kitchen_space_ids()) AND is_space_admin(kitchen_space_id));

CREATE POLICY recipes_delete ON recipes FOR DELETE TO PUBLIC
USING (kitchen_space_id = ANY(current_kitchen_space_ids()) AND is_space_admin(kitchen_space_id));

CREATE POLICY marmitas_delete ON marmitas FOR DELETE TO PUBLIC
USING (kitchen_space_id = ANY(current_kitchen_space_ids()) AND is_space_admin(kitchen_space_id));

CREATE POLICY meals_delete ON meals FOR DELETE TO PUBLIC
USING (kitchen_space_id = ANY(current_kitchen_space_ids()) AND user_id = current_profile_id());

CREATE POLICY orders_delete ON orders FOR DELETE TO PUBLIC
USING (kitchen_space_id = ANY(current_kitchen_space_ids()) AND is_space_admin(kitchen_space_id));

CREATE POLICY shopping_lists_delete ON shopping_lists FOR DELETE TO PUBLIC
USING (kitchen_space_id = ANY(current_kitchen_space_ids()) AND is_space_admin(kitchen_space_id));

CREATE POLICY image_analyses_delete ON image_analyses FOR DELETE TO PUBLIC
USING (kitchen_space_id = ANY(current_kitchen_space_ids()) AND user_id = current_profile_id());

COMMENT ON POLICY foods_update ON foods IS 'Admin edita tudo; usuário edita apenas o que criou. Papéis administrativos não editáveis livremente pelo próprio usuário.';
