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
  STATE_ID,
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

// Initialize Google Gemini SDK on the server side with v1beta API version support
process.env.GOOGLE_GENAI_API_VERSION = 'v1beta';

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_KEY || '';

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
  apiVersion: 'v1beta',
  httpOptions: {
    apiVersion: 'v1beta',
    headers: {
      'User-Agent': 'aistudio-build',
    },
    // Sem retry interno longo (o padrão do SDK são 5 tentativas com backoff que estouram
    // o timeout serverless do Vercel) e teto de 25s por tentativa.
    retryOptions: { attempts: 1 },
    timeout: 25000,
  },
});

// Helper direto via REST API v1beta (garante compatibilidade máxima caso o SDK tenha divergência de versão)
async function callGeminiRest(
  model: string,
  params: {
    contents: any;
    systemInstruction?: string;
    responseMimeType?: string;
    temperature?: number;
  }
) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_KEY || '';
  if (!apiKey) throw new Error('Chave GEMINI_API_KEY não configurada no servidor.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let parts: any[] = [];
  if (typeof params.contents === 'string') {
    parts = [{ text: params.contents }];
  } else if (params.contents?.parts) {
    parts = params.contents.parts.map((p: any) => {
      if (p.inlineData) {
        return {
          inline_data: {
            mime_type: p.inlineData.mimeType,
            data: p.inlineData.data,
          },
        };
      }
      return p;
    });
  } else if (Array.isArray(params.contents)) {
    parts = params.contents;
  }

  const body: any = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: params.temperature ?? 0.2,
      responseMimeType: params.responseMimeType || 'application/json',
    },
  };

  if (params.systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: params.systemInstruction }],
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 22000);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  clearTimeout(timer);

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`REST API ${model} HTTP ${res.status}: ${errText}`);
  }

  const data: any = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return { text };
}

// Helper universal com modelos Gemini modernos (preferencialmente gemini-3.8-flash) e fallback automático
async function callGemini(params: {
  contents: any;
  systemInstruction?: string;
  responseMimeType?: string;
  responseSchema?: any;
  temperature?: number;
}) {
  // Lista de modelos atualizados com suporte a visão multimodal (removido modelo obsoleto gemini-1.5-pro)
  const candidateModels = [
    'gemini-3.8-flash',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-2.0-flash-exp',
    'gemini-2.5-pro',
  ];

  let lastError: any = null;
  for (const model of candidateModels) {
    // 1. Tentar via SDK oficial com API v1beta
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
      if (response && response.text) {
        return response;
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`Tentativa SDK modelo ${model} falhou:`, err?.message || err);

      // Se falhou e tinha responseSchema, tenta novamente via SDK sem schema (apenas JSON MIME)
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
          if (retryResponse && retryResponse.text) {
            return retryResponse;
          }
        } catch (retryErr: any) {
          lastError = retryErr;
          console.warn(`Tentativa SDK sem schema em ${model} falhou:`, retryErr?.message || retryErr);
        }
      }
    }

    // 2. Fallback direto REST API v1beta para garantir compatibilidade
    try {
      const restResponse = await callGeminiRest(model, params);
      if (restResponse && restResponse.text) {
        return restResponse;
      }
    } catch (restErr: any) {
      lastError = restErr;
      console.warn(`Tentativa REST v1beta em ${model} falhou:`, restErr?.message || restErr);
    }
  }

  throw lastError || new Error('Nenhum modelo Gemini atualizado conseguiu responder à solicitação.');
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
          probableIngredients: { type: Type.ARRAY, items: { type: Type.STRING } },
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
        probableIngredients: Array.isArray(it?.probableIngredients)
          ? it.probableIngredients.map(String).slice(0, 10)
          : (it?.probableIngredients ? [String(it.probableIngredients)] : []),
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
      "probableIngredients": ["peito de frango", "alho", "azeite", "sal"],
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

