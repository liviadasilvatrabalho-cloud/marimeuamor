-- Migration 010: Listas de compras
-- Our Little Kitchen - Neon Postgres

CREATE TABLE IF NOT EXISTS shopping_lists (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kitchen_space_id UUID NOT NULL REFERENCES kitchen_spaces(id) ON DELETE CASCADE,
  created_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,
  week_start_date  DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Itens da lista de compras (alimento ou produto)
CREATE TABLE IF NOT EXISTS shopping_list_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopping_list_id  UUID NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  food_id           UUID REFERENCES foods(id) ON DELETE SET NULL,
  product_id        UUID REFERENCES products(id) ON DELETE SET NULL,
  quantity          NUMERIC(7,2) NOT NULL,
  unit              TEXT NOT NULL,
  is_purchased      BOOLEAN DEFAULT false,
  purchased_at      TIMESTAMPTZ,
  linked_recipe_id  UUID REFERENCES recipes(id) ON DELETE SET NULL,
  linked_marmita_id UUID REFERENCES marmitas(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_shopping_lists_space ON shopping_lists(kitchen_space_id);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_created_by ON shopping_lists(created_by);
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_list ON shopping_list_items(shopping_list_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_food ON shopping_list_items(food_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_product ON shopping_list_items(product_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_purchased ON shopping_list_items(is_purchased);

COMMENT ON TABLE shopping_lists IS 'Listas de compras do espaço compartilhado.';
COMMENT ON TABLE shopping_list_items IS 'Itens de uma lista de compras (alimento ou produto) com quantidade e status de compra.';
