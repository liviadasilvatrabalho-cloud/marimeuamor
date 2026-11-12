-- Migration 012: Funções reutilizáveis de cálculo nutricional
-- Our Little Kitchen - Neon Postgres
-- Fórmula de referência: valor = (quantidade_em_gramas / 100) × valor_por_100g
-- Sem arredondamentos intermediários; arredondar somente na apresentação.

-- Calcula os valores nutricionais de uma porção dado um alimento (valores por 100g).
-- Retorna JSON com calories, protein, carbs, fat, fiber e os campos opcionais.
CREATE OR REPLACE FUNCTION calc_food_portion(
  p_grams            NUMERIC,
  p_calories_100g    NUMERIC,
  p_protein_100g     NUMERIC,
  p_carbs_100g       NUMERIC,
  p_fat_100g         NUMERIC,
  p_fiber_100g       NUMERIC,
  p_sugars_100g      NUMERIC DEFAULT NULL,
  p_sodium_100g      NUMERIC DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  ratio NUMERIC;
  v_calories NUMERIC;
  v_protein NUMERIC;
  v_carbs NUMERIC;
  v_fat NUMERIC;
  v_fiber NUMERIC;
  v_sugars NUMERIC;
  v_sodium NUMERIC;
BEGIN
  ratio := COALESCE(p_grams, 0) / 100;

  v_calories := CASE WHEN p_calories_100g IS NULL THEN NULL ELSE p_calories_100g * ratio END;
  v_protein  := CASE WHEN p_protein_100g  IS NULL THEN NULL ELSE p_protein_100g  * ratio END;
  v_carbs    := CASE WHEN p_carbs_100g    IS NULL THEN NULL ELSE p_carbs_100g    * ratio END;
  v_fat      := CASE WHEN p_fat_100g      IS NULL THEN NULL ELSE p_fat_100g      * ratio END;
  v_fiber    := CASE WHEN p_fiber_100g    IS NULL THEN NULL ELSE p_fiber_100g    * ratio END;
  v_sugars   := CASE WHEN p_sugars_100g   IS NULL THEN NULL ELSE p_sugars_100g   * ratio END;
  v_sodium   := CASE WHEN p_sodium_100g   IS NULL THEN NULL ELSE p_sodium_100g   * ratio END;

  RETURN jsonb_build_object(
    'portion_grams', p_grams,
    'calories', v_calories,
    'protein', v_protein,
    'carbs', v_carbs,
    'fat', v_fat,
    'fiber', v_fiber,
    'sugars', v_sugars,
    'sodium', v_sodium,
    'ratio', ratio
  );
END;
$$;

-- Recalcula os valores nutricionais de um item de receita e retorna o JSON para UPDATE.
CREATE OR REPLACE FUNCTION calc_recipe_ingredient(
  p_food_id      UUID,
  p_product_id   UUID,
  p_weight_grams NUMERIC
) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_food RECORD;
  v_product RECORD;
  v_ratio NUMERIC;
  v_calories NUMERIC;
  v_protein NUMERIC;
  v_carbs NUMERIC;
  v_fat NUMERIC;
  v_fiber NUMERIC;
BEGIN
  -- Tenta alimento primeiro, depois produto
  IF p_food_id IS NOT NULL THEN
    SELECT calories_per_100g, protein_per_100g, carbs_per_100g, fat_total_per_100g, fiber_per_100g
      INTO v_food FROM foods WHERE id = p_food_id AND deleted_at IS NULL;
  END IF;

  IF p_product_id IS NOT NULL AND (v_food IS NULL OR v_food.calories_per_100g IS NULL) THEN
    SELECT calories_per_100, protein_per_100, carbs_per_100, fat_per_100, fiber_per_100
      INTO v_product FROM products WHERE id = p_product_id AND deleted_at IS NULL;
  END IF;

  v_ratio := COALESCE(p_weight_grams, 0) / 100;

  v_calories := CASE
    WHEN v_food.calories_per_100g IS NOT NULL THEN v_food.calories_per_100g * v_ratio
    WHEN v_product.calories_per_100 IS NOT NULL THEN v_product.calories_per_100 * v_ratio
    ELSE NULL END;
  v_protein := CASE
    WHEN v_food.protein_per_100g IS NOT NULL THEN v_food.protein_per_100g * v_ratio
    WHEN v_product.protein_per_100 IS NOT NULL THEN v_product.protein_per_100 * v_ratio
    ELSE NULL END;
  v_carbs := CASE
    WHEN v_food.carbs_per_100g IS NOT NULL THEN v_food.carbs_per_100g * v_ratio
    WHEN v_product.carbs_per_100 IS NOT NULL THEN v_product.carbs_per_100 * v_ratio
    ELSE NULL END;
  v_fat := CASE
    WHEN v_food.fat_total_per_100g IS NOT NULL THEN v_food.fat_total_per_100g * v_ratio
    WHEN v_product.fat_per_100 IS NOT NULL THEN v_product.fat_per_100 * v_ratio
    ELSE NULL END;
  v_fiber := CASE
    WHEN v_food.fiber_per_100g IS NOT NULL THEN v_food.fiber_per_100g * v_ratio
    WHEN v_product.fiber_per_100 IS NOT NULL THEN v_product.fiber_per_100 * v_ratio
    ELSE NULL END;

  RETURN jsonb_build_object(
    'weight_grams', p_weight_grams,
    'calories', v_calories,
    'protein', v_protein,
    'carbs', v_carbs,
    'fat', v_fat,
    'fiber', v_fiber
  );
END;
$$;

-- Retorna os totais nutricionais de uma refeição a partir dos seus itens.
CREATE OR REPLACE FUNCTION calc_meal_totals(p_meal_id UUID)
RETURNS TABLE (
  total_calories NUMERIC,
  total_protein  NUMERIC,
  total_carbs    NUMERIC,
  total_fat      NUMERIC,
  total_fiber    NUMERIC
) LANGUAGE sql STABLE AS $$
  SELECT
    round(sum(calories)::numeric, 2),
    round(sum(protein)::numeric, 2),
    round(sum(carbs)::numeric, 2),
    round(sum(fat)::numeric, 2),
    round(sum(fiber)::numeric, 2)
  FROM meal_items
  WHERE meal_id = p_meal_id;
$$;

COMMENT ON FUNCTION calc_food_portion IS 'Calcula valores nutricionais de uma porção (gramas/100 × valor por 100g), sem arredondar intermediários.';
COMMENT ON FUNCTION calc_recipe_ingredient IS 'Calcula valores nutricionais de um ingrediente de receita a partir do alimento/produto.';
COMMENT ON FUNCTION calc_meal_totals IS 'Agrega totais nutricionais de uma refeição a partir dos itens.';
