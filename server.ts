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
    // Sem retry interno (o padrão são 5 tentativas com backoff, o que estoura
    // o maxDuration de 60s do Vercel) e teto de 18s por tentativa.
    retryOptions: { attempts: 1 },
    timeout: 18000,
  },
});

// Helper universal com fallback automático de modelos Gemini reais
async function callGemini(params: {
  contents: any;
  systemInstruction?: string;
  responseMimeType?: string;
  responseSchema?: any;
  temperature?: number;
}) {
  const candidateModels = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-2.5-pro',
    'gemini-1.5-pro',
  ];

  let lastError: any = null;
  for (const model of candidateModels) {
    try {
      const config: any = {};
      if (params.systemInstruction) config.systemInstruction = params.systemInstruction;
      if (params.responseMimeType) config.responseMimeType = params.responseMimeType;
      if (params.responseSchema) config.responseSchema = params.responseSchema;
      if (params.temperature !== undefined) config.temperature = params.temperature;

      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: Object.keys(config).length > 0 ? config : undefined,
      });
      return response;
    } catch (err: any) {
      lastError = err;
      console.warn(`Tentativa com modelo ${model} falhou:`, err?.message || err);

      // Se falhou e tinha responseSchema, tenta novamente sem schema (usando apenas application/json)
      if (params.responseSchema) {
        try {
          const configNoSchema: any = {};
          if (params.systemInstruction) configNoSchema.systemInstruction = params.systemInstruction;
          if (params.responseMimeType) configNoSchema.responseMimeType = params.responseMimeType;
          if (params.temperature !== undefined) configNoSchema.temperature = params.temperature;
          const retryResponse = await ai.models.generateContent({
            model,
            contents: params.contents,
            config: Object.keys(configNoSchema).length > 0 ? configNoSchema : undefined,
          });
          return retryResponse;
        } catch (retryErr: any) {
          lastError = retryErr;
          console.warn(`Tentativa sem schema no modelo ${model} também falhou:`, retryErr?.message || retryErr);
        }
      }
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

// --- Análise de refeição: schema estruturado + consistência matemática ---
// Garante JSON válido e recalcula porções/totais no servidor (a IA pode errar
// a soma; gramas × valor/100g nunca).
const MEAL_ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    mealName: { type: Type.STRING },
    overallConfidence: { type: Type.INTEGER },
    confidenceNotes: { type: Type.STRING },
    questionsForMariana: { type: Type.ARRAY, items: { type: Type.STRING } },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          foodName: { type: Type.STRING },
          prepState: { type: Type.STRING },
          portionGrams: { type: Type.NUMBER },
          portionReasoning: { type: Type.STRING },
          kcalPer100g: { type: Type.NUMBER },
          proteinPer100g: { type: Type.NUMBER },
          carbsPer100g: { type: Type.NUMBER },
          fatPer100g: { type: Type.NUMBER },
          fiberPer100g: { type: Type.NUMBER },
          confidence: { type: Type.INTEGER },
          reasoning: { type: Type.STRING },
          calories: { type: Type.NUMBER },
          protein: { type: Type.NUMBER },
          carbs: { type: Type.NUMBER },
          fat: { type: Type.NUMBER },
          fiber: { type: Type.NUMBER },
        },
        required: [
          'foodName', 'prepState', 'portionGrams', 'portionReasoning',
          'kcalPer100g', 'proteinPer100g', 'carbsPer100g', 'fatPer100g',
          'fiberPer100g', 'confidence', 'reasoning',
          'calories', 'protein', 'carbs', 'fat', 'fiber',
        ],
      },
    },
    totals: {
      type: Type.OBJECT,
      properties: {
        totalGrams: { type: Type.NUMBER },
        calories: { type: Type.NUMBER },
        protein: { type: Type.NUMBER },
        carbs: { type: Type.NUMBER },
        fat: { type: Type.NUMBER },
        fiber: { type: Type.NUMBER },
      },
      required: ['totalGrams', 'calories', 'protein', 'carbs', 'fat', 'fiber'],
    },
  },
  required: ['mealName', 'overallConfidence', 'confidenceNotes', 'questionsForMariana', 'items', 'totals'],
};

function parseJsonLoose(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        // fallthrough
      }
    }
    return {};
  }
}

