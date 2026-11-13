import dotenv from 'dotenv';
dotenv.config();

import { parsePtBrNumber } from '../server';

async function testPrecisionAndDecimals() {
  console.log('🧪 Testando precisão numérica e preservação decimal...');

  const cases = [
    { input: '12,5 g', expected: 12.5 },
    { input: '0,8 g', expected: 0.8 },
    { input: '3,25 g', expected: 3.25 },
    { input: '125,6 kcal', expected: 125.6 },
    { input: '1,5 mg', expected: 1.5 },
    { input: '0,04 g', expected: 0.04 },
    { input: '12.5', expected: 12.5 },
    { input: 12.5, expected: 12.5 },
    { input: '140,5', expected: 140.5 },
    { input: '1.250,50', expected: 1250.5 },
  ];

  for (const c of cases) {
    const result = parsePtBrNumber(c.input);
    if (result !== c.expected) {
      throw new Error(`Falha no parse de ${c.input}: esperado ${c.expected}, obtido ${result}`);
    }
    console.log(`  ✓ ${c.input} -> ${result} (Exato)`);
  }

  // Testa salvamento com casas decimais no Postgres e app_state
  const { initDatabase, pool, STATE_ID } = await import('../db');
  await initDatabase();

  const testFood = {
    productName: 'Iogurte Grego Precisão Decimal Teste',
    brand: 'Danone Teste',
    servingSize: '100g',
    servingGrams: 100,
    per100g: {
      calories: 125.6,
      protein: 12.5,
      carbs: 0.8,
      fat: 3.25,
      fiber: 0.04,
      sodium: 1.5,
      sugars: 0.8,
      addedSugars: 0,
      saturatedFat: 2.1,
      transFat: 0.04,
    },
    ingredients: 'Leite, fermentos lácteos.',
  };

  const stateRes = await pool.query('SELECT data FROM app_state WHERE id = $1', [STATE_ID]);
  const stateData = stateRes.rows[0]?.data || {};
  const currentCustom = Array.isArray(stateData.customFoods) ? stateData.customFoods : [];

  const savedItem = {
    id: `food-prec-${Date.now()}`,
    name: testFood.productName,
    brand: testFood.brand,
    portionGrams: testFood.servingGrams,
    calories: testFood.per100g.calories,
    protein: testFood.per100g.protein,
    carbs: testFood.per100g.carbs,
    fat: testFood.per100g.fat,
    fiber: testFood.per100g.fiber,
    sodium: testFood.per100g.sodium,
    per100g: testFood.per100g,
    source: 'Foto da Tabela',
    verified: true,
  };

  const updated = [savedItem, ...currentCustom.filter((f: any) => f.name !== testFood.productName)];
  await pool.query(
    "UPDATE app_state SET data = jsonb_set(data, '{customFoods}', $1::jsonb), updated_at = now() WHERE id = $2",
    [JSON.stringify(updated), STATE_ID]
  );

  // Recarrega e valida se nenhum decimal foi truncado ou arredondado
  const verifyRes = await pool.query('SELECT data FROM app_state WHERE id = $1', [STATE_ID]);
  const found = (verifyRes.rows[0]?.data?.customFoods || []).find((f: any) => f.name === testFood.productName);

  if (!found) throw new Error('Item não encontrado após reload');
  if (found.calories !== 125.6) throw new Error(`Calorias corrompidas: ${found.calories}`);
  if (found.protein !== 12.5) throw new Error(`Proteína corrompida: ${found.protein}`);
  if (found.carbs !== 0.8) throw new Error(`Carboidratos corrompidos: ${found.carbs}`);
  if (found.fat !== 3.25) throw new Error(`Gordura corrompida: ${found.fat}`);
  if (found.fiber !== 0.04) throw new Error(`Fibra corrompida: ${found.fiber}`);

  console.log('🎉 TODOS OS TESTES DE PRECISÃO DECIMAL PASSARAM COM 100% DE EXATIDÃO!');
  process.exit(0);
}

testPrecisionAndDecimals().catch((err) => {
  console.error('❌ Erro no teste:', err);
  process.exit(1);
});
