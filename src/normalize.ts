import { pool } from '../db';

/**
 * Ponte entre o documento AppState (frontend legado) e o modelo relacional.
 *
 * O frontend continua salvando o documento completo em app_state para não
 * perder nenhuma funcionalidade. Depois de cada salvamento, este módulo
 * espelha alimentos, produtos, receitas, marmitas e refeições nas tabelas
 * normalizadas, preservando IDs estáveis em external_id.
 */

type AnyState = Record<string, any>;

const num = (value: any): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const per100 = (value: any, portionGrams: number) => {
  const v = num(value);
  if (v === null || !portionGrams) return null;
  return (v / portionGrams) * 100;
};

const cleanText = (value: any) =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

function prepState(value: any) {
  const allowed = ['cru', 'cozido', 'grelhado', 'assado', 'refogado', 'frito', 'no_vapor'];
  return allowed.includes(value) ? value : 'cru';
}

function nutritionSource(value: any) {
  // O banco só aceita estes valores (CHECK constraint da tabela foods).
  const map: Record<string, string> = {
    TACO: 'TACO',
    TBCA: 'TBCA',
    USDA: 'USDA',
    'Open Food Facts': 'Open Food Facts',
    'Rótulo OCR': 'Rótulo',
    'Rótulo': 'Rótulo',
    IA: 'Manual',
    Manual: 'Manual',
  };
  return map[value] || 'Manual';
}

function productDataSource(value: any) {
  const map: Record<string, string> = {
    'Open Food Facts': 'Open Food Facts',
    'Rótulo OCR': 'Rótulo',
    'Rótulo': 'Rótulo',
    Manual: 'Manual',
  };
  return map[value] || 'Manual';
}

async function findSpace(profileId: string): Promise<string | null> {
  const { rows } = await pool!.query(
    `SELECT kitchen_space_id FROM memberships WHERE profile_id = $1 ORDER BY joined_at LIMIT 1`,
    [profileId]
  );
  return rows[0]?.kitchen_space_id || null;
}

async function findFoodByName(client: any, spaceId: string, name: string) {
  if (!name) return null;
  const { rows } = await client.query(
    `SELECT id FROM foods
     WHERE kitchen_space_id = $1 AND deleted_at IS NULL
       AND lower(btrim(name)) = lower(btrim($2))
     ORDER BY created_at LIMIT 1`,
    [spaceId, name]
  );
  return rows[0]?.id || null;
}