function clampNum(v: any, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Recalcula calorias/macros por porção e totais a partir dos valores/100g.
function normalizeMealAnalysis(parsed: any) {
  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];

  const items = rawItems
    .map((it: any) => {
      const portionGrams = clampNum(it?.portionGrams, 1, 2000, 0);
      if (portionGrams <= 0) return null;

      const kcal100 = clampNum(it?.kcalPer100g, 0, 950, 0);
      const p100 = clampNum(it?.proteinPer100g, 0, 100, 0);
      const c100 = clampNum(it?.carbsPer100g, 0, 100, 0);
      const g100 = clampNum(it?.fatPer100g, 0, 100, 0);
      const f100 = clampNum(it?.fiberPer100g, 0, 90, 0);

      const round1 = (x: number) => Math.round(x * 10) / 10;
      const portion = Math.round(portionGrams * 10) / 10;

      return {
        foodName: String(it?.foodName || 'Alimento').slice(0, 120),
        prepState: String(it?.prepState || 'cozido').slice(0, 60),
        portionGrams: portion,
        portionReasoning: String(it?.portionReasoning || '').slice(0, 300),
        kcalPer100g: Math.round(kcal100),
        // Matemática exata no servidor: porção × valor/100g
        calories: Math.round((portion * kcal100) / 100),
        protein: round1((portion * p100) / 100),
        carbs: round1((portion * c100) / 100),
        fat: round1((portion * g100) / 100),
        fiber: round1((portion * f100) / 100),
        confidence: Math.round(clampNum(it?.confidence, 0, 100, 75)),
        reasoning: String(it?.reasoning || it?.portionReasoning || '').slice(0, 300),
        source: 'TACO',
      };
    })
    .filter((x: any) => x !== null);

  const round1 = (x: number) => Math.round(x * 10) / 10;
  const totals = items.reduce(
    (acc: any, it: any) => {
      acc.totalGrams += it.portionGrams;
      acc.calories += it.calories;
      acc.protein += it.protein;
      acc.carbs += it.carbs;
      acc.fat += it.fat;
      acc.fiber += it.fiber;
      return acc;
    },
    { totalGrams: 0, calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );

  return {
    mealName: String(parsed?.mealName || 'Refeição analisada').slice(0, 160),
    overallConfidence: Math.round(clampNum(parsed?.overallConfidence, 0, 100, 75)),
    confidenceNotes: String(parsed?.confidenceNotes || '').slice(0, 500),
    questionsForMariana: Array.isArray(parsed?.questionsForMariana)
      ? parsed.questionsForMariana.map((q: any) => String(q).slice(0, 300)).slice(0, 5)
      : [],
    items,
    totals: {
      totalGrams: round1(totals.totalGrams),
      calories: totals.calories,
      protein: round1(totals.protein),
      carbs: round1(totals.carbs),
      fat: round1(totals.fat),
      fiber: round1(totals.fiber),
    },
  };
}

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
Você é uma nutricionista clínica de excelência especializada na Tabela TACO (Tabela Brasileira de Composição de Alimentos) e TBCA da USP.
Analise detalhadamente a refeição na fotografia enviada por Mariana.
Refeição pretendida: ${mealType || 'Refeição'}.
Notas adicionais da usuária: ${notes || 'Nenhuma'}.

DIRETRIZ FUNDAMENTAL DE IDENTIFICAÇÃO (PRATO DE COMIDA vs. LANCHE / ITEM ÚNICO):
A) SE FOR UM PRATO DE COMIDA COMPOSTO (ex: almoço, jantar ou marmita com arroz, feijão, carnes, legumes, salada):
   - Separe e estime CADA ALIMENTO INDIVIDUALMENTE em itens separados na lista "items" (ex: "Arroz branco cozido", "Feijão carioca cozido", "Peito de frango grelhado", "Salada mista", etc.).
   - Estime com máxima precisão o peso em gramas de cada elemento individual no prato.
B) SE FOR UM LANCHE, SANDUÍCHE, SALGADO, PIZZA, PASTEL, AÇAÍ OU ITEM ÚNICO (ex: hambúrguer, sanduíche natural, misto-quente, tapioca recheada, coxinha, fatia de pizza, fatia de bolo, pão de queijo recheado):
   - NUNCA separe o lanche em fatias soltas de pão e queijo! Estime as calorias e macronutrientes do lanche JUNTAS em 1 item principal coeso (ex: "Hambúrguer artesanal completo com queijo e bacon" ou "Sanduíche natural de frango", "Coxinha de frango", "Fatia de pizza calabresa").
   - Estime o peso total do lanche e seus macronutrientes de forma precisa e certeira com base na composição real de lanches brasileiros.
   - Só inclua itens adicionais se houver acompanhamentos ou bebidas visíveis ao lado (ex: "Porção de batata frita", "Suco de laranja natural").

