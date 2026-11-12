-- Migration 017: Totais de receita por porção
-- Os ingredientes são armazenados para a receita inteira; os campos
-- *_per_serving devem ser divididos pelo número de porções.

CREATE OR REPLACE FUNCTION recalc_recipe_totals(p_recipe_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE recipes r SET
    calories_per_serving = CASE WHEN t.cal IS NULL THEN NULL ELSE t.cal / GREATEST(r.servings, 1) END,
    protein_per_serving  = CASE WHEN t.pro IS NULL THEN NULL ELSE t.pro / GREATEST(r.servings, 1) END,
    carbs_per_serving    = CASE WHEN t.car IS NULL THEN NULL ELSE t.car / GREATEST(r.servings, 1) END,
    fat_per_serving      = CASE WHEN t.fat IS NULL THEN NULL ELSE t.fat / GREATEST(r.servings, 1) END,
    fiber_per_serving    = CASE WHEN t.fib IS NULL THEN NULL ELSE t.fib / GREATEST(r.servings, 1) END
  FROM (
    SELECT
      sum(calories) AS cal, sum(protein) AS pro, sum(carbs) AS car,
      sum(fat) AS fat, sum(fiber) AS fib
    FROM recipe_ingredients WHERE recipe_id = p_recipe_id
  ) t
  WHERE r.id = p_recipe_id;
END;
$$;

COMMENT ON FUNCTION recalc_recipe_totals IS 'Soma os ingredientes (receita inteira) e divide pelas porções para obter valores por porção.';
