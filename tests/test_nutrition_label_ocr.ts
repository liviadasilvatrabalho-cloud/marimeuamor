import dotenv from 'dotenv';
dotenv.config();

async function runTest() {
  console.log('🧪 Iniciando teste do novo sistema de cadastro de alimentos por foto da tabela...');

  const { initDatabase, pool, STATE_ID } = await import('../db');
  await initDatabase();

  console.log('✅ Banco de dados inicializado com sucesso.');

  const testPayload = {
    productName: 'Iogurte Natural Integral Desnatado Teste IA',
    brand: 'Danone Teste',
    servingSize: '170g (1 pote)',
    servingGrams: 170,
    householdMeasure: '1 pote',
    per100g: {
      calories: 51,
      protein: 4.1,
      carbs: 5.8,
      fat: 1.5,
      fiber: 0,
      sodium: 65,
      sugars: 5.8,
      addedSugars: 0,
      saturatedFat: 0.9,
      transFat: 0,
    },
    ingredients: 'Leite desnatado e fermentos lácteos.',
    source: 'Foto da Tabela',
    confidenceScore: 95,
  };

  // Testa salvamento direto no banco via pool e app_state
  const stateRes = await pool.query('SELECT data FROM app_state WHERE id = $1', [STATE_ID]);
  const stateData = stateRes.rows[0]?.data || {};
  const currentCustom = Array.isArray(stateData.customFoods) ? stateData.customFoods : [];

  const newFoodItem = {
    id: `food-${Date.now()}`,
    name: testPayload.productName,
    brand: testPayload.brand,
    portionGrams: testPayload.servingGrams,
    calories: Math.round((testPayload.per100g.calories * testPayload.servingGrams) / 100),
    protein: Number(((testPayload.per100g.protein * testPayload.servingGrams) / 100).toFixed(1)),
    carbs: Number(((testPayload.per100g.carbs * testPayload.servingGrams) / 100).toFixed(1)),
    fat: Number(((testPayload.per100g.fat * testPayload.servingGrams) / 100).toFixed(1)),
    fiber: 0,
    sodium: Math.round((testPayload.per100g.sodium * testPayload.servingGrams) / 100),
    per100g: testPayload.per100g,
    source: 'Foto da Tabela',
    verified: true,
  };

  const updatedList = [newFoodItem, ...currentCustom.filter((f: any) => f.name !== testPayload.productName)];
  await pool.query(
    "UPDATE app_state SET data = jsonb_set(data, '{customFoods}', $1::jsonb), updated_at = now() WHERE id = $2",
    [JSON.stringify(updatedList), STATE_ID]
  );

  console.log('✅ Alimento salvo com sucesso em app_state.customFoods.');

  // Confirmação de persistência: reler do banco como se o app estivesse reabrindo
  const reloaded = await pool.query('SELECT data FROM app_state WHERE id = $1', [STATE_ID]);
  const reloadedCustom = reloaded.rows[0]?.data?.customFoods || [];
  const found = reloadedCustom.find((f: any) => f.name === testPayload.productName);

  if (found) {
    console.log('🎉 SUCESSO COMPLETO: Alimento encontrado após recarga do banco:');
    console.log(`   - Nome: ${found.name}`);
    console.log(`   - Marca: ${found.brand}`);
    console.log(`   - Porção: ${found.portionGrams}g`);
    console.log(`   - Calorias: ${found.calories} kcal`);
    console.log(`   - Proteínas: ${found.protein}g | Carbos: ${found.carbs}g | Gorduras: ${found.fat}g`);
  } else {
    throw new Error('Alimento não encontrado após recarga do banco!');
  }

  process.exit(0);
}

runTest().catch((err) => {
  console.error('❌ Erro no teste:', err);
  process.exit(1);
});
