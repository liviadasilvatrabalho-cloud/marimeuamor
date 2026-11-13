import './env';
import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import path from 'path';
import {
  initDatabase,
  getAppState,
  saveAppState,
  getDatabaseStatus,
  closeDatabase,
  pool,
} from './db';
import apiRouter from './src/api';
import { syncAppStateToDatabase } from './src/normalize';
import { persistDataUrls } from './src/images';

const app = express();
const PORT = 3000;

// Body parsing with generous limit for high-res food photos
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

// CORS configuration - allow all origins for development, restrict in production
// This is essential for barcode scanner camera access which requires HTTPS
app.use((req, res, next) => {
  const allowedOrigins = [
    'https://marimeuamor-kp3n.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];
  const origin = req.headers.origin;
  
  // Allow specific origins or allow all in development
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // Allow all origins for barcode scanner camera access (requires HTTPS)
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  next();
});

// Initialize Google Gemini SDK on the server side
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_KEY || '';

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Helper universal com fallback automático de modelos Gemini
async function callGemini(params: {
  contents: any;
  systemInstruction?: string;
  responseMimeType?: string;
  temperature?: number;
}) {
  const candidateModels = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-3.8-flash',
  ];

  let lastError: any = null;
  for (const model of candidateModels) {
    try {
      const config: any = {};
      if (params.systemInstruction) config.systemInstruction = params.systemInstruction;
      if (params.responseMimeType) config.responseMimeType = params.responseMimeType;
      if (params.temperature !== undefined) config.temperature = params.temperature;

      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: Object.keys(config).length > 0 ? config : undefined,
      });
      return response;
    } catch (err: any) {
      lastError = err;
      console.warn(`Tentativa com modelo ${model} não respondeu:`, err?.message || err);
    }
  }
  throw lastError;
}

// ---------------- API ROUTES ----------------

// Health check (includes a live Postgres round-trip)
app.get('/api/health', async (req, res) => {
  const database = await getDatabaseStatus();
  res.status(database.connected ? 200 : 503).json({
    status: database.connected ? 'ok' : 'degraded',
    appName: 'Our Little Kitchen',
    user: 'Mari',
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    database,
  });
});

// GET persistent kitchen data (from Neon Postgres)
app.get('/api/storage', async (req, res) => {
  try {
    const profileId = await resolveStorageProfile(req);
    if (!profileId) {
      return res.status(401).json({ error: 'Não autenticado. Faça login para acessar os dados.' });
    }
    const data = await getAppState();
    if (!data) {
      return res.status(404).json({ error: 'Dados não encontrados' });
    }
    return res.json(data);
  } catch (err: any) {
    console.error('Erro ao ler dados do Postgres:', err);
    return res.status(500).json({ error: 'Erro ao carregar dados salvos' });
  }
});