MÉTODO OBRIGATÓRIO DE CÁLCULO E PRECISÃO:
1. ESCALA VISUAL — use referências da própria cena como régua para medir:
   - Prato de almoço comum ≈ 24 cm de diâmetro; potes/marmitas: meça pela borda visível
   - Garfo ≈ 18 cm, faca ≈ 20 cm, colher de sopa ≈ 14 cm
   - Concha cheia de arroz/feijão ≈ 100-120 g; rasa ≈ 60-80 g
   - Palmo de carne grelhada ≈ 100 g; filé de peito de frango ≈ 100-180 g
   - Ovo inteiro ≈ 55 g; fatia de pão francês ≈ 30 g; fatia de queijo ≈ 25 g
   - Hambúrguer completo médio ≈ 200-280 g; sanduíche natural ≈ 180-220 g; coxinha média ≈ 120 g
   - Banana prata inteira ≈ 100 g; punhado de batata frita ≈ 100 g; fatia de bolo ≈ 80-120 g
   Compare cada alimento com essas referências e estime os gramas com rigor técnico.
2. Determine o estado de preparo exato (cru, cozido em água, grelhado, assado, frito, refogado com óleo/azeite, no vapor) — ele muda os valores por 100 g.
3. ÓLEO INVISÍVEL: se houver brilho, fritura ou refogado, some 5-15 g de óleo/azeite (≈ 45-135 kcal) à porção; só não some se a foto demonstrar claramente que não houve gordura no preparo.
4. Peso líquido: desconte osso, casca, semente, caroço e embalagem.
5. Para cada alimento informe os valores POR 100 g usando a referência TACO abaixo (kcal / proteína g / carboidrato g / gordura g / fibra g):
   arroz branco cozido 128/2.5/28/0.2/1.6 | arroz integral cozido 112/2.6/23/1.0/2.7 | feijão cozido 76/4.8/14/0.5/8 | macarrão cozido 147/5/30/1/1.8 | cuscuz 115/3/25/0.5/1.5
   frango peito grelhado 159/32/0/2.5/0 | frango perna/coxa grelhado 205/28/0/9/0 | carne bovina grelhada 220/30/0/10/0 | carne moída refogada 160/19/0/8/0 | porco grelhado 240/28/0/14/0
   peixe branco grelhado 130/23/0/4/0 | salmão grelhado 230/24/0/15/0 | camarão grelhado 100/20/1/1.5/0 | ovo frito 240/14/1.6/19/0 | ovo cozido 155/13/1.1/11/0
   batata frita 267/3.5/35/13/3 | batata cozida 52/1.2/12/0/1.3 | batata-doce cozida 77/0.6/18/0.1/2.2 | batata-doce assada 90/2/21/0.1/3.3 | aipim cozido 125/0.6/30/0.3/1.8 | purê de batata 100/2/17/2.5/1.5
   pão francês 330/8/60/5/2.4 | pão de forma 250/8/48/3.5/2.5 | queijo mussarela 300/19/3/25/0 | requeijão 260/5/3.5/26/0 | maionese 300/1/4/32/0
   hambúrguer completo 250/14/22/12/1.5 | sanduíche natural frango 190/11/22/6/1.8 | coxinha frango 260/8/30/12/1.2 | pastel de carne frito 310/9/32/16/1 | pizza mussarela 270/11/33/11/2
   azeite/óleo/manteiga 884/0/0/100/0 | farofa pronta 500/6/60/26/4
   brócolis cozido 34/2.8/6/0.4/3.3 | couve refogada 90/3/6/6/4 | cenoura cozida 43/0.8/10/0.2/3.2 | tomate 15/1.1/3.1/0.2/1.2 | salada mista verde 18/1.2/3.5/0.2/1.5
   banana prata 98/1.3/26/0.1/2 | maçã 56/0.4/15/0.1/1.3 | bolo simples 350/5/50/13/1.5 | chocolate ao leite 550/7/55/33/2
   refrigerante 42/0/11/0/0 | suco de fruta natural 50/0.5/12/0.1/0.3 | açaí na tigela montado 130/2/22/4/2.5
6. AUTO-VERIFICAÇÃO OBRIGATÓRIA antes de responder:
   a) calorias/100g ≈ (4 × carboidratos) + (4 × proteínas) + (9 × gorduras) — confira a coerência;
   b) calorias da porção = gramas × calorias/100g ÷ 100 — confira cada item; os totais são a soma exata dos itens.
7. Explique cada estimativa com medida caseira (ex.: "1 unidade média ≈ 220g", "2 conchas cheias ≈ 140g", "meio prato ≈ 120g").
8. Estime a confiança geral (0 a 100). Faça 1 a 2 perguntas curtas e gentis para Mariana se houver dúvida (ex: "O lanche tinha molho especial ou maionese?").

