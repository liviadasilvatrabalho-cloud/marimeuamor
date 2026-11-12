import '../env';
import { pool } from '../db';

/**
 * Testes de integração do Our Little Kitchen.
 *
 * Executam contra o servidor Express em execução (npm run dev) usando o
 * header X-Profile-ID (permitido fora de produção). Também criam um espaço e
 * um perfil isolados diretamente no Postgres para validar isolamento de espaço
 * e login por PIN, removendo tudo ao final.
 *
 * Uso: npm run test:db
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const LIVIA = '22222222-2222-2222-2222-222222222222';
const MARIANA = '33333333-3333-3333-3333-333333333333';
const RUN = `TESTE-${Date.now()}`;
const SLUG = `teste-isolado-${Date.now()}`;

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: any) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    const msg = `${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`;
    failures.push(msg);
    console.log(`  ❌ ${msg}`);
  }
}

function approx(actual: any, expected: number, tolerance = 0.01) {
  const value = Number(actual);
  return Number.isFinite(value) && Math.abs(value - expected) <= tolerance;
}

type ApiOptions = {
  profile?: string | null;
  cookie?: string | null;
  body?: any;
  raw?: boolean;
};

async function api(
  method: string,
  path: string,
  options: ApiOptions = {}
): Promise<{ status: number; body: any; headers: Headers; cookie: string | null }> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.profile) headers['X-Profile-ID'] = options.profile;
  if (options.cookie) headers['Cookie'] = options.cookie;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    redirect: 'manual',
  });

  const setCookie = res.headers.get('set-cookie') || '';
  const match = setCookie.match(/olk_session=([^;]+)/);
  const cookie = match ? `olk_session=${match[1]}` : null;

  let body: any = null;
  if (options.raw) {
    body = Buffer.from(await res.arrayBuffer());
  } else {
    body = await res.json().catch(() => null);
  }
  return { status: res.status, body, headers: res.headers, cookie };
}

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return;
    } catch {
      // servidor ainda subindo
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Servidor não respondeu em ${BASE_URL}. Rode "npm run dev" antes dos testes.`);
}

/**
 * Remove dados de execuções anteriores (prefixo TESTE-) para manter o banco
 * limpo mesmo se uma execução anterior falhar antes da limpeza final.
 * Nunca toca nos dados reais de Lívia/Mariana.
 */
async function cleanupTestData() {
  const like = 'TESTE-%';
  await pool!.query(`DELETE FROM orders WHERE description LIKE $1`, [like]);
  await pool!.query(`DELETE FROM shopping_lists WHERE name LIKE $1`, [like]);
  await pool!.query(`DELETE FROM meals WHERE title LIKE $1`, [like]);
  await pool!.query(`DELETE FROM marmitas WHERE name LIKE $1`, [like]);
  await pool!.query(`DELETE FROM recipes WHERE title LIKE $1`, [like]);
  await pool!.query(`DELETE FROM image_analyses WHERE original_photo_path LIKE 'teste-%' OR original_photo_path LIKE '/api/files/teste-%'`);
  await pool!.query(`DELETE FROM storage_files WHERE file_name LIKE $1`, [like]);
  await pool!.query(`DELETE FROM foods WHERE name LIKE $1`, [like]);
  await pool!.query(`DELETE FROM products WHERE commercial_name LIKE $1`, [like]);

  const oldProfiles = await pool!.query<{ id: string }>(
    `SELECT id FROM profiles WHERE email LIKE 'teste-%@ourlittlekitchen.app'`
  );
  for (const row of oldProfiles.rows) {
    await pool!.query(`DELETE FROM memberships WHERE profile_id = $1`, [row.id]);
    await pool!.query(`DELETE FROM profiles WHERE id = $1`, [row.id]);
  }
  await pool!.query(`DELETE FROM kitchen_spaces WHERE slug LIKE 'teste-isolado-%'`);
}