// POST Gemini OCR Nutrition Facts Label (Conformidade ANVISA RDC 429/2020 e IN 75/2020)
app.post('/api/gemini/ocr-label', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg', barcode, productNameHint, brandHint } = req.body;

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
Você é uma inteligência artificial especialista em rotulagem e tabelas nutricionais segundo as normas da ANVISA (RDC nº 429/2020 e Instrução Normativa nº 75/2020 do Brasil).
Analise com rigor técnico a fotografia da tabela nutricional / rótulo enviada por Mariana.

DIRETRIZES FUNDAMENTAIS DE CONFIABILIDADE E FIDELIDADE:
1. TESTE DE LEGIBILIDADE:
   - Se a imagem estiver cortada, muito embaçada, ilegível, sem iluminação adequada ou NÃO contiver uma tabela nutricional de alimentos, defina "isLegible": false.
   - Em "illegibleReason", forneça uma explicação gentil e clara em português instruindo Mariana a tirar uma nova foto mais nítida, aproximada e com boa iluminação.
2. NUNCA INVENTE DADOS:
   - Extraia estritamente o que está impresso na embalagem.
   - NUNCA transforme campos ausentes em zero! Se um nutriente (ex: açúcares adicionados, gorduras trans, sódio) NÃO constar na tabela ou rótulo, retorne null para esse campo.
3. VALORES POR 100g / 100ml vs. VALORES POR PORÇÃO:
   - No padrão brasileiro ANVISA, a tabela geralmente tem duas colunas: "100 g" (ou 100 ml) e "Porção (ex: 30g)".
   - Extraia ambos os blocos ("per100" e "perPortion") com precisão.
   - Se a embalagem contiver apenas a porção, informe os valores da porção e calcule matematicamente os valores por 100g/ml proporcionais.
4. UNIDADE DA PORÇÃO:
   - Identifique com exatidão se o alimento é sólido (unidade "g") ou líquido (unidade "ml").
   - Identifique a medida caseira se informada (ex: "2 fatias", "1 xícara", "3 biscoitos").
5. NÍVEL DE CONFIANÇA POR CAMPO:
   - Atribua o nível de confiança ("alta", "media" ou "baixa") para cada nutriente identificado, baseado na clareza visual dos números na foto.
   - Dê uma nota geral de confiança de 0 a 100 em "overallConfidence".
6. CÓDIGO DE BARRAS E NOME:
   - Se houver nome comercial ou marca visível no rótulo, extraia. Se fornecido pelo usuário (${productNameHint ? `Nome sugerido: "${productNameHint}"` : 'não fornecido'}), preserve-o como preferência.

Responda ESTRITAMENTE em formato JSON com este schema:
{
  "isLegible": true,
  "illegibleReason": null,
  "productName": "${productNameHint || ''}",
  "brand": "${brandHint || ''}",
  "portion": {
    "servingSize": "ex: 30g (2 biscoitos) ou 200ml (1 copo)",
    "servingQuantity": 30,
    "servingUnit": "g",
    "servingsPerPackage": 5
  },
  "perPortion": {
    "calories": 140,
    "carbs": 21.0,
    "sugars": 5.0,
    "addedSugars": 3.0,
    "protein": 2.5,
    "totalFat": 5.2,
    "saturatedFat": 2.1,
    "transFat": 0.0,
    "fiber": 1.4,
    "sodium": 85
  },
  "per100": {
    "unit": "100g",
    "calories": 466,
    "carbs": 70.0,
    "sugars": 16.7,
    "addedSugars": 10.0,
    "protein": 8.3,
    "totalFat": 17.3,
    "saturatedFat": 7.0,
    "transFat": 0.0,
    "fiber": 4.7,
    "sodium": 283
  },
  "confidence": {
    "overall": 95,
    "calories": "alta",
    "carbs": "alta",
    "protein": "alta",
    "totalFat": "alta",
    "saturatedFat": "alta",
    "transFat": "alta",
    "fiber": "alta",
    "sodium": "alta",
    "sugars": "alta",
    "portion": "alta"
  },
  "ingredientsList": "Ingredientes: farinha de trigo, etc.",
  "notes": "Informações adicionais ou alertas (ex: Contém Glúten)"
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
      temperature: 0.1,
    });

    const parsed = parseJsonLoose(response.text || '{}');

    // Se a IA detectou que a foto é ilegível, retorna imediatamente com instruções
    if (parsed.isLegible === false) {
      return res.json({
        isLegible: false,
        barcode: barcode || null,
        illegibleReason:
          parsed.illegibleReason ||
          'A fotografia ficou embaçada ou cortada e não foi possível ler os valores nutricionais com precisão. Por favor, aproxime a câmera da tabela nutricional sob boa luz e tire outra foto.',
        confidence: { overall: 10 },
      });
    }

    const servingQty = Number(parsed.portion?.servingQuantity) || 100;
    const servingUnit = parsed.portion?.servingUnit === 'ml' ? 'ml' : 'g';
    const servingRatio = servingQty > 0 ? 100 / servingQty : 1;

    // Normalização matemática para garantir consistência entre porção e 100g/100ml
    let per100 = parsed.per100 || {};
    let perPortion = parsed.perPortion || {};

    const resolveNutrient = (pVal: any, hVal: any) => {
      const pNum = pVal != null && !isNaN(Number(pVal)) ? Number(pVal) : null;
      const hNum = hVal != null && !isNaN(Number(hVal)) ? Number(hVal) : null;
      if (hNum != null) {
        return {
          per100: Number(hNum.toFixed(1)),
          perPortion: pNum != null ? Number(pNum.toFixed(1)) : Number(((hNum * servingQty) / 100).toFixed(1)),
        };
      }
      if (pNum != null) {
        return {
          per100: Number((pNum * servingRatio).toFixed(1)),
          perPortion: Number(pNum.toFixed(1)),
        };
      }
      return { per100: null, perPortion: null };
    };

    const cCalories = resolveNutrient(perPortion.calories, per100.calories);
    const cCarbs = resolveNutrient(perPortion.carbs, per100.carbs);
    const cProtein = resolveNutrient(perPortion.protein, per100.protein);
    const cFat = resolveNutrient(perPortion.totalFat, per100.totalFat);
    const cSatFat = resolveNutrient(perPortion.saturatedFat, per100.saturatedFat);
    const cTransFat = resolveNutrient(perPortion.transFat, per100.transFat);
    const cFiber = resolveNutrient(perPortion.fiber, per100.fiber);
    const cSodium = resolveNutrient(perPortion.sodium, per100.sodium);
    const cSugars = resolveNutrient(perPortion.sugars, per100.sugars);
    const cAddedSugars = resolveNutrient(perPortion.addedSugars, per100.addedSugars);

    const result = {
      isLegible: true,
      barcode: barcode || null,
      productName: parsed.productName || productNameHint || 'Produto identificado por foto',
      brand: parsed.brand || brandHint || '',
      portion: {
        servingSize: parsed.portion?.servingSize || `${servingQty}${servingUnit}`,
        servingQuantity: servingQty,
        servingUnit,
        servingsPerPackage: parsed.portion?.servingsPerPackage || null,
      },
      per100g: {
        calories: cCalories.per100 != null ? Math.round(cCalories.per100) : 0,
        carbs: cCarbs.per100,
        sugars: cSugars.per100,
        addedSugars: cAddedSugars.per100,
        protein: cProtein.per100,
        fat: cFat.per100,
        saturatedFat: cSatFat.per100,
        transFat: cTransFat.per100,
        fiber: cFiber.per100,
        sodium: cSodium.per100,
      },
      perPortion: {
        calories: cCalories.perPortion != null ? Math.round(cCalories.perPortion) : 0,
        carbs: cCarbs.perPortion,
        sugars: cSugars.perPortion,
        addedSugars: cAddedSugars.perPortion,
        protein: cProtein.perPortion,
        fat: cFat.perPortion,
        saturatedFat: cSatFat.perPortion,
        transFat: cTransFat.perPortion,
        fiber: cFiber.perPortion,
        sodium: cSodium.perPortion,
      },
      confidence: parsed.confidence || {
        overall: 85,
        calories: 'alta',
        carbs: 'alta',
        protein: 'alta',
        fat: 'alta',
      },
      ingredientsList: parsed.ingredientsList || '',
      notes: parsed.notes || '',
      provenance: {
        barcodeSource: barcode ? 'scanner' : 'manual',
        nutritionSource: 'gemini_ocr',
        nameSource: parsed.productName ? 'ocr' : (productNameHint ? 'user' : 'manual'),
        confidenceScore: Number(parsed.confidence?.overall) || 85,
        verifiedStatus: 'pending',
        timestamp: new Date().toISOString(),
      },
    };

    return res.json(result);
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