Responda OBRIGATORIAMENTE em formato JSON com o seguinte formato:
{
  "mealName": "Nome descritivo da refeição (ex: Almoço com Frango Grelhado e Salada OU Hambúrguer Artesanal com Queijo)",
  "overallConfidence": 85,
  "confidenceNotes": "Explicação breve da estimativa visual",
  "questionsForMariana": ["Você adicionou molho extra ou azeite no preparo?"],
  "items": [
    {
      "foodName": "Peito de frango grelhado OU Hambúrguer Artesanal",
      "prepState": "grelhado",
      "portionGrams": 130,
      "portionReasoning": "Porção média com base na escala visual ≈ 130g",
      "kcalPer100g": 159,
      "proteinPer100g": 32,
      "carbsPer100g": 0,
      "fatPer100g": 2.5,
      "fiberPer100g": 0,
      "confidence": 90,
      "reasoning": "Estimativa precisa baseada na TACO/TBCA",
      "calories": 207,
      "protein": 41.6,
      "carbs": 0,
      "fat": 3.3,
      "fiber": 0
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
      "carbs": 0,
      "fat": 3.3,
      "fiber": 0
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
      responseSchema: MEAL_ANALYSIS_SCHEMA,
      temperature: 0.3,
    });

    const parsed = parseJsonLoose(response.text || '{}');

    // Matemática garantida pelo servidor: porção × valor/100g e totais = soma
    return res.json(normalizeMealAnalysis(parsed));
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

// POST Gemini Estimate Food Nutrition by name / description
app.post('/api/gemini/estimate-food-nutrition', async (req, res) => {
  try {
    const { foodName, brand, barcode } = req.body;
    if (!foodName || !foodName.trim()) {
      return res.status(400).json({ error: 'Nome do alimento é obrigatório' });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'Chave do Gemini não configurada no servidor' });
    }

    const promptText = `
Você é uma nutricionista e especialista em tabelas de alimentos brasileiras (Tabela TACO, TBCA e rotulagem ANVISA).
O usuário informou o alimento comercial ou caseiro: "${foodName.trim()}" ${brand ? `da marca "${brand.trim()}"` : ''}.
Estime com o máximo de precisão científica os valores nutricionais por 100g e a porção de referência típica recomendada pelo fabricante ou ANVISA.

Responda ESTRITAMENTE em formato JSON com o seguinte schema:
{
  "productName": "${foodName.trim()}",
  "brand": "${brand ? brand.trim() : ''}",
  "servingSize": "ex: 30g ou 100g ou 1 unidade (50g)",
  "servingGrams": 100,
  "calories": 150,
  "protein": 10.0,
  "carbs": 20.0,
  "fat": 3.5,
  "fiber": 2.0,
  "sodium": 80
}
Todos os valores de calorias, protein, carbs, fat, fiber devem ser expressos por 100g (números puros).
servingGrams deve ser o peso em gramas da porção de referência típica (número).
`;

    const response = await callGemini({
      contents: promptText,
      responseMimeType: 'application/json',
      temperature: 0.2,
    });

    const parsed = JSON.parse(response.text || '{}');
    const servingGrams = Number(parsed.servingGrams) || 100;
    const per100g = {
      calories: Math.round(Number(parsed.calories) || 0),
      protein: Number(Number(parsed.protein || 0).toFixed(1)),
      carbs: Number(Number(parsed.carbs || 0).toFixed(1)),
      fat: Number(Number(parsed.fat || 0).toFixed(1)),
      fiber: Number(Number(parsed.fiber || 0).toFixed(1)),
      sodium: Number(Number(parsed.sodium || 0).toFixed(1)),
    };

    return res.json({
      found: true,
      barcode: barcode || '',
      productName: parsed.productName || foodName.trim(),
      brand: parsed.brand || brand || '',
      servingSize: parsed.servingSize || `${servingGrams}g`,
      servingGrams,
      per100g,
      source: 'Estimativa IA (TACO/TBCA)',
    });
  } catch (err: any) {
    console.error('Erro na estimativa de nutrição por IA:', err);
    return res.status(500).json({
      error: 'Erro ao estimar valores nutricionais do alimento: ' + (err.message || 'Erro interno'),
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
    if (pool) {
      let local: any = null;
      if (profileId) {
        local = await pool.query(
          `SELECT p.* FROM products p
           WHERE p.barcode = $1 AND p.deleted_at IS NULL
             AND p.kitchen_space_id = ANY(
               SELECT kitchen_space_id FROM memberships WHERE profile_id = $2
             )
           LIMIT 1`,
          [cleanCode, profileId]
        );
      }
      // Fallback sem restriction caso esteja rodando em modo simplificado/usuário único
      if (!local || local.rows.length === 0) {
        local = await pool.query(
          `SELECT p.* FROM products p
           WHERE p.barcode = $1 AND p.deleted_at IS NULL
           ORDER BY p.last_updated_at DESC NULLS LAST
           LIMIT 1`,
          [cleanCode]
        );
      }
      if (local && local.rows.length) {
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
          source: p.data_source || 'Banco Local',
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
