-- Migration 013: Triggers de updated_at e food_nutrition_history (audit)
-- Our Little Kitchen - Neon Postgres

-- Função genérica que atualiza updated_at em qualquer tabela que tenha a coluna.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Tabelas que possuem a coluna updated_at e devem receber o trigger automático
DROP TRIGGER IF EXISTS trg_kitchen_spaces_updated_at ON kitchen_spaces;
CREATE TRIGGER trg_kitchen_spaces_updated_at
  BEFORE UPDATE ON kitchen_spaces FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_memberships_updated_at ON memberships;
CREATE TRIGGER trg_memberships_updated_at
  BEFORE UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_foods_updated_at ON foods;
CREATE TRIGGER trg_foods_updated_at
  BEFORE UPDATE ON foods FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_household_measures_updated_at ON household_measures;
CREATE TRIGGER trg_household_measures_updated_at
  BEFORE UPDATE ON household_measures FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_recipes_updated_at ON recipes;
CREATE TRIGGER trg_recipes_updated_at
  BEFORE UPDATE ON recipes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_recipe_ingredients_updated_at ON recipe_ingredients;
CREATE TRIGGER trg_recipe_ingredients_updated_at
  BEFORE UPDATE ON recipe_ingredients FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_marmitas_updated_at ON marmitas;
CREATE TRIGGER trg_marmitas_updated_at
  BEFORE UPDATE ON marmitas FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_marmita_items_updated_at ON marmita_items;
CREATE TRIGGER trg_marmita_items_updated_at
  BEFORE UPDATE ON marmita_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_meals_updated_at ON meals;
CREATE TRIGGER trg_meals_updated_at
  BEFORE UPDATE ON meals FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_meal_items_updated_at ON meal_items;
CREATE TRIGGER trg_meal_items_updated_at
  BEFORE UPDATE ON meal_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_image_analyses_updated_at ON image_analyses;
CREATE TRIGGER trg_image_analyses_updated_at
  BEFORE UPDATE ON image_analyses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_shopping_lists_updated_at ON shopping_lists;
CREATE TRIGGER trg_shopping_lists_updated_at
  BEFORE UPDATE ON shopping_lists FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_shopping_list_items_updated_at ON shopping_list_items;
CREATE TRIGGER trg_shopping_list_items_updated_at
  BEFORE UPDATE ON shopping_list_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_order_status_history_updated_at ON order_status_history;
CREATE TRIGGER trg_order_status_history_updated_at
  BEFORE UPDATE ON order_status_history FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_food_nutrition_history_updated_at ON food_nutrition_history;
CREATE TRIGGER trg_food_nutrition_history_updated_at
  BEFORE UPDATE ON food_nutrition_history FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_product_nutrition_history_updated_at ON product_nutrition_history;
CREATE TRIGGER trg_product_nutrition_history_updated_at
  BEFORE UPDATE ON product_nutrition_history FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_storage_files_updated_at ON storage_files;
CREATE TRIGGER trg_storage_files_updated_at
  BEFORE UPDATE ON storage_files FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Trigger de auditoria: ao atualizar valores nutricionais de um alimento, grava histórico (antes/depois)
CREATE OR REPLACE FUNCTION trg_food_nutrition_history()
RETURNS TRIGGER AS $$
DECLARE
  prev_keys TEXT[] := ARRAY[
    'calories_per_100g','protein_per_100g','carbs_per_100g','fat_total_per_100g',
    'fat_saturated_per_100g','fiber_per_100g','sugars_per_100g','sodium_per_100g'
  ];
  prev_vals JSONB := '{}';
  new_vals  JSONB := '{}';
