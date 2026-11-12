// Função serverless do Vercel — exporta o app Express do server.ts
// Roda todas as rotas /api/* (Gemini, storage, barcode, sync...)
import app from '../server';
import { initDatabase } from '../db';

// Inicializa o banco uma vez por cold start (idempotente)
const dbReady = initDatabase().catch((err: any) => {
  console.warn('⚠️ initDatabase falhou (seguindo mesmo assim):', err?.message || err);
});

const handler = async (req: any, res: any) => {
  await dbReady;
  return app(req, res);
};

export default handler;
