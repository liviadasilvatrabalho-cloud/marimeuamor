import { pool, STATE_ID } from '../db';

async function resetDatabase() {
  if (!pool) {
    console.error('DATABASE_URL não configurada!');
    process.exit(1);
  }

  console.log('🧹 Limpando dados do banco de dados Neon Postgres...');

  // 1. Limpar tabelas normalizadas
  try {
    await pool.query('DELETE FROM orders');
    console.log('✓ Pedidos limpos');
  } catch (e: any) {
    console.warn('Erro ao limpar orders:', e.message);
  }

  try {
    await pool.query('DELETE FROM shopping_lists');
    console.log('✓ Lista de compras limpa');
  } catch (e: any) {
    console.warn('Erro ao limpar shopping_lists:', e.message);
  }

  try {
    await pool.query('DELETE FROM meals');
    console.log('✓ Refeições limpas');
  } catch (e: any) {
    console.warn('Erro ao limpar meals:', e.message);
  }

  try {
    await pool.query('DELETE FROM marmitas');
    console.log('✓ Marmitas limpas');
  } catch (e: any) {
    console.warn('Erro ao limpar marmitas:', e.message);
  }

  try {
    await pool.query('DELETE FROM recipes');
    console.log('✓ Receitas limpas');
  } catch (e: any) {
    console.warn('Erro ao limpar recipes:', e.message);
  }

  try {
    await pool.query('DELETE FROM image_analyses');
    console.log('✓ Análises de imagens limpas');
  } catch (e: any) {
    console.warn('Erro ao limpar image_analyses:', e.message);
  }

  try {
    await pool.query('DELETE FROM storage_files');
    console.log('✓ Arquivos de storage limpos');
  } catch (e: any) {
    console.warn('Erro ao limpar storage_files:', e.message);
  }

  try {
    await pool.query('DELETE FROM foods');
    console.log('✓ Alimentos personalizados limpos');
  } catch (e: any) {
    console.warn('Erro ao limpar foods:', e.message);
  }

  try {
    await pool.query('DELETE FROM products');
    console.log('✓ Produtos limpos');
  } catch (e: any) {
    console.warn('Erro ao limpar products:', e.message);
  }

  // 2. Atualizar perfis existentes para ter Mari como perfil principal
  try {
    await pool.query(`
      UPDATE profiles 
      SET name = 'Mari', 
          email = 'mari@mariamore.app',
          calorie_goal = 2000
      WHERE id = '33333333-3333-3333-3333-333333333333'
    `);
    await pool.query(`
      UPDATE profiles 
      SET name = 'Mari', 
          email = 'admin@mariamore.app',
          calorie_goal = 2000
      WHERE id = '22222222-2222-2222-2222-222222222222'
    `);
    console.log('✓ Perfis atualizados para Mari');
  } catch (e: any) {
    console.warn('Erro ao atualizar profiles:', e.message);
  }

  // 3. Montar estado inicial absolutamente limpo e zerado
  const cleanState = {
    user: {
      name: 'Mari',
      email: 'mari@mariamore.app',
      calorieGoal: 2000,
      macros: {
        proteinGrams: 115,
        carbsGrams: 200,
        fatGrams: 50,
      },
      waterGoalMl: 2000,
      waterDrankMl: 0,
      currentWeightKg: 58.0,
      targetWeightKg: 57.0,
      heightCm: 164,
      dietPreference: 'Equilibrada & Saudável',
    },
    todayLogs: [],
    historyLogs: [],
    customFoods: [],
    marmitas: [],
    recipes: [],
    weeklyPlan: {
      segunda: [],
      terca: [],
      quarta: [],
      quinta: [],
      sexta: [],
      sabado: [],
      domingo: [],
    },
    mealSlots: [
      { id: 'cafe', label: 'Café da Manhã', timeHint: '07:00 - 09:30', icon: '☕' },
      { id: 'lanche_manha', label: 'Lanche da Manhã', timeHint: '10:00 - 11:30', icon: '🍌' },
      { id: 'almoco', label: 'Almoço', timeHint: '12:00 - 14:00', icon: '🥗' },
      { id: 'lanche', label: 'Lanche da Tarde', timeHint: '16:00 - 17:30', icon: '🍎' },
      { id: 'jantar', label: 'Jantar', timeHint: '19:30 - 21:00', icon: '🍲' },
      { id: 'ceia', label: 'Ceia', timeHint: '22:00 - 23:00', icon: '🌙' },
    ],
    lastUpdated: new Date().toISOString(),
  };

  // 4. Gravar o estado limpo em app_state
  await pool.query(
    `INSERT INTO app_state (id, data, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (id) DO UPDATE
       SET data = EXCLUDED.data,
           updated_at = EXCLUDED.updated_at`,
    [STATE_ID, JSON.stringify(cleanState)]
  );

  console.log('✓ app_state resetado para estado limpo com Mari e 0 registros');

  // Limpar também storage_documents se existir
  try {
    await pool.query('DELETE FROM storage_documents');
    console.log('✓ storage_documents limpo');
  } catch (e: any) {
    console.warn('storage_documents warning:', e.message);
  }

  console.log('\n🎉 BANCO DE DADOS TOTALMENTE LIMPO E PRONTO PARA PRIMEIRO USO DA MARI!');
  await pool.end();
  process.exit(0);
}

resetDatabase().catch((err) => {
  console.error('Erro fatal ao resetar banco:', err);
  process.exit(1);
});