BEGIN
  IF (
    OLD.calories_per_100g IS DISTINCT FROM NEW.calories_per_100g OR
    OLD.protein_per_100g  IS DISTINCT FROM NEW.protein_per_100g OR
    OLD.carbs_per_100g    IS DISTINCT FROM NEW.carbs_per_100g OR
    OLD.fat_total_per_100g IS DISTINCT FROM NEW.fat_total_per_100g OR
    OLD.fiber_per_100g    IS DISTINCT FROM NEW.fiber_per_100g
  ) THEN
    -- Grava apenas os campos que realmente mudaram
    IF OLD.calories_per_100g IS DISTINCT FROM NEW.calories_per_100g THEN
      prev_vals := prev_vals || jsonb_build_object('calories_per_100g', OLD.calories_per_100g);
      new_vals  := new_vals  || jsonb_build_object('calories_per_100g', NEW.calories_per_100g);
    END IF;
    IF OLD.protein_per_100g IS DISTINCT FROM NEW.protein_per_100g THEN
      prev_vals := prev_vals || jsonb_build_object('protein_per_100g', OLD.protein_per_100g);
      new_vals  := new_vals  || jsonb_build_object('protein_per_100g', NEW.protein_per_100g);
    END IF;
    IF OLD.carbs_per_100g IS DISTINCT FROM NEW.carbs_per_100g THEN
      prev_vals := prev_vals || jsonb_build_object('carbs_per_100g', OLD.carbs_per_100g);
      new_vals  := new_vals  || jsonb_build_object('carbs_per_100g', NEW.carbs_per_100g);
    END IF;
    IF OLD.fat_total_per_100g IS DISTINCT FROM NEW.fat_total_per_100g THEN
      prev_vals := prev_vals || jsonb_build_object('fat_total_per_100g', OLD.fat_total_per_100g);
      new_vals  := new_vals  || jsonb_build_object('fat_total_per_100g', NEW.fat_total_per_100g);
    END IF;
    IF OLD.fat_saturated_per_100g IS DISTINCT FROM NEW.fat_saturated_per_100g THEN
      prev_vals := prev_vals || jsonb_build_object('fat_saturated_per_100g', OLD.fat_saturated_per_100g);
      new_vals  := new_vals  || jsonb_build_object('fat_saturated_per_100g', NEW.fat_saturated_per_100g);
    END IF;
    IF OLD.fiber_per_100g IS DISTINCT FROM NEW.fiber_per_100g THEN
      prev_vals := prev_vals || jsonb_build_object('fiber_per_100g', OLD.fiber_per_100g);
      new_vals  := new_vals  || jsonb_build_object('fiber_per_100g', NEW.fiber_per_100g);
    END IF;
    IF OLD.sugars_per_100g IS DISTINCT FROM NEW.sugars_per_100g THEN
      prev_vals := prev_vals || jsonb_build_object('sugars_per_100g', OLD.sugars_per_100g);
      new_vals  := new_vals  || jsonb_build_object('sugars_per_100g', NEW.sugars_per_100g);
    END IF;
    IF OLD.sodium_per_100g IS DISTINCT FROM NEW.sodium_per_100g THEN
      prev_vals := prev_vals || jsonb_build_object('sodium_per_100g', OLD.sodium_per_100g);
      new_vals  := new_vals  || jsonb_build_object('sodium_per_100g', NEW.sodium_per_100g);
    END IF;

    INSERT INTO food_nutrition_history (food_id, changed_by, previous_values, new_values, change_reason, changed_at)
    VALUES (NEW.id, NEW.updated_by, prev_vals, new_vals, 'atualizacao_nutricional', now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_foods_nutrition_history ON foods;
CREATE TRIGGER trg_foods_nutrition_history
BEFORE UPDATE ON foods
FOR EACH ROW
EXECUTE FUNCTION trg_food_nutrition_history();

COMMENT ON FUNCTION set_updated_at IS 'Trigger genérico que preenche updated_at = now() antes de UPDATE.';
COMMENT ON FUNCTION trg_food_nutrition_history IS 'Grava histórico (antes/depois) ao alterar valores nutricionais de alimentos.';