function readCookie(req: any, name: string): string | null {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

async function resolveStorageProfile(req: any): Promise<string | null> {
  const token = readCookie(req, 'olk_session');
  if (token && pool) {
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const { rows } = await pool.query(
      `SELECT profile_id FROM profile_sessions
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [hash]
    );
    if (rows[0]?.profile_id) return rows[0].profile_id;
  }
  const headerId = req.header('X-Profile-ID');
  if (headerId && process.env.NODE_ENV !== 'production' && process.env.ALLOW_PROFILE_HEADER !== 'false') {
    return headerId;
  }
  // Modo usuário único: quando SINGLE_USER_PROFILE_ID está definido, requisições
  // sem sessão são atribuídas a esse perfil (útil para uso pessoal da Mari).
  if (process.env.SINGLE_USER_PROFILE_ID) {
    return process.env.SINGLE_USER_PROFILE_ID;
  }
  return null;
}

// POST save persistent kitchen data (to Neon Postgres)
app.post('/api/storage', async (req, res) => {
  try {
    const data = req.body;
    if (!data) {
      return res.status(400).json({ error: 'Corpo da requisição vazio' });
    }
    const profileId = await resolveStorageProfile(req);
    if (!profileId) {
      return res.status(401).json({ error: 'Não autenticado. Faça login para salvar os dados.' });
    }

    // Imagens nunca ficam no JSONB: data URLs viram arquivos + metadados.
    const persisted = await persistDataUrls(data, profileId);
    const lastUpdated = await saveAppState(persisted.value);

    // Espelha o documento nas tabelas normalizadas (alimentos, receitas,
    // marmitas e refeições). Falhas aqui não desfazem o salvamento principal.
    const normalized = await syncAppStateToDatabase({ ...persisted.value, lastUpdated }, profileId);

    return res.json({
      success: true,
      lastUpdated,
      imagesPersisted: persisted.replaced,
      normalized,
    });
  } catch (err: any) {
    console.error('Erro ao salvar dados no Postgres:', err);
    return res.status(500).json({ error: 'Erro ao gravar dados no servidor' });
  }
});

// POST Gemini Multimodal Food Scanner
app.post('/api/gemini/analyze-meal', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg', notes, mealType } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Imagem não fornecida' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'Chave do Gemini não configurada no servidor (Settings > Secrets)',
      });
    }

    // Clean base64 string
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+]+;base64,/, '');

    const promptText = `
Você é uma nutricionista clínica especializada na Tabela TACO (Tabela Brasileira de Composição de Alimentos) e TBCA da USP.
Analise detalhadamente a refeição na fotografia enviada por Mariana.
Refeição pretendida: ${mealType || 'Refeição'}.
Notas adicionais da usuária: ${notes || 'Nenhuma'}.

Instruções rigorosas:
1. Identifique todos os alimentos visíveis separadamente (ex: separar arroz, feijão, frango grelhado, salada, azeite).
2. Para cada alimento, determine o estado de preparo exato (cru, cozido em água, grelhado, assado, frito, refogado com óleo/azeite, no vapor).
3. Estime a porção em gramas com base em referências visuais de prato/recipiente, volume tridimensional e proporções. NUNCA invente números mirabolantes; seja realista e prudente.
4. Calcule com precisão matemática os valores nutricionais baseados na TACO/TBCA para aquela quantidade em gramas:
   - Calorias (kcal)
   - Proteínas (g)
   - Carboidratos (g)
   - Gorduras totais (g)
   - Fibras (g)
5. Estime o nível de confiança geral (0 a 100).
6. Se houver alguma incerteza (ex: não dá para saber se o feijão tem linguiça ou se o molho leva creme de leite), faça 1 a 2 perguntas curtas e gentis para a Mariana confirmar.

Responda OBRIGATORIAMENTE em formato JSON com o seguinte formato:
{
  "mealName": "Nome descritivo da refeição (ex: Almoço com Frango Grelhado, Arroz e Brócolis)",
  "overallConfidence": 85,
  "confidenceNotes": "Explicação breve da estimativa visual de volume",
  "questionsForMariana": ["Você usou azeite ou manteiga no preparo do frango?"],
  "items": [
    {
      "foodName": "Peito de frango",
      "prepState": "grelhado",
      "portionGrams": 130,
      "calories": 207,
      "protein": 41.6,
      "carbs": 0,
      "fat": 3.9,
      "fiber": 0,
      "source": "TACO",
      "reasoning": "Filé médio de aproximadamente 130g grelhado sem pele"
    }
  ],
  "totals": {
    "totalGrams": 420,
    "calories": 485,
    "protein": 48.2,
    "carbs": 52.0,
    "fat": 8.5,
    "fiber": 7.2
  }
}
`;

    const response = await callGemini({
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: cleanBase64,
            },
          },
          { text: promptText },
        ],
      },
      responseMimeType: 'application/json',
    });

    const responseText = response.text || '{}';
    const parsed = JSON.parse(responseText);

    return res.json(parsed);
  } catch (err: any) {
    console.error('Erro no reconhecimento alimentar Gemini:', err);
    return res.status(500).json({
      error: 'Não foi possível analisar a fotografia da refeição: ' + (err.message || 'Erro interno'),
    });
  }
});

// POST Gemini OCR Nutrition Facts Label
app.post('/api/gemini/ocr-label', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Imagem do rótulo não fornecida' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'Chave do Gemini não configurada no servidor',
      });
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+]+;base64,/, '');

    const promptText = `
Você é um especialista em rotulagem de alimentos pela ANVISA (Brasil).
Analise a fotografia do rótulo / tabela nutricional enviado por Mariana.
Extraia com exatidão as informações presentes no rótulo. NUNCA invente dados. Se algum item não constar na tabela, retorne 0 ou string vazia.

Retorne estritamente em formato JSON:
{
  "productName": "Nome do produto",
  "brand": "Marca do fabricante",
  "servingSize": "ex: 30g (2 biscoitos) ou 200ml (1 copo)",
  "servingGrams": 30,
  "calories": 140,
  "protein": 2.5,
  "carbs": 21.0,
  "fat": 5.2,
  "saturatedFat": 2.1,
  "fiber": 1.4,
  "sodium": 85,
  "ingredientsList": "Ingredientes: farinha de trigo enriquecida...",
  "notes": "Informações relevantes ou alertas de alérgenos"
}
`;

    const response = await callGemini({
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: cleanBase64,
            },
          },
          { text: promptText },
        ],
      },
      responseMimeType: 'application/json',
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (err: any) {
    console.error('Erro no OCR de rótulo:', err);
    return res.status(500).json({
      error: 'Não foi possível ler o rótulo nutricional: ' + (err.message || 'Erro interno'),
    });
  }
});

// POST Gemini Recipe & Substitution Assistant
app.post('/api/gemini/recipe-assistant', async (req, res) => {
  try {
    const { action, ingredients, recipeName, question } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'Chave do Gemini não configurada',
      });
    }

    let prompt = '';
    if (action === 'substitute') {
      prompt = `
Mariana está cozinhando e precisa de uma substituição saudável e carinhosa para a receita: "${recipeName || 'Receita da Mari'}".
Dúvida / Alimento a substituir: "${question || ingredients}".
Sugira 3 substituições viáveis, explicando o impacto em calorias e macronutrientes (proteínas, carboidratos, gorduras), e como adaptar o modo de preparo.
Responda em formato JSON:
{
  "suggestions": [
    {
      "substituteName": "Iogurte grego natural desnatado em vez de creme de leite",
      "macroImpact": "Reduz 70% das gorduras e aumenta proteínas em 6g por porção",
      "culinaryTip": "Adicionar no final do cozimento em fogo brando para não talhar",
      "caloriesDelta": "-120 kcal"
    }
  ]
}
`;
    } else {
      prompt = `
Mariana tem os seguintes ingredientes na cozinha: "${ingredients}".
Crie 1 receita saudável, deliciosa e prática para ela ("Our Little Kitchen").
Calcule com precisão calorias e macronutrientes por porção.
Responda em formato JSON:
{
  "title": "Nome da Receita",
  "description": "Breve descrição afetuosa",
  "prepTimeMinutes": 25,
  "servings": 2,
  "caloriesPerServing": 320,
  "proteinPerServing": 28,
  "carbsPerServing": 35,
  "fatPerServing": 6,
  "fiberPerServing": 5,
  "ingredients": [
    { "name": "Peito de frango picado", "amount": "250g" },
    { "name": "Abobrinha ralada", "amount": "1 unidade média (150g)" }
  ],
  "steps": [
    "Aqueça uma frigideira antiaderente com um fio de azeite...",
    "Doure o frango e adicione os temperos..."
  ],
  "carinhoTip": "Dica especial de tempero ou apresentação com amor para a Mari 💜"
}
`;
    }

    const response = await callGemini({
      contents: prompt,
      responseMimeType: 'application/json',
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (err: any) {
    console.error('Erro no assistente de receitas:', err);
    return res.status(500).json({ error: 'Erro ao gerar sugestão de receita' });
  }
});

// GET Open Food Facts Barcode Lookup
app.get('/api/barcode/:code', async (req, res) => {
  const { code } = req.params;
  if (!code || !/^\d{6,14}$/.test(code.trim())) {
    return res.status(400).json({ error: 'Código de barras inválido' });
  }

  try {
    const cleanCode = code.trim();

    // 1) Banco local primeiro, restrito aos espaços do perfil autenticado.
    const profileId = await resolveStorageProfile(req);
    if (pool && profileId) {
      const local = await pool.query(
        `SELECT p.* FROM products p
         WHERE p.barcode = $1 AND p.deleted_at IS NULL
           AND p.kitchen_space_id = ANY(
             SELECT kitchen_space_id FROM memberships WHERE profile_id = $2
           )
         LIMIT 1`,
        [cleanCode, profileId]
      );
      if (local.rows.length) {
        const p = local.rows[0];
        const servingGrams = Number(p.serving_quantity) || 100;
        return res.json({
          found: true,
          local: true,
          barcode: p.barcode,
          productName: p.commercial_name,
          brand: p.brand || '',
          servingSize: p.serving_unit || `${servingGrams}g`,
          servingGrams,
          per100g: {
            calories: Number(p.calories_per_100) || 0,
            protein: Number(p.protein_per_100) || 0,
            carbs: Number(p.carbs_per_100) || 0,
            fat: Number(p.fat_per_100) || 0,
            fiber: Number(p.fiber_per_100) || 0,
            sodium: Number(p.sodium_per_100) || 0,
          },
          imageUrl: p.image_path || null,
          source: p.data_source,
          product: p,
        });
      }
    }

    // 2) Open Food Facts (Brasil e mundial)
    const urls = [
      `https://world.openfoodfacts.org/api/v2/product/${cleanCode}.json`,
      `https://br.openfoodfacts.org/api/v0/product/${cleanCode}.json`,
    ];

    let productData: any = null;

    for (const url of urls) {
      try {
        const fetchRes = await fetch(url, {
          headers: {
            'User-Agent': 'OurLittleKitchenApp/1.0 (mariana@ourlittlekitchen.app)',
          },
        });
        if (fetchRes.ok) {
          const data: any = await fetchRes.json();
          if (data && (data.status === 1 || data.product)) {
            productData = data.product;
            break;
          }
        }
      } catch (e) {
        // Continue to fallback
      }
    }

    if (!productData) {
      return res.status(404).json({
        found: false,
        barcode: cleanCode,
        message: 'Produto não encontrado na base Open Food Facts.',
      });
    }

    const nutriments = productData.nutriments || {};

    // Extract serving info
    let servingGrams = 100;
    const servingQuantity = productData.serving_quantity;
    if (servingQuantity && !isNaN(Number(servingQuantity))) {
      servingGrams = Number(servingQuantity);
    }

    const energyKcal =
      nutriments['energy-kcal_100g'] ??
      nutriments['energy-kcal'] ??
      (nutriments['energy_100g'] ? Math.round(nutriments['energy_100g'] / 4.184) : 0);

    const result = {
      found: true,
      barcode: cleanCode,
      productName: productData.product_name_pt || productData.product_name || 'Produto sem nome',
      brand: productData.brands || productData.brand_owner || '',
      servingSize: productData.serving_size || `${servingGrams}g`,
      servingGrams: servingGrams,
      // Values per 100g
      per100g: {
        calories: Math.round(Number(energyKcal) || 0),
        protein: Number(Number(nutriments['proteins_100g'] ?? 0).toFixed(1)),
        carbs: Number(Number(nutriments['carbohydrates_100g'] ?? 0).toFixed(1)),
        fat: Number(Number(nutriments['fat_100g'] ?? 0).toFixed(1)),
        fiber: Number(Number(nutriments['fiber_100g'] ?? 0).toFixed(1)),
        sodium: Number(Number(nutriments['sodium_100g'] ?? 0).toFixed(1)),
      },
      imageUrl: productData.image_url || productData.image_front_url || null,
      source: 'Open Food Facts',
    };

    return res.json(result);
  } catch (err: any) {
    console.error('Erro ao consultar código de barras:', err);
    return res.status(500).json({ error: 'Falha ao consultar base Open Food Facts' });
  }
});