async function main() {
  await waitForServer();
  await cleanupTestData();
  console.log(`\n🧪 Our Little Kitchen — testes de integração (${BASE_URL})\n`);

  /* ------------------------------------------------------------------ */
  console.log('Saúde e autenticação');
  /* ------------------------------------------------------------------ */
  const health = await api('GET', '/api/health');
  check('GET /api/health responde 200', health.status === 200, health.body);
  check('Banco conectado no health', health.body?.database?.connected === true, health.body?.database);

  const noAuth = await api('GET', '/api/foods');
  check('Sem identidade retorna 401', noAuth.status === 401, noAuth.body);

  const storageNoAuth = await api('GET', '/api/storage');
  check('Documento compartilhado não é exposto sem sessão (401)', storageNoAuth.status === 401, storageNoAuth.body);

  const profiles = await api('GET', '/api/auth/profiles');
  check('GET /api/auth/profiles lista Lívia e Mariana', profiles.status === 200 && profiles.body.length >= 2, profiles.body);
  check(
    'Lívia é admin e Mariana é user',
    profiles.body.some((p: any) => p.id === LIVIA && p.role === 'admin') &&
      profiles.body.some((p: any) => p.id === MARIANA && p.role === 'user'),
    profiles.body
  );

  const meLivia = await api('GET', '/api/me', { profile: LIVIA });
  check('GET /api/me retorna o perfil de Lívia', meLivia.status === 200 && meLivia.body.name === 'Lívia', meLivia.body);

  /* ------------------------------------------------------------------ */
  console.log('\nAlimento manual, duplicidade, edição e exclusão lógica');
  /* ------------------------------------------------------------------ */
  const foodName = `${RUN} Arroz integral`;
  const foodPayload = {
    name: foodName,
    category: 'Grãos',
    data_origin: 'Cadastro manual de teste',
    prep_state: 'cozido',
    brand: 'Marca Teste',
    calories_per_100g: 124,
    protein_per_100g: 2.6,
    carbs_per_100g: 25.8,
    fat_total_per_100g: 1.0,
    fiber_per_100g: 2.7,
    sodium_per_100g: 1,
    nutrition_source: 'Manual',
    verification_status: 'pending',
  };

  const createdFood = await api('POST', '/api/foods', { profile: MARIANA, body: foodPayload });
  check('Mariana cadastra alimento manual (201)', createdFood.status === 201, createdFood.body);
  const foodId = createdFood.body?.id;
  check('Alimento recebe UUID', typeof foodId === 'string' && foodId.length === 36, foodId);

  const duplicate = await api('POST', '/api/foods', { profile: MARIANA, body: foodPayload });
  check('Duplicidade é bloqueada (409)', duplicate.status === 409, duplicate.body);

  const search = await api('GET', `/api/foods?search=${encodeURIComponent(RUN)}`, { profile: LIVIA });
  check(
    'Alimento fica visível para Lívia no mesmo espaço',
    search.status === 200 && search.body.some((f: any) => f.id === foodId),
    search.body?.length
  );

  const edited = await api('PUT', `/api/foods/${foodId}`, {
    profile: MARIANA,
    body: { calories_per_100g: 130, description: 'Editado no teste' },
  });
  check('Mariana edita o próprio alimento', edited.status === 200 && approx(edited.body.calories_per_100g, 130), edited.body);

  const forbiddenEdit = await api('PUT', `/api/foods/${foodId}`, {
    profile: LIVIA,
    body: { name: foodName },
  });
  check('Admin também pode editar alimento de membro', forbiddenEdit.status === 200, forbiddenEdit.body);

  const forbiddenDelete = await api('DELETE', `/api/foods/${foodId}`, { profile: MARIANA });
  check('Mariana não exclui alimento (403)', forbiddenDelete.status === 403, forbiddenDelete.body);

  const deleted = await api('DELETE', `/api/foods/${foodId}`, { profile: LIVIA });
  check('Lívia exclui logicamente (200)', deleted.status === 200 && deleted.body.success === true, deleted.body);

  const afterDelete = await api('GET', `/api/foods?search=${encodeURIComponent(RUN)}`, { profile: LIVIA });
  check('Excluído não aparece na listagem padrão', !afterDelete.body.some((f: any) => f.id === foodId), afterDelete.body?.length);

  const withDeleted = await api('GET', `/api/foods?search=${encodeURIComponent(RUN)}&include_deleted=true`, {
    profile: LIVIA,
  });
  check(
    'Excluído aparece com include_deleted=true e mantém deleted_at',
    withDeleted.body.some((f: any) => f.id === foodId && f.deleted_at),
    withDeleted.body?.length
  );

  const restored = await api('POST', `/api/foods/${foodId}/restore`, { profile: LIVIA });
  check('Lívia restaura o alimento', restored.status === 200 && restored.body.deleted_at === null, restored.body);

  /* ------------------------------------------------------------------ */
  console.log('\nCálculo nutricional');
  /* ------------------------------------------------------------------ */
  const calc = await api(
    'GET',
    '/api/calc/food-portion?grams=150&kcal100=100&protein100=10&carbs100=20&fat100=5&fiber100=2',
    { profile: MARIANA }
  );
  check('150 g de 100 kcal/100g = 150 kcal', calc.status === 200 && approx(calc.body.calories, 150), calc.body);
  check('Proteína proporcional = 15 g', approx(calc.body.protein, 15), calc.body);
  check('Fórmula mantém proporção (ratio 1.5)', approx(calc.body.ratio, 1.5), calc.body);

  const calcNull = await api('GET', '/api/calc/food-portion?grams=100&kcal100=', { profile: MARIANA });
  check('Nutriente ausente retorna null (não zero)', calcNull.status === 200 && calcNull.body.calories === null, calcNull.body);

  /* ------------------------------------------------------------------ */
  console.log('\nProduto por código de barras');
  /* ------------------------------------------------------------------ */
  const barcode = `789${String(Date.now()).slice(-10)}`;
  const productPayload = {
    barcode,
    commercial_name: `${RUN} Iogurte Natural`,
    brand: 'Marca Teste',
    data_source: 'Manual',
    serving_quantity: 170,
    serving_unit: 'g',
    calories_per_100: 61,
    protein_per_100: 3.5,
    carbs_per_100: 4.7,
    fat_per_100: 3.3,
    fiber_per_100: 0,
    sodium_per_100: 45,
  };

  const invalidBarcode = await api('POST', '/api/products', {
    profile: MARIANA,
    body: { ...productPayload, barcode: '123' },
  });
  check('Código de barras inválido é rejeitado (400)', invalidBarcode.status === 400, invalidBarcode.body);

  const createdProduct = await api('POST', '/api/products', { profile: MARIANA, body: productPayload });
  check('Produto é salvo (201)', createdProduct.status === 201, createdProduct.body);
  const productId = createdProduct.body?.id;

  const duplicateProduct = await api('POST', '/api/products', { profile: MARIANA, body: productPayload });
  check('Código de barras duplicado é bloqueado (409)', duplicateProduct.status === 409, duplicateProduct.body);

  const localLookup = await api('GET', `/api/products/lookup/${barcode}`, { profile: LIVIA });
  check(
    'Consulta encontra primeiro no banco local',
    localLookup.status === 200 && localLookup.body.local === true && localLookup.body.product?.id === productId,
    localLookup.body
  );

  const historyBefore = await api('GET', `/api/products/${productId}/history`, { profile: LIVIA });
  await api('PUT', `/api/products/${productId}`, {
    profile: LIVIA,
    body: { calories_per_100: 70, protein_per_100: 4.0 },
  });
  const historyAfter = await api('GET', `/api/products/${productId}/history`, { profile: LIVIA });
  check(
    'Alteração nutricional gera histórico',
    historyAfter.status === 200 && historyAfter.body.length > historyBefore.body.length,
    historyAfter.body
  );

  /* ------------------------------------------------------------------ */
  console.log('\nReceitas, porções e ingredientes');
  /* ------------------------------------------------------------------ */
  const recipe = await api('POST', '/api/recipes', {
    profile: MARIANA,
    body: {
      title: `${RUN} Receita de arroz`,
      description: 'Receita criada pelo teste',
      servings: 2,
      prep_time_minutes: 20,
      ingredients: [{ food_id: foodId, weight_grams: 200, unit: 'g' }],
    },
  });
  check('Mariana cria receita (201)', recipe.status === 201, recipe.body);
  const recipeId = recipe.body?.id;

  const recipeDetail = await api('GET', `/api/recipes/${recipeId}`, { profile: LIVIA });
  check('Receita retorna ingredientes', recipeDetail.status === 200 && recipeDetail.body.ingredients?.length === 1, recipeDetail.body);

  // 200 g a 130 kcal/100g = 260 kcal na receita inteira; 2 porções = 130 por porção.
  check(
    'Total por porção é dividido pelas porções (130 kcal)',
    approx(recipeDetail.body.calories_per_serving, 130),
    recipeDetail.body.calories_per_serving
  );

  const approveForbidden = await api('POST', `/api/recipes/${recipeId}/approve`, { profile: MARIANA });
  check('Usuária não aprova receita (403)', approveForbidden.status === 403, approveForbidden.body);
  const approved = await api('POST', `/api/recipes/${recipeId}/approve`, { profile: LIVIA });
  check('Admin aprova receita', approved.status === 200 && approved.body.status === 'aprovada', approved.body);

  /* ------------------------------------------------------------------ */
  console.log('\nMarmitas e snapshot nutricional congelado');
  /* ------------------------------------------------------------------ */
  const marmita = await api('POST', '/api/marmitas', {
    profile: MARIANA,
    body: {
      name: `${RUN} Marmita de arroz`,
      description: 'Marmita criada pelo teste',
      status: 'preparada',
      items: [{ food_id: foodId, weight_grams: 250 }],
    },
  });
  check('Marmita é criada (201)', marmita.status === 201, marmita.body);
  const marmitaId = marmita.body?.id;
  check('Total da marmita = 325 kcal (250 g × 130/100)', approx(marmita.body.total_calories, 325), marmita.body);

  await api('PUT', `/api/foods/${foodId}`, {
    profile: LIVIA,
    body: { calories_per_100g: 999 },
  });
  const marmitaAfter = await api('GET', `/api/marmitas/${marmitaId}`, { profile: LIVIA });
  check(
    'Snapshot da marmita não muda ao editar o alimento',
    approx(marmitaAfter.body.total_calories, 325),
    marmitaAfter.body.total_calories
  );
  // Restaura o valor do alimento para os próximos testes.
  await api('PUT', `/api/foods/${foodId}`, { profile: LIVIA, body: { calories_per_100g: 130 } });

  /* ------------------------------------------------------------------ */
  console.log('\nRefeições e métodos de identificação');
  /* ------------------------------------------------------------------ */
  const meal = await api('POST', '/api/meals', {
    profile: MARIANA,
    body: {
      meal_date: new Date().toISOString().slice(0, 10),
      meal_type: 'almoco',
      title: `${RUN} Almoço`,
      identification_method: 'manual',
      items: [{ food_id: foodId, weight_grams: 150 }],
    },
  });
  check('Refeição manual é criada (201)', meal.status === 201, meal.body);
  check('Total da refeição = 195 kcal', approx(meal.body.total_calories, 195), meal.body);

  const invalidMeal = await api('POST', '/api/meals', {
    profile: MARIANA,
    body: { meal_date: '2026-01-01', meal_type: 'almoco' },
  });
  check('Refeição sem método de identificação é rejeitada (400)', invalidMeal.status === 400, invalidMeal.body);

  /* ------------------------------------------------------------------ */
  console.log('\nPedidos, transições e histórico de status');
  /* ------------------------------------------------------------------ */
  const order = await api('POST', '/api/orders', {
    profile: MARIANA,
    body: { description: `${RUN} Pedido de jantar`, desired_ingredients: 'Arroz e frango' },
  });
  check('Mariana cria pedido (201)', order.status === 201, order.body);
  const orderId = order.body?.id;

  const invalidTransition = await api('PUT', `/api/orders/${orderId}/status`, {
    profile: MARIANA,
    body: { status: 'concluida' },
  });
  check('Transição pendente → concluída é inválida (422)', invalidTransition.status === 422, invalidTransition.body);

  const preparing = await api('PUT', `/api/orders/${orderId}/status`, {
    profile: MARIANA,
    body: { status: 'em_preparacao' },
  });
  check('Mariana move pedido para em_preparacao', preparing.status === 200 && preparing.body.status === 'em_preparacao', preparing.body);

  const done = await api('PUT', `/api/orders/${orderId}/status`, {
    profile: LIVIA,
    body: { status: 'concluida' },
  });
  check('Lívia conclui o pedido', done.status === 200 && done.body.status === 'concluida', done.body);

  const orderHistory = await api('GET', `/api/orders/${orderId}/history`, { profile: LIVIA });
  check(
    'Histórico registra criação e mudanças de status',
    orderHistory.status === 200 && orderHistory.body.length >= 3,
    orderHistory.body?.length
  );

  /* ------------------------------------------------------------------ */
  console.log('\nLista de compras');
  /* ------------------------------------------------------------------ */
  const list = await api('POST', '/api/shopping-lists', {
    profile: MARIANA,
    body: { name: `${RUN} Compras da semana`, week_start_date: '2026-11-09' },
  });
  check('Lista de compras é criada', list.status === 201, list.body);
  const listId = list.body?.id;

  const item = await api('POST', `/api/shopping-lists/${listId}/items`, {
    profile: MARIANA,
    body: { food_id: foodId, quantity: 1, unit: 'kg' },
  });
  check('Item é adicionado à lista', item.status === 201, item.body);
  const itemId = item.body?.id;

  const purchased = await api('PATCH', `/api/shopping-lists/items/${itemId}/purchase`, {
    profile: MARIANA,
    body: { is_purchased: true },
  });
  check('Item pode ser marcado como comprado', purchased.status === 200 && purchased.body.is_purchased === true, purchased.body);

  const listDetail = await api('GET', `/api/shopping-lists/${listId}`, { profile: LIVIA });
  check('Lista compartilhada mostra o item para Lívia', listDetail.body?.items?.length === 1, listDetail.body);

  /* ------------------------------------------------------------------ */
  console.log('\nAnálise de imagem (original vs. corrigido)');
  /* ------------------------------------------------------------------ */
  const analysis = await api('POST', '/api/image-analyses', {
    profile: MARIANA,
    body: {
      original_photo_path: '/api/files/teste-original',
      identified_ingredients: [{ name: 'Arroz', confidence: 0.8 }],
      estimated_nutrition: { calories: 200 },
      confidence_level: 70,
      ai_model: 'teste',
      status: 'pendente',
    },
  });
  check('Análise de imagem é registrada', analysis.status === 201, analysis.body);
  const analysisId = analysis.body?.id;

  const corrected = await api('PUT', `/api/image-analyses/${analysisId}`, {
    profile: MARIANA,
    body: {
      status: 'corrigido',
      user_corrections: { calories: 180 },
      final_result: { calories: 180, items: ['Arroz'] },
    },
  });
  check(
    'Correção preserva resultado original e grava resultado final',
    corrected.status === 200 &&
      corrected.body.estimated_nutrition?.calories === 200 &&
      corrected.body.final_result?.calories === 180,
    corrected.body
  );

  /* ------------------------------------------------------------------ */
  console.log('\nUpload de imagem e leitura privada');
  /* ------------------------------------------------------------------ */
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
  const upload = await api('POST', '/api/uploads', {
    profile: MARIANA,
    body: {
      bucket: 'meal-photos',
      file_name: `${RUN} pixel.png`,
      mime_type: 'image/png',
      data_base64: png,
    },
  });
  check('Upload grava arquivo e metadados', upload.status === 201 && upload.body.path?.startsWith('/api/files/'), upload.body);
  const fileId = upload.body?.id;

  const fileRes = await api('GET', `/api/files/${fileId}`, { profile: LIVIA, raw: true });
  check(
    'Arquivo é servido como imagem autenticada',
    fileRes.status === 200 && fileRes.headers.get('content-type') === 'image/png',
    { status: fileRes.status, type: fileRes.headers.get('content-type') }
  );

  const fileNoAuth = await api('GET', `/api/files/${fileId}`, { raw: true });
  check('Arquivo não é acessível sem sessão (401)', fileNoAuth.status === 401, fileNoAuth.status);

  const fileDelete = await api('DELETE', `/api/files/${fileId}`, { profile: MARIANA });
  check('Dono remove o próprio arquivo', fileDelete.status === 200, fileDelete.body);

  /* ------------------------------------------------------------------ */
  console.log('\nSincronização entre perfis');
  /* ------------------------------------------------------------------ */
  const syncStatus = await api('GET', '/api/sync/status', { profile: LIVIA });
  check('Status de sync responde', syncStatus.status === 200 && syncStatus.body.ok === true, syncStatus.body);
  check(
    'Contadores refletem os registros criados',
    syncStatus.body.counts.foods >= 1 &&
      syncStatus.body.counts.recipes >= 1 &&
      syncStatus.body.counts.marmitas >= 1 &&
      syncStatus.body.counts.meals >= 1,
    syncStatus.body.counts
  );
  check('Eventos de sync foram emitidos', syncStatus.body.lastEventId > 0, syncStatus.body.lastEventId);

  const syncEvents = await api('GET', '/api/sync/events?after=0', { profile: MARIANA });
  check(
    'Mariana recebe os eventos do espaço compartilhado',
    syncEvents.status === 200 && syncEvents.body.events.length > 0,
    syncEvents.body?.events?.length
  );

  const storageRoundTrip = await api('GET', '/api/storage', { profile: LIVIA });
  check('GET /api/storage retorna o documento persistido', storageRoundTrip.status === 200 && !!storageRoundTrip.body?.user, {
    status: storageRoundTrip.status,
  });
  if (storageRoundTrip.status === 200 && storageRoundTrip.body?.user) {
    const saveBack = await api('POST', '/api/storage', { profile: LIVIA, body: storageRoundTrip.body });
    check('POST /api/storage salva e normaliza sem erro', saveBack.status === 200 && saveBack.body.success === true, saveBack.body);
  }

  /* ------------------------------------------------------------------ */
  console.log('\nPermissões administrativas');
  /* ------------------------------------------------------------------ */
  const roleForbidden = await api('PATCH', `/api/profiles/${MARIANA}`, {
    profile: MARIANA,
    body: { role: 'admin' },
  });
  check('Usuária não altera o próprio papel (403)', roleForbidden.status === 403, roleForbidden.body);

  const marianaProfile = await api('GET', '/api/profiles', { profile: LIVIA });
  const marianaRow = marianaProfile.body.find((p: any) => p.id === MARIANA);
  const originalDiet = marianaRow?.diet_preference ?? 'Equilibrada';
  const adminEdit = await api('PATCH', `/api/profiles/${MARIANA}`, {
    profile: LIVIA,
    body: { diet_preference: `${originalDiet} (teste)` },
  });
  check('Admin edita perfil de membro do espaço', adminEdit.status === 200, adminEdit.body);
  await api('PATCH', `/api/profiles/${MARIANA}`, { profile: LIVIA, body: { diet_preference: originalDiet } });

  /* ------------------------------------------------------------------ */
  console.log('\nIsolamento de espaço e login por PIN');
  /* ------------------------------------------------------------------ */
  const tempSpace = await pool!.query(
    `INSERT INTO kitchen_spaces (name, slug) VALUES ($1,$2) RETURNING id`,
    [`Espaço ${RUN}`, SLUG]
  );
  const tempSpaceId = tempSpace.rows[0].id;
  const tempProfile = await pool!.query(
    `INSERT INTO profiles (name, email, role) VALUES ($1,$2,'user') RETURNING id`,
    [`Perfil ${RUN}`, `teste-${Date.now()}@ourlittlekitchen.app`]
  );
  const tempProfileId = tempProfile.rows[0].id;
  await pool!.query(`INSERT INTO memberships (kitchen_space_id, profile_id, role_in_space) VALUES ($1,$2,'admin')`, [
    tempSpaceId,
    tempProfileId,
  ]);

  const outsiderList = await api('GET', `/api/foods?search=${encodeURIComponent(RUN)}`, { profile: tempProfileId });
  check('Perfil de outro espaço não vê alimentos alheios', outsiderList.status === 200 && outsiderList.body.length === 0, outsiderList.body);

  const outsiderGet = await api('GET', `/api/foods/${foodId}`, { profile: tempProfileId });
  check('Perfil de outro espaço recebe 404 ao acessar alimento alheio', outsiderGet.status === 404, outsiderGet.body);

  const outsiderCreate = await api('POST', '/api/foods', {
    profile: tempProfileId,
    body: { ...foodPayload, name: `${RUN} Alimento isolado` },
  });
  check('Perfil isolado cria alimento no próprio espaço', outsiderCreate.status === 201, outsiderCreate.body);
  const isolatedFoodId = outsiderCreate.body?.id;

  const liviaSeesIsolated = await api('GET', `/api/foods/${isolatedFoodId}`, { profile: LIVIA });
  check('Lívia não vê alimento do espaço isolado', liviaSeesIsolated.status === 404, liviaSeesIsolated.body);

  const isolationUpload = await api('POST', '/api/uploads', {
    profile: MARIANA,
    body: {
      bucket: 'meal-photos',
      file_name: `${RUN} isolado.png`,
      mime_type: 'image/png',
      data_base64: png,
    },
  });
  const crossSpaceFile = await api('GET', `/api/files/${isolationUpload.body?.id}`, {
    profile: tempProfileId,
    raw: true,
  });
  check('Arquivo de outro espaço não é acessível (404)', crossSpaceFile.status === 404, crossSpaceFile.status);
  await api('DELETE', `/api/files/${isolationUpload.body?.id}`, { profile: MARIANA });

  const pinLogin = await api('POST', '/api/auth/login', {
    body: { profile_id: tempProfileId, pin: '4321' },
  });
  check('Primeiro login define o PIN e abre sessão', pinLogin.status === 200 && !!pinLogin.cookie, pinLogin.body);

  const sessionMe = await api('GET', '/api/auth/me', { cookie: pinLogin.cookie });
  check('Cookie de sessão identifica o perfil', sessionMe.status === 200 && sessionMe.body.profile?.id === tempProfileId, sessionMe.body);

  const wrongPin = await api('POST', '/api/auth/login', {
    body: { profile_id: tempProfileId, pin: '0000' },
  });
  check('PIN incorreto é rejeitado (401)', wrongPin.status === 401, wrongPin.body);

  const changedPin = await api('POST', '/api/auth/change-pin', {
    cookie: pinLogin.cookie,
    body: { current_pin: '4321', new_pin: '8765' },
  });
  check('PIN pode ser trocado com a sessão ativa', changedPin.status === 200, changedPin.body);

  const oldPin = await api('POST', '/api/auth/login', { body: { profile_id: tempProfileId, pin: '4321' } });
  check('PIN antigo deixa de funcionar', oldPin.status === 401, oldPin.body);
  const newPin = await api('POST', '/api/auth/login', { body: { profile_id: tempProfileId, pin: '8765' } });
  check('PIN novo funciona', newPin.status === 200 && !!newPin.cookie, newPin.body);

  const logout = await api('POST', '/api/auth/logout', { cookie: newPin.cookie });
  check('Logout revoga a sessão', logout.status === 200, logout.body);
  const afterLogout = await api('GET', '/api/auth/me', { cookie: newPin.cookie });
  check('Sessão revogada não autentica mais', afterLogout.status === 401, afterLogout.status);

  /* ------------------------------------------------------------------ */
  console.log('\nRLS como papel não-proprietário');
  /* ------------------------------------------------------------------ */
  // O servidor usa o papel dono do banco (bypassa RLS). Para provar que as
  // políticas funcionam, executamos como um papel sem privilégios de dono.
  const rlsRole = `olk_rls_${Date.now()}`;
  const ownerRow = await pool!.query<{ u: string }>('SELECT current_user AS u');
  const owner = ownerRow.rows[0].u;
  const quoteIdent = (value: string) => `"${value.replace(/"/g, '""')}"`;

  await pool!.query(`CREATE ROLE ${quoteIdent(rlsRole)} NOLOGIN`);
  await pool!.query(`GRANT ${quoteIdent(rlsRole)} TO ${quoteIdent(owner)}`);
  await pool!.query(`GRANT USAGE ON SCHEMA public TO ${quoteIdent(rlsRole)}`);
  await pool!.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${quoteIdent(rlsRole)}`);
  await pool!.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${quoteIdent(rlsRole)}`);
  await pool!.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ${quoteIdent(rlsRole)}`);

  const rlsClient = await pool!.connect();
  try {
    await rlsClient.query('BEGIN');
    await rlsClient.query(`SET LOCAL ROLE ${quoteIdent(rlsRole)}`);
    await rlsClient.query(`SELECT set_config('app.current_profile_id', $1, true)`, [LIVIA]);
    const rlsFoods = await rlsClient.query(`SELECT count(*)::int AS c FROM foods`);
    check('RLS permite leitura dos alimentos do próprio espaço', rlsFoods.rows[0].c >= 1, rlsFoods.rows[0]);

    const rlsOtherSpace = await rlsClient.query(
      `SELECT count(*)::int AS c FROM foods WHERE kitchen_space_id = $1`,
      [tempSpaceId]
    );
    check('RLS esconde alimentos de outro espaço', rlsOtherSpace.rows[0].c === 0, rlsOtherSpace.rows[0]);

    await rlsClient.query(`SELECT set_config('app.current_profile_id', $1, true)`, [tempProfileId]);
    const rlsOwnSpace = await rlsClient.query(
      `SELECT count(*)::int AS c FROM foods WHERE kitchen_space_id = $1`,
      [tempSpaceId]
    );
    check('RLS mostra dados ao membro do espaço isolado', rlsOwnSpace.rows[0].c >= 1, rlsOwnSpace.rows[0]);

    await rlsClient.query('ROLLBACK');
  } finally {
    rlsClient.release();
  }
  await pool!.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${quoteIdent(rlsRole)}`);
  await pool!.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${quoteIdent(rlsRole)}`);
  await pool!.query(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM ${quoteIdent(rlsRole)}`);
  await pool!.query(`REVOKE USAGE ON SCHEMA public FROM ${quoteIdent(rlsRole)}`);
  await pool!.query(`REVOKE ${quoteIdent(rlsRole)} FROM ${quoteIdent(owner)}`);
  await pool!.query(`DROP ROLE ${quoteIdent(rlsRole)}`);

  /* ------------------------------------------------------------------ */
  console.log('\nLimpeza');
  /* ------------------------------------------------------------------ */
  await pool!.query(`DELETE FROM memberships WHERE profile_id = $1`, [tempProfileId]);
  await pool!.query(`DELETE FROM profiles WHERE id = $1`, [tempProfileId]);
  await pool!.query(`DELETE FROM kitchen_spaces WHERE id = $1`, [tempSpaceId]);
  await cleanupTestData();
  check('Limpeza dos dados de teste concluída', true);

  /* ------------------------------------------------------------------ */
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Resultado: ${passed} passaram, ${failed} falharam.`);
  if (failures.length) {
    console.log('\nFalhas:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log(`${'─'.repeat(60)}\n`);

  await pool?.end();
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error('\n💥 Erro fatal nos testes:', err);
  try {
    await pool?.end();
  } catch {
    // ignora
  }
  process.exit(1);
});