// ---------------------------------------------------------------------------
// Barcode Validation & Helper Routines
// ---------------------------------------------------------------------------
function isValidBarcodeFormat(code: string): boolean {
  const clean = String(code || '').trim();
  return /^\d{8}$|^\d{12,14}$/.test(clean);
}

function isValidEanChecksum(code: string): boolean {
  const clean = String(code || '').trim();
  if (!isValidBarcodeFormat(clean)) return false;
  const digits = clean.split('').map(Number);
  const checkDigit = digits.pop()!;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const weight = (digits.length - 1 - i) % 2 === 0 ? 3 : 1;
    sum += digits[i] * weight;
  }
  const calculated = (10 - (sum % 10)) % 10;
  return calculated === checkDigit;
}

// ---------------------------------------------------------------------------
// FatSecret API Integration (Prioridade 3)
// ---------------------------------------------------------------------------
let fatSecretTokenCache: { token: string; expiresAt: number } | null = null;

async function getFatSecretToken(): Promise<string | null> {
  const clientId = process.env.FATSECRET_CLIENT_ID;
  const clientSecret = process.env.FATSECRET_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (fatSecretTokenCache && Date.now() < fatSecretTokenCache.expiresAt) {
    return fatSecretTokenCache.token;
  }

  try {
    const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch('https://oauth.fatsecret.com/connect/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials&scope=basic',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data: any = await res.json();
    if (data && data.access_token) {
      fatSecretTokenCache = {
        token: data.access_token,
        expiresAt: Date.now() + (Number(data.expires_in || 86400) - 300) * 1000,
      };
      return data.access_token;
    }
  } catch (err) {
    console.warn('[FatSecret] Autenticação OAuth2 falhou:', err);
  }
  return null;
}

async function lookupFatSecret(barcode: string): Promise<any | null> {
  const token = await getFatSecretToken();
  if (!token) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const findUrl = `https://platform.fatsecret.com/rest/server.api?method=food.find_id_for_barcode&barcode=${encodeURIComponent(
      barcode
    )}&format=json`;
    const res = await fetch(findUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const findData: any = await res.json();
    const foodId = findData?.food_id?.value;
    if (!foodId) return null;

    const controller2 = new AbortController();
    const timeout2 = setTimeout(() => controller2.abort(), 7000);
    const getUrl = `https://platform.fatsecret.com/rest/server.api?method=food.get.v2&food_id=${encodeURIComponent(
      foodId
    )}&format=json`;
    const getRes = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller2.signal,
    });
    clearTimeout(timeout2);
    if (!getRes.ok) return null;
    const getData: any = await getRes.json();
    const food = getData?.food;
    if (!food) return null;

    const servings = Array.isArray(food.servings?.serving)
      ? food.servings.serving
      : food.servings?.serving
      ? [food.servings.serving]
      : [];

    const refServing =
      servings.find((s: any) => s.metric_serving_unit === 'g' || s.metric_serving_amount) ||
      servings[0] ||
      {};

    const servingGrams = Number(refServing.metric_serving_amount) || 100;
    const ratio = servingGrams > 0 ? 100 / servingGrams : 1;

    return {
      found: true,
      barcode,
      productName: food.food_name || 'Alimento FatSecret',
      brand: food.brand_name || '',
      servingSize: refServing.serving_description || `${servingGrams}g`,
      servingGrams,
      per100g: {
        calories: Math.round((Number(refServing.calories) || 0) * ratio),
        protein: Number(((Number(refServing.protein) || 0) * ratio).toFixed(1)),
        carbs: Number(((Number(refServing.carbohydrate) || 0) * ratio).toFixed(1)),
        fat: Number(((Number(refServing.fat) || 0) * ratio).toFixed(1)),
        fiber: Number(((Number(refServing.fiber) || 0) * ratio).toFixed(1)),
        sodium: Number(((Number(refServing.sodium) || 0) * ratio).toFixed(1)),
        sugars: refServing.sugar != null ? Number(((Number(refServing.sugar) || 0) * ratio).toFixed(1)) : null,
        saturatedFat: refServing.saturated_fat != null ? Number(((Number(refServing.saturated_fat) || 0) * ratio).toFixed(1)) : null,
        transFat: refServing.trans_fat != null ? Number(((Number(refServing.trans_fat) || 0) * ratio).toFixed(1)) : null,
      },
      imageUrl: food.food_images?.food_image?.[0]?.image_url || null,
      source: 'FatSecret',
      verificationStatus: 'verified',
    };
  } catch (err) {
    console.warn('[FatSecret] Erro na consulta do código:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Open Food Facts API Integration (Prioridade 2)
// ---------------------------------------------------------------------------
async function lookupOpenFoodFacts(cleanCode: string): Promise<any | null> {
  const urls = [
    `https://world.openfoodfacts.org/api/v2/product/${cleanCode}.json`,
    `https://br.openfoodfacts.org/api/v2/product/${cleanCode}.json`,
    `https://world.openfoodfacts.org/api/v0/product/${cleanCode}.json`,
  ];

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const fetchRes = await fetch(url, {
        headers: {
          'User-Agent': 'OurLittleKitchen/2.0 (mariana@ourlittlekitchen.app)',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (fetchRes.ok) {
        const data: any = await fetchRes.json();
        if (data && (data.status === 1 || data.product)) {
          const productData = data.product;
          // Validação obrigatória: o código retornado deve corresponder ao pesquisado
          if (productData.code && String(productData.code).trim() !== cleanCode) {
            console.warn(`[Open Food Facts] Código divergente ignorado: recebido ${productData.code}, esperado ${cleanCode}`);
            continue;
          }

          const nutriments = productData.nutriments || {};

          let servingGrams = 100;
          const servingQuantity = productData.serving_quantity;
          if (servingQuantity && !isNaN(Number(servingQuantity))) {
            servingGrams = Number(servingQuantity);
          }

          const energyKcal =
            nutriments['energy-kcal_100g'] ??
            nutriments['energy-kcal'] ??
            (nutriments['energy_100g'] ? Math.round(nutriments['energy_100g'] / 4.184) : 0);

          // Sódio no OpenFoodFacts costuma vir em gramas (ex: 0.35g = 350mg). No Brasil rótulos usam mg.
          let sodiumMg: number | null = null;
          if (nutriments['sodium_100g'] != null) {
            const rawSodium = Number(nutriments['sodium_100g']);
            sodiumMg = rawSodium < 10 ? Math.round(rawSodium * 1000) : Math.round(rawSodium);
          } else if (nutriments['salt_100g'] != null) {
            // Sal ≈ Sódio × 2.54 => Sódio ≈ Sal / 2.54
            const rawSalt = Number(nutriments['salt_100g']);
            sodiumMg = rawSalt < 10 ? Math.round((rawSalt / 2.54) * 1000) : Math.round(rawSalt / 2.54);
          }

          return {
            found: true,
            barcode: cleanCode,
            productName:
              productData.product_name_pt ||
              productData.product_name ||
              productData.generic_name_pt ||
              productData.generic_name ||
              'Produto sem nome',
            brand: productData.brands || productData.brand_owner || '',
            category: productData.categories || '',
            packageSize: productData.quantity || '',
            servingSize: productData.serving_size || `${servingGrams}g`,
            servingGrams,
            per100g: {
              calories: Math.round(Number(energyKcal) || 0),
              protein: Number(Number(nutriments['proteins_100g'] ?? 0).toFixed(1)),
              carbs: Number(Number(nutriments['carbohydrates_100g'] ?? 0).toFixed(1)),
              fat: Number(Number(nutriments['fat_100g'] ?? 0).toFixed(1)),
              saturatedFat: nutriments['saturated-fat_100g'] != null ? Number(Number(nutriments['saturated-fat_100g']).toFixed(1)) : null,
              transFat: nutriments['trans-fat_100g'] != null ? Number(Number(nutriments['trans-fat_100g']).toFixed(1)) : null,
              fiber: Number(Number(nutriments['fiber_100g'] ?? 0).toFixed(1)),
              sugars: nutriments['sugars_100g'] != null ? Number(Number(nutriments['sugars_100g']).toFixed(1)) : null,
              addedSugars: nutriments['added-sugars_100g'] != null ? Number(Number(nutriments['added-sugars_100g']).toFixed(1)) : null,
              sodium: sodiumMg,
            },
            imageUrl: productData.image_url || productData.image_front_url || null,
            ingredients: productData.ingredients_text_pt || productData.ingredients_text || null,
            source: 'Open Food Facts',
            verificationStatus: 'verified',
            lastUpdated: productData.last_modified_t ? new Date(productData.last_modified_t * 1000).toISOString() : new Date().toISOString(),
          };
        }
      }
    } catch (e) {
      // Segue para a próxima url ou fallback
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// GET Barcode Lookup (Prioridade 1: Banco, Prioridade 2: OFF, Prioridade 3: FatSecret, Prioridade 4: Fallback)
// ---------------------------------------------------------------------------
app.get('/api/barcode/:code', async (req, res) => {
  const { code } = req.params;
  const cleanCode = String(code || '').trim();

  if (!cleanCode || cleanCode.length < 6) {
    return res.status(400).json({ error: 'Código de barras inválido.' });
  }

  try {
    // 1) PRIORIDADE 1 — BANCO DE DADOS PRÓPRIO
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
      // Fallback sem restrição de espaço (modo usuário único / catálogo compartilhado)
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
          category: p.category || '',
          packageSize: p.package_size || '',
          servingSize: p.serving_unit || `${servingGrams}g`,
          servingGrams,
          per100g: {
            calories: Number(p.calories_per_100) || 0,
            protein: Number(p.protein_per_100) || 0,
            carbs: Number(p.carbs_per_100) || 0,
            fat: Number(p.fat_per_100) || 0,
            saturatedFat: p.saturated_fat_per_100 != null ? Number(p.saturated_fat_per_100) : null,
            transFat: p.trans_fat_per_100 != null ? Number(p.trans_fat_per_100) : null,
            fiber: Number(p.fiber_per_100) || 0,
            sugars: p.sugars_per_100 != null ? Number(p.sugars_per_100) : null,
            addedSugars: p.added_sugars_per_100 != null ? Number(p.added_sugars_per_100) : null,
            sodium: p.sodium_per_100 != null ? Number(p.sodium_per_100) : null,
          },
          imageUrl: p.image_path || null,
          ingredients: p.ingredients || null,
          source: p.data_source || 'Banco Local',
          verificationStatus: p.verification_status || 'verified',
          confidenceScore: p.confidence_score ? Number(p.confidence_score) : 100,
          provenance: p.provenance || {
            barcodeSource: 'scanner',
            nutritionSource: p.data_source || 'Banco Local',
            verifiedStatus: p.verification_status || 'verified',
          },
          lastUpdated: p.last_updated_at || p.updated_at || new Date().toISOString(),
          product: p,
        });
      }
    }

    // 2) PRIORIDADE 2 — OPEN FOOD FACTS
    const offProduct = await lookupOpenFoodFacts(cleanCode);
    if (offProduct) {
      return res.json(offProduct);
    }

    // 3) PRIORIDADE 3 — FATSECRET (quando credenciais estiverem configuradas)
    if (process.env.FATSECRET_CLIENT_ID && process.env.FATSECRET_CLIENT_SECRET) {
      const fatSecretProduct = await lookupFatSecret(cleanCode);
      if (fatSecretProduct) {
        return res.json(fatSecretProduct);
      }
    }

    // 4) PRIORIDADE 4 — FALLBACK INTELIGENTE (nunca fecha com erro simples)
    return res.status(404).json({
      found: false,
      barcode: cleanCode,
      message: `O produto com código ${cleanCode} não foi localizado automaticamente nas bases cadastradas.`,
      recoveryOptions: {
        allowPhotoNutritionTable: true,
        allowSearchByName: true,
        allowManualEntry: true,
      },
    });
  } catch (err: any) {
    console.error('Erro na consulta em cascata de código de barras:', err);
    return res.status(500).json({
      error: 'Falha temporária ao consultar bases de alimentos: ' + (err.message || 'Erro interno'),
      recoveryOptions: {
        allowPhotoNutritionTable: true,
        allowSearchByName: true,
        allowManualEntry: true,
      },
    });
  }
});

// ---------------------------------------------------------------------------
// GET Busca Complementar por Nome e Marca (Prioridade 4)
// ---------------------------------------------------------------------------
app.get('/api/barcode/search-by-name', async (req, res) => {
  const { q, brand } = req.query as { q?: string; brand?: string };
  const queryText = String(q || '').trim();

  if (!queryText) {
    return res.status(400).json({ error: 'Termo de busca não fornecido' });
  }

  const results: any[] = [];
  const seenIds = new Set<string>();

  // 1. Busca no Banco Local (Postgres)
  if (pool) {
    try {
      let sql = `SELECT * FROM products WHERE deleted_at IS NULL AND (commercial_name ILIKE $1`;
      const params: any[] = [`%${queryText}%`];
      if (brand && brand.trim()) {
        sql += ` OR brand ILIKE $2`;
        params.push(`%${brand.trim()}%`);
      }
      sql += `) ORDER BY commercial_name LIMIT 10`;

      const { rows } = await pool.query(sql, params);
      for (const p of rows) {
        seenIds.add(p.barcode);
        results.push({
          barcode: p.barcode,
          productName: p.commercial_name,
          brand: p.brand || '',
          servingSize: p.serving_unit || `${p.serving_quantity || 100}g`,
          servingGrams: Number(p.serving_quantity) || 100,
          per100g: {
            calories: Number(p.calories_per_100) || 0,
            protein: Number(p.protein_per_100) || 0,
            carbs: Number(p.carbs_per_100) || 0,
            fat: Number(p.fat_per_100) || 0,
            fiber: Number(p.fiber_per_100) || 0,
            sodium: p.sodium_per_100 != null ? Number(p.sodium_per_100) : null,
          },
          imageUrl: p.image_path || null,
          source: 'Banco Local',
          verificationStatus: p.verification_status || 'verified',
        });
      }
    } catch (e) {
      console.warn('Busca local por nome falhou:', e);
    }
  }

  // 2. Busca na API Open Food Facts (filtrada e ordenada)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const searchUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
      queryText
    )}&search_simple=1&action=process&json=1&page_size=10`;

    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'OurLittleKitchen/2.0 (mariana@ourlittlekitchen.app)' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (searchRes.ok) {
      const data: any = await searchRes.json();
      const products = Array.isArray(data?.products) ? data.products : [];

      for (const p of products) {
        if (!p.code || seenIds.has(p.code)) continue;
        seenIds.add(p.code);

        const n = p.nutriments || {};
        const servingGrams = Number(p.serving_quantity) || 100;
        const energyKcal =
          n['energy-kcal_100g'] ??
          n['energy-kcal'] ??
          (n['energy_100g'] ? Math.round(n['energy_100g'] / 4.184) : 0);

        results.push({
          barcode: p.code,
          productName: p.product_name_pt || p.product_name || 'Produto sem nome',
          brand: p.brands || p.brand_owner || '',
          servingSize: p.serving_size || `${servingGrams}g`,
          servingGrams,
          per100g: {
            calories: Math.round(Number(energyKcal) || 0),
            protein: Number(Number(n.proteins_100g ?? 0).toFixed(1)),
            carbs: Number(Number(n.carbohydrates_100g ?? 0).toFixed(1)),
            fat: Number(Number(n.fat_100g ?? 0).toFixed(1)),
            fiber: Number(Number(n.fiber_100g ?? 0).toFixed(1)),
            sodium: n.sodium_100g != null ? Math.round(Number(n.sodium_100g) < 10 ? Number(n.sodium_100g) * 1000 : Number(n.sodium_100g)) : null,
          },
          imageUrl: p.image_url || p.image_front_url || null,
          source: 'Open Food Facts',
          verificationStatus: 'verified',
        });
      }
    }
  } catch (e) {
    // Ignorado se OFF estiver fora do ar
  }

  return res.json({
    found: results.length > 0,
    count: results.length,
    items: results,
  });
});

// ---------------------------------------------------------------------------
// POST Salvar / Cadastrar Alimento com Tabela Nutricional por Foto (Postgres & app_state)
// ---------------------------------------------------------------------------
const handleSaveProductOrFood = async (req: express.Request, res: express.Response) => {
  try {
    const b = req.body || {};
    const commercialName = String(b.productName || b.commercial_name || b.name || '').trim();

    if (!commercialName) {
      return res.status(400).json({ error: 'Nome do alimento é obrigatório para o cadastro.' });
    }

    // Se não tiver código de barras (fluxo padrão por fotografia de tabela), gera ID interno
    const barcode = b.barcode && String(b.barcode).trim() !== ''
      ? String(b.barcode).trim()
      : `FOTO-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const brand = b.brand ? String(b.brand).trim() : null;
    const servingQuantity = Number(b.servingGrams || b.serving_quantity) || 100;
    const servingUnit = String(b.servingSize || b.serving_unit || `${servingQuantity}g`);

    const p100 = b.per100g || {};
    const caloriesPer100 = Number(p100.calories) || 0;
    const proteinPer100 = Number(p100.protein) || 0;
    const carbsPer100 = Number(p100.carbs) || 0;
    const fatPer100 = Number(p100.fat) || 0;
    const saturatedFatPer100 = p100.saturatedFat != null ? Number(p100.saturatedFat) : null;
    const transFatPer100 = p100.transFat != null ? Number(p100.transFat) : null;
    const fiberPer100 = Number(p100.fiber) || 0;
    const sugarsPer100 = p100.sugars != null ? Number(p100.sugars) : null;
    const addedSugarsPer100 = p100.addedSugars != null ? Number(p100.addedSugars) : null;
    const sodiumPer100 = p100.sodium != null ? Number(p100.sodium) : null;

    const householdMeasure = b.householdMeasure || b.household_measure || null;
    const perPortion = b.perPortion || b.per_portion || null;
    const caloriesPerServing = Math.round((caloriesPer100 * servingQuantity) / 100);
    const dataSource = b.source || 'Banco Local';
    const verificationStatus = b.verificationStatus || 'user_confirmed';
    const confidenceScore = Number(b.confidenceScore) || 95;
    const ingredients = b.ingredients || b.ingredientsList || null;
    const imagePath = b.imageUrl || b.image_path || null;

    const provenance = b.provenance || {
      barcodeSource: 'scanner',
      nutritionSource: dataSource,
      nameSource: 'user',
      confidenceScore,
      verifiedStatus: verificationStatus,
      savedAt: new Date().toISOString(),
    };

    let savedProduct: any = null;

    // Se o banco estiver configurado, salva no Postgres com UPSERT
    if (pool) {
      const profileId = await resolveStorageProfile(req);
      let spaceId: string | null = null;
      if (profileId) {
        const spaceRes = await pool.query(
          `SELECT kitchen_space_id FROM memberships WHERE profile_id = $1 ORDER BY joined_at LIMIT 1`,
          [profileId]
        );
        spaceId = spaceRes.rows[0]?.kitchen_space_id || null;
      }
      if (!spaceId) {
        const anySpace = await pool.query(`SELECT id FROM kitchen_spaces LIMIT 1`);
        spaceId = anySpace.rows[0]?.id || '11111111-1111-1111-1111-111111111111';
      }

      // Upsert na tabela products garantindo reuso do código de barras
      const upsertSql = `
        INSERT INTO products (
          kitchen_space_id, created_by, barcode, commercial_name, brand,
          serving_quantity, serving_unit, household_measure, per_portion,
          calories_per_serving, calories_per_100, protein_per_100, carbs_per_100,
          fat_per_100, fiber_per_100, sodium_per_100, sugars_per_100, added_sugars_per_100,
          saturated_fat_per_100, trans_fat_per_100, image_path, ingredients,
          data_source, provenance, confidence_score, verification_status,
          updated_at, last_updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26,
          now(), now()
        )
        ON CONFLICT (barcode) DO UPDATE SET
          commercial_name = EXCLUDED.commercial_name,
          brand = COALESCE(EXCLUDED.brand, products.brand),
          serving_quantity = EXCLUDED.serving_quantity,
          serving_unit = EXCLUDED.serving_unit,
          household_measure = COALESCE(EXCLUDED.household_measure, products.household_measure),
          per_portion = COALESCE(EXCLUDED.per_portion, products.per_portion),
          calories_per_serving = EXCLUDED.calories_per_serving,
          calories_per_100 = EXCLUDED.calories_per_100,
          protein_per_100 = EXCLUDED.protein_per_100,
          carbs_per_100 = EXCLUDED.carbs_per_100,
          fat_per_100 = EXCLUDED.fat_per_100,
          fiber_per_100 = EXCLUDED.fiber_per_100,
          sodium_per_100 = EXCLUDED.sodium_per_100,
          sugars_per_100 = EXCLUDED.sugars_per_100,
          added_sugars_per_100 = EXCLUDED.added_sugars_per_100,
          saturated_fat_per_100 = EXCLUDED.saturated_fat_per_100,
          trans_fat_per_100 = EXCLUDED.trans_fat_per_100,
          image_path = COALESCE(EXCLUDED.image_path, products.image_path),
          ingredients = COALESCE(EXCLUDED.ingredients, products.ingredients),
          data_source = EXCLUDED.data_source,
          provenance = EXCLUDED.provenance,
          confidence_score = EXCLUDED.confidence_score,
          verification_status = EXCLUDED.verification_status,
          deleted_at = NULL,
          last_updated_at = now(),
          updated_at = now()
        RETURNING *;
      `;

      const { rows } = await pool.query(upsertSql, [
        spaceId,
        profileId || null,
        barcode,
        commercialName,
        brand,
        servingQuantity,
        servingUnit,
        householdMeasure,
        perPortion ? JSON.stringify(perPortion) : null,
        caloriesPerServing,
        caloriesPer100,
        proteinPer100,
        carbsPer100,
        fatPer100,
        fiberPer100,
        sodiumPer100,
        sugarsPer100,
        addedSugarsPer100,
        saturatedFatPer100,
        transFatPer100,
        imagePath,
        ingredients,
        dataSource,
        JSON.stringify(provenance),
        confidenceScore,
        verificationStatus,
      ]);

      savedProduct = rows[0];

      // Sincroniza também no documento app_state (customFoods) para carregar offline instantaneamente
      try {
        const stateRes = await pool.query('SELECT data FROM app_state WHERE id = $1', [STATE_ID]);
        if (stateRes.rows.length) {
          const stateData = stateRes.rows[0].data || {};
          const currentCustom = Array.isArray(stateData.customFoods) ? stateData.customFoods : [];
          const customItem = {
            id: `food-${Date.now()}`,
            name: commercialName,
            brand: brand || undefined,
            barcode: barcode || undefined,
            portionGrams: servingQuantity,
            calories: caloriesPerServing,
            protein: Number(((proteinPer100 * servingQuantity) / 100).toFixed(1)),
            carbs: Number(((carbsPer100 * servingQuantity) / 100).toFixed(1)),
            fat: Number(((fatPer100 * servingQuantity) / 100).toFixed(1)),
            fiber: Number(((fiberPer100 * servingQuantity) / 100).toFixed(1)),
            sodium: sodiumPer100 != null ? Math.round((sodiumPer100 * servingQuantity) / 100) : undefined,
            sugars: sugarsPer100 != null ? Number(((sugarsPer100 * servingQuantity) / 100).toFixed(1)) : undefined,
            saturatedFat: saturatedFatPer100 != null ? Number(((saturatedFatPer100 * servingQuantity) / 100).toFixed(1)) : undefined,
            transFat: transFatPer100 != null ? Number(((transFatPer100 * servingQuantity) / 100).toFixed(1)) : undefined,
            per100g: p100,
            householdMeasure: householdMeasure || undefined,
            source: dataSource,
            verified: true,
            confidenceScore,
            provenance,
          };
          const updatedCustom = [
            customItem,
            ...currentCustom.filter((f: any) => f.barcode !== barcode && f.name !== commercialName),
          ];
          await pool.query(
            "UPDATE app_state SET data = jsonb_set(data, '{customFoods}', $1::jsonb), updated_at = now() WHERE id = $2",
            [JSON.stringify(updatedCustom), STATE_ID]
          );
        }
      } catch (syncErr) {
        console.warn('Sincronização em app_state customFoods:', syncErr);
      }

      savedProduct = rows[0];

      // Registra no histórico de auditoria nutricional (audit trail)
      try {
        await pool.query(
          `INSERT INTO product_nutrition_history (
             product_id, changed_by, previous_values, new_values, change_reason, data_source
           ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            savedProduct.id,
            profileId || null,
            JSON.stringify({}),
            JSON.stringify(p100),
            'Cadastro / Atualização via Leitor Inteligente de Código de Barras',
            dataSource,
          ]
        );
      } catch (auditErr) {
        // Auditoria silenciosa
      }
    }

    // Retorna payload completo padronizado para o frontend
    return res.status(201).json({
      success: true,
      product: {
        barcode,
        productName: commercialName,
        brand: brand || '',
        servingSize: servingUnit,
        servingGrams: servingQuantity,
        per100g: {
          calories: caloriesPer100,
          protein: proteinPer100,
          carbs: carbsPer100,
          fat: fatPer100,
          saturatedFat: saturatedFatPer100,
          transFat: transFatPer100,
          fiber: fiberPer100,
          sugars: sugarsPer100,
          addedSugars: addedSugarsPer100,
          sodium: sodiumPer100,
        },
        imageUrl: imagePath,
        ingredients,
        source: 'Banco Local',
        verificationStatus,
        confidenceScore,
        provenance,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error('Erro ao salvar produto:', err);
    return res.status(500).json({ error: 'Erro ao salvar produto no banco: ' + (err.message || 'Erro interno') });
  }
};

app.post('/api/barcode/save-product', handleSaveProductOrFood);
app.post('/api/nutrition/save-food', handleSaveProductOrFood);

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
Você é um leitor óptico especialista em leitura de códigos de barras (EAN-13, EAN-8, UPC-A, UPC-E, Code 128) em embalagens de alimentos e produtos.
Procure na fotografia:
1. As barras pretas verticais do código de barras;
2. Os dígitos numéricos impressos diretamente abaixo ou acima das barras (geralmente uma sequência de 8, 12, 13 ou 14 dígitos, comum começar com 789 no Brasil).
Retorne SEMPRE apenas dígitos numéricos puros no campo "barcode" (remova quaisquer espaços, traços ou letras).

Formato JSON:
{
  "found": true,
  "barcode": "7891000100103",
  "productName": "Nome do produto se visível",
  "confidence": 95
}
Se realmente não houver nenhum código de barras ou números visíveis na foto, retorne:
{
  "found": false,
  "barcode": "",
  "reason": "Nenhum código de barras ou número legível na imagem"
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