// POST Gemini Read Barcode from Photo
app.post('/api/gemini/read-barcode', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Imagem não fornecida' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'Chave do Gemini não configurada' });
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+]+;base64,/, '');

    const promptText = `
Você é um leitor óptico de código de barras (EAN-13, EAN-8, UPC-A, UPC-E).
Analise a imagem e identifique o número do código de barras presente no produto ou embalagem.
Retorne estritamente o código numérico encontrado e o nome aproximado do produto se visível.

Formato JSON:
{
  "found": true,
  "barcode": "7891000100103",
  "productName": "Leite Moça",
  "confidence": 95
}
Se não encontrar nenhum código de barras na foto, retorne:
{
  "found": false,
  "barcode": "",
  "reason": "Nenhum código de barras visível na imagem"
}
`;

    const response = await callGemini({
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: cleanBase64,
            },
          },
          { text: promptText },
        ],
      },
      responseMimeType: 'application/json',
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (err: any) {
    console.error('Erro na leitura de código de barras por IA:', err);
    return res.status(500).json({ error: 'Erro ao analisar imagem do código de barras' });
  }
});

// Mount API normalizada (tabelas relacionais, RLS, cálculos nutricionais).
// Monta em /api porque os caminhos do apiRouter são relativos (/foods => /api/foods).
// Rotas legadas (/api/storage, /api/health, /api/gemini) são registradas acima,
// portanto continuam com prioridade. O Vite/SPA fora de /api não é interceptado.
app.use('/api', apiRouter);

// Vite middleware in dev or static serving in prod
async function startServer() {
  try {
    await initDatabase();
    console.log('🐘 Postgres (Neon) conectado e schema aplicado.');
  } catch (err: any) {
    console.error('⚠️  Falha ao inicializar o Postgres:', err.message || err);
    console.error('   O servidor vai iniciar, mas /api/storage e /api/health vão reportar erro.');
  }

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    // specifier não-literal para o file-tracer do Vercel não empacotar o vite
    const vitePkg = 'vite';
    const { createServer: createViteServer } = await import(vitePkg);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`💜 Our Little Kitchen server rodando em https://localhost:${PORT}`);
  });

  const shutdown = async () => {
    server.close();
    await closeDatabase().catch(() => {});
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// No Vercel (serverless) o startServer não roda — o app é exportado como função em api/index.ts
if (!process.env.VERCEL) {
  startServer();
}

export default app;