async function upsertFood(
  client: any,
  spaceId: string,
  profileId: string,
  food: any,
  externalId: string
) {
  const name = cleanText(food.name);
  if (!name) return null;
  const portion = num(food.portionGrams) || 100;
  const brand = cleanText(food.brand);
  const state = prepState(food.prepState);
  const existing = await client.query(
    `SELECT id FROM foods
     WHERE kitchen_space_id = $1 AND deleted_at IS NULL
       AND lower(btrim(name)) = lower(btrim($2))
       AND prep_state = $3
       AND lower(btrim(COALESCE(brand,''))) = lower(btrim(COALESCE($4,'')))
     LIMIT 1`,
    [spaceId, name, state, brand || '']
  );

  const values = [
    per100(food.calories, portion),
    per100(food.protein, portion),
    per100(food.carbs, portion),
    per100(food.fat, portion),
    per100(food.fiber, portion),
    nutritionSource(food.source),
    cleanText(food.source) || 'Manual',
    food.verified ? 'verified' : 'pending',
    brand,
  ];

  if (existing.rowCount) {
    const id = existing.rows[0].id;
    await client.query(
      `UPDATE foods SET
         calories_per_100g = COALESCE($2, calories_per_100g),
         protein_per_100g = COALESCE($3, protein_per_100g),
         carbs_per_100g = COALESCE($4, carbs_per_100g),
         fat_total_per_100g = COALESCE($5, fat_total_per_100g),
         fiber_per_100g = COALESCE($6, fiber_per_100g),
         nutrition_source = $7,
         data_origin = $8,
         verification_status = $9,
         brand = COALESCE(brand, $10),
         updated_by = $11,
         external_id = COALESCE(external_id, $12)
       WHERE id = $1`,
      [id, ...values, profileId, externalId]
    );
    return id;
  }

  const { rows } = await client.query(
    `INSERT INTO foods (
       kitchen_space_id, created_by, name, brand, category, prep_state,
       calories_per_100g, protein_per_100g, carbs_per_100g, fat_total_per_100g,
       fiber_per_100g, nutrition_source, data_origin, verification_status, external_id
     ) VALUES ($1,$2,$3,$4,'Cadastro manual',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      spaceId,
      profileId,
      name,
      brand,
      state,
      values[0],
      values[1],
      values[2],
      values[3],
      values[4],
      values[5],
      values[6],
      values[7],
      externalId,
    ]
  );
  if (rows[0]?.id) return rows[0].id;

  const fallback = await findFoodByName(client, spaceId, name);
  return fallback;
}

async function upsertProduct(
  client: any,
  spaceId: string,
  profileId: string,
  food: any,
  externalId: string
) {
  const barcode = cleanText(food.barcode);
  const name = cleanText(food.name);
  if (!barcode || !name) return null;
  if (!/^\d{8}$|^\d{12,14}$/.test(barcode)) return null;

  const portion = num(food.portionGrams) || 100;
  const p100 = food.per100g || {};
  const values = [
    p100.calories ?? per100(food.calories, portion),
    p100.protein ?? per100(food.protein, portion),
    p100.carbs ?? per100(food.carbs, portion),
    p100.fat ?? per100(food.fat, portion),
    p100.fiber ?? per100(food.fiber, portion),
    p100.sodium ?? null,
  ];

  const existing = await client.query(`SELECT id FROM products WHERE barcode = $1`, [barcode]);
  if (existing.rowCount) {
    const id = existing.rows[0].id;
    await client.query(
      `UPDATE products SET
         calories_per_100 = COALESCE($2, calories_per_100),
         protein_per_100 = COALESCE($3, protein_per_100),
         carbs_per_100 = COALESCE($4, carbs_per_100),
         fat_per_100 = COALESCE($5, fat_per_100),
         fiber_per_100 = COALESCE($6, fiber_per_100),
         sodium_per_100 = COALESCE($7, sodium_per_100),
         updated_by = $8,
         last_updated_at = now(),
         external_id = COALESCE(external_id, $9)
       WHERE id = $1`,
      [id, ...values, profileId, externalId]
    );
    return id;
  }

  const { rows } = await client.query(
    `INSERT INTO products (
       kitchen_space_id, created_by, barcode, commercial_name, brand,
       serving_quantity, serving_unit, calories_per_100, protein_per_100,
       carbs_per_100, fat_per_100, fiber_per_100, sodium_per_100,
       data_source, verification_status, external_id
     ) VALUES ($1,$2,$3,$4,$5,$6,'g',$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (barcode) DO NOTHING
     RETURNING id`,
    [
      spaceId,
      profileId,
      barcode,
      name,
      cleanText(food.brand),
      portion,
      values[0],
      values[1],
      values[2],
      values[3],
      values[4],
      values[5],
      productDataSource(food.source),
      food.verified ? 'verified' : 'pending',
      externalId,
    ]
  );
  return rows[0]?.id || null;
}

async function syncRecipes(client: any, spaceId: string, profileId: string, recipes: any[]) {
  for (const recipe of recipes) {
    if (!recipe?.id || !recipe?.title) continue;
    const externalId = `recipe:${recipe.id}`;
    const servings = Math.max(1, Number(recipe.servings) || 1);
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];

    const existing = await client.query(
      `SELECT id FROM recipes WHERE kitchen_space_id = $1 AND external_id = $2`,
      [spaceId, externalId]
    );
    let recipeId: string;
    if (existing.rowCount) {
      recipeId = existing.rows[0].id;
      await client.query(
        `UPDATE recipes SET
           title = $2, description = $3, photo_path = $4, instructions = $5,
           servings = $6, prep_time_minutes = $7, status = $8, is_favorite = $9,
           carinho_tip = $10, updated_by = $11
         WHERE id = $1`,
        [
          recipeId,
          recipe.title,
          cleanText(recipe.description),
          cleanText(recipe.photoUrl),
          Array.isArray(recipe.instructions)
            ? recipe.instructions.join('\n')
            : cleanText(recipe.instructions),
          servings,
          num(recipe.prepTimeMinutes),
          recipe.status || 'aprovada',
          Boolean(recipe.isFavorite),
          cleanText(recipe.carinhoTip),
          profileId,
        ]
      );
      await client.query(`DELETE FROM recipe_ingredients WHERE recipe_id = $1`, [recipeId]);
    } else {
      const inserted = await client.query(
        `INSERT INTO recipes (
           kitchen_space_id, author_id, title, description, photo_path, instructions,
           servings, prep_time_minutes, status, is_favorite, carinho_tip, external_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          spaceId,
          profileId,
          recipe.title,
          cleanText(recipe.description),
          cleanText(recipe.photoUrl),
          Array.isArray(recipe.instructions)
            ? recipe.instructions.join('\n')
            : cleanText(recipe.instructions),
          servings,
          num(recipe.prepTimeMinutes),
          recipe.status || 'aprovada',
          Boolean(recipe.isFavorite),
          cleanText(recipe.carinhoTip),
          externalId,
        ]
      );
      if (!inserted.rows[0]?.id) continue;
      recipeId = inserted.rows[0].id;
    }

    const totalWeight = ingredients.reduce(
      (acc: number, ing: any) => acc + (num(ing.grams) || num(ing.weight_grams) || 0),
      0
    );
    const recipeCalories = num(recipe.caloriesPerServing);
    const recipeProtein = num(recipe.proteinPerServing);
    const recipeCarbs = num(recipe.carbsPerServing);
    const recipeFat = num(recipe.fatPerServing);
    const recipeFiber = num(recipe.fiberPerServing);

    for (const ing of ingredients) {
      const weight = num(ing.grams) ?? num(ing.weight_grams) ?? 0;
      const foodId = await findFoodByName(client, spaceId, ing.name || '');
      const ratio = totalWeight > 0 ? weight / totalWeight : 0;
      await client.query(
        `INSERT INTO recipe_ingredients
           (recipe_id, food_id, quantity, unit, weight_grams, calories, protein, carbs, fat, fiber)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          recipeId,
          foodId,
          weight || 1,
          'g',
          weight,
          recipeCalories === null ? null : recipeCalories * servings * ratio,
          recipeProtein === null ? null : recipeProtein * servings * ratio,
          recipeCarbs === null ? null : recipeCarbs * servings * ratio,
          recipeFat === null ? null : recipeFat * servings * ratio,
          recipeFiber === null ? null : recipeFiber * servings * ratio,
        ]
      );
    }
  }
}

async function syncMarmitas(client: any, spaceId: string, profileId: string, marmitas: any[]) {
  for (const marmita of marmitas) {
    if (!marmita?.id || !marmita?.name) continue;
    const externalId = `marmita:${marmita.id}`;
    const existing = await client.query(
      `SELECT id FROM marmitas WHERE kitchen_space_id = $1 AND external_id = $2`,
      [spaceId, externalId]
    );
    let marmitaId: string;
    if (existing.rowCount) {
      marmitaId = existing.rows[0].id;
      await client.query(
        `UPDATE marmitas SET
           name = $2, description = $3, photo_path = $4, status = $5, updated_by = $6
         WHERE id = $1`,
        [
          marmitaId,
          marmita.name,
          cleanText(marmita.description),
          cleanText(marmita.photoUrl),
          marmita.status || 'publicada',
          profileId,
        ]
      );
      await client.query(`DELETE FROM marmita_items WHERE marmita_id = $1`, [marmitaId]);
    } else {
      const inserted = await client.query(
        `INSERT INTO marmitas (
           kitchen_space_id, prepared_by, name, description, photo_path, status, external_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          spaceId,
          profileId,
          marmita.name,
          cleanText(marmita.description),
          cleanText(marmita.photoUrl),
          marmita.status || 'publicada',
          externalId,
        ]
      );
      if (!inserted.rows[0]?.id) continue;
      marmitaId = inserted.rows[0].id;
    }

    const items = Array.isArray(marmita.items) ? marmita.items : [];
    for (const item of items) {
      const foodId = await findFoodByName(client, spaceId, item.foodName || '');
      await client.query(
        `INSERT INTO marmita_items
           (marmita_id, food_id, weight_grams, calories, protein, carbs, fat, fiber)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          marmitaId,
          foodId,
          num(item.weightGrams) || 0,
          num(item.calories),
          num(item.protein),
          num(item.carbs),
          num(item.fat),
          num(item.fiber),
        ]
      );
    }
  }
}

async function syncMeals(client: any, spaceId: string, profileId: string, meals: any[]) {
  for (const meal of meals) {
    if (!meal?.id || !meal?.date || !meal?.mealType) continue;
    const externalId = `meal:${meal.id}`;
    const existing = await client.query(
      `SELECT id FROM meals WHERE kitchen_space_id = $1 AND external_id = $2`,
      [spaceId, externalId]
    );
    let mealId: string;
    if (existing.rowCount) {
      mealId = existing.rows[0].id;
      await client.query(
        `UPDATE meals SET
           title = $2, photo_path = $3, confidence_notes = $4, updated_by = $5
         WHERE id = $1`,
        [
          mealId,
          cleanText(meal.title),
          cleanText(meal.photoUrl),
          cleanText(meal.confidenceNotes),
          profileId,
        ]
      );
      await client.query(`DELETE FROM meal_items WHERE meal_id = $1`, [mealId]);
    } else {
      const inserted = await client.query(
        `INSERT INTO meals (
           kitchen_space_id, user_id, meal_date, meal_type, title, photo_path,
           identification_method, confidence_notes, external_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          spaceId,
          profileId,
          meal.date,
          meal.mealType,
          cleanText(meal.title),
          cleanText(meal.photoUrl),
          meal.confidenceNotes ? 'foto' : 'manual',
          cleanText(meal.confidenceNotes),
          externalId,
        ]
      );
      if (!inserted.rows[0]?.id) continue;
      mealId = inserted.rows[0].id;
    }

    const foods = Array.isArray(meal.foods) ? meal.foods : [];
    for (const food of foods) {
      const foodId = await findFoodByName(client, spaceId, food.name || '');
      await client.query(
        `INSERT INTO meal_items
           (meal_id, food_id, weight_grams, calories, protein, carbs, fat, fiber, source, verified)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          mealId,
          foodId,
          num(food.portionGrams) || 0,
          num(food.calories),
          num(food.protein),
          num(food.carbs),
          num(food.fat),
          num(food.fiber),
          nutritionSource(food.source),
          Boolean(food.verified),
        ]
      );
    }
  }
}

export async function syncAppStateToDatabase(state: AnyState, profileId: string) {
  if (!pool || !state || !profileId) return { ok: false, reason: 'missing_data' };

  const spaceId = await findSpace(profileId);
  if (!spaceId) return { ok: false, reason: 'no_space' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const customFoods = Array.isArray(state.customFoods) ? state.customFoods : [];
    for (const food of customFoods) {
      if (!food?.id) continue;
      await upsertFood(client, spaceId, profileId, food, `food:${food.id}`);
      if (food.barcode) {
        await upsertProduct(client, spaceId, profileId, food, `product:${food.id}`);
      }
    }

    await syncRecipes(client, spaceId, profileId, Array.isArray(state.recipes) ? state.recipes : []);
    await syncMarmitas(
      client,
      spaceId,
      profileId,
      Array.isArray(state.marmitas) ? state.marmitas : []
    );

    const logs = [
      ...(Array.isArray(state.todayLogs) ? state.todayLogs : []),
      ...(Array.isArray(state.historyLogs) ? state.historyLogs : []),
    ];
    await syncMeals(client, spaceId, profileId, logs);

    await client.query(`SELECT emit_sync_event($1,'app_state',NULL,'sync',$2)`, [
      spaceId,
      JSON.stringify({ lastUpdated: state.lastUpdated || new Date().toISOString() }),
    ]);
    await client.query('COMMIT');
    return { ok: true, spaceId };
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Falha ao normalizar AppState:', err.message || err);
    return { ok: false, reason: err.message || String(err) };
  } finally {
    client.release();
  }
}
