import './env';
import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

const RAW_CONNECTION_STRING = process.env.DATABASE_URL;

/**
 * node-postgres configures TLS through the `ssl` option. The libpq-only query
 * params Neon includes (`sslmode`, `channel_binding`) are stripped here so pg
 * does not print deprecation warnings for them.
 */
function normalizeConnectionString(url: string | undefined) {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('channel_binding');
    return parsed.toString();
  } catch {
    return url;
  }
}

const CONNECTION_STRING = normalizeConnectionString(RAW_CONNECTION_STRING);
const USE_SSL = /sslmode=(require|verify)/.test(RAW_CONNECTION_STRING || '');
const STATE_ID = 'mariana-kitchen';

/**
 * Postgres pool.
 *
 * The app is a long-running Node/Express server (not serverless), so the
 * recommended Neon driver is node-postgres (`pg`) with a reused pool.
 * `DATABASE_URL` is the pooled Neon connection string written by `neon deploy`.
 */
export const pool = CONNECTION_STRING
  ? new Pool({
      connectionString: CONNECTION_STRING,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      keepAlive: true,
      ssl: USE_SSL ? { rejectUnauthorized: false } : undefined,
    })
  : null;

/**
 * O Neon encerra conexões ociosas e redes móveis podem resetar o socket.
 * Sem este handler, o `error` de um cliente ocioso vira uma exceção não
 * tratada e derruba o processo inteiro. Aqui apenas registramos e deixamos o
 * pool abrir uma nova conexão na próxima consulta.
 */
if (pool) {
  pool.on('error', (err) => {
    console.error('⚠️  Conexão ociosa do Postgres caiu (o pool vai reconectar):', err.message);
  });
}

const DEFAULT_STATE = {
  user: {
    name: 'Mari',
    email: 'mari@ourlittlekitchen.app',
    calorieGoal: 1850,
    macros: {
      proteinGrams: 115,
      carbsGrams: 200,
      fatGrams: 50,
    },
    waterGoalMl: 2200,
    currentWeightKg: 58.5,
    targetWeightKg: 57.0,
    heightCm: 164,
  },
  todayLogs: [],
  historyLogs: [],
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
  customFoods: [],
  lastUpdated: new Date().toISOString(),
};

function readSeedState() {
  const seedFile = path.resolve(process.cwd(), 'data', 'mariana_kitchen_data.json');
  try {
    if (fs.existsSync(seedFile)) {
      return JSON.parse(fs.readFileSync(seedFile, 'utf-8'));
    }
  } catch (err) {
    console.warn('⚠️  Não foi possível ler o arquivo de seed, usando estado padrão.', err);
  }
  return DEFAULT_STATE;
}

let initialized = false;

export function isDatabaseConfigured() {
  return Boolean(pool);
}

/**
 * Creates the schema (idempotent) and seeds the first document from the
 * legacy JSON file when the table is still empty.
 */
export async function initDatabase() {
  if (!pool) {
    throw new Error('DATABASE_URL não configurada');
  }

  const schemaPath = path.resolve(process.cwd(), 'db', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  await pool.query(schema);

  // Garante que a tabela products possui as colunas estendidas de nutrição e conformidade ANVISA
  try {
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN
          ALTER TABLE products ADD COLUMN IF NOT EXISTS sugars_per_100 NUMERIC(7,2);
          ALTER TABLE products ADD COLUMN IF NOT EXISTS added_sugars_per_100 NUMERIC(7,2);
          ALTER TABLE products ADD COLUMN IF NOT EXISTS saturated_fat_per_100 NUMERIC(7,2);
          ALTER TABLE products ADD COLUMN IF NOT EXISTS trans_fat_per_100 NUMERIC(7,2);
          ALTER TABLE products ADD COLUMN IF NOT EXISTS ingredients TEXT;
          ALTER TABLE products ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(5,2);
          ALTER TABLE products ADD COLUMN IF NOT EXISTS provenance JSONB;
          ALTER TABLE products ADD COLUMN IF NOT EXISTS nutrition_source TEXT;
          ALTER TABLE products ADD COLUMN IF NOT EXISTS household_measure TEXT;
          ALTER TABLE products ADD COLUMN IF NOT EXISTS per_portion JSONB;

          ALTER TABLE products DROP CONSTRAINT IF EXISTS products_data_source_check;
          ALTER TABLE products ADD CONSTRAINT products_data_source_check
            CHECK (data_source IN ('Open Food Facts', 'FatSecret', 'Manual', 'Rótulo', 'IA Gemini', 'TACO/TBCA', 'Banco Local'));

          ALTER TABLE products DROP CONSTRAINT IF EXISTS products_verification_status_check;
          ALTER TABLE products ADD CONSTRAINT products_verification_status_check
            CHECK (verification_status IN ('pending', 'verified', 'rejected', 'user_confirmed'));
        END IF;
      END $$;
    `);
  } catch (err: any) {
    console.warn('Aviso ao aplicar extensões na tabela products:', err?.message || err);
  }

  const existing = await pool.query('SELECT 1 FROM app_state WHERE id = $1', [STATE_ID]);
  if (existing.rowCount === 0) {
    const seed = readSeedState();
    await pool.query(
      `INSERT INTO app_state (id, data, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [STATE_ID, JSON.stringify(seed), seed.lastUpdated || new Date().toISOString()]
    );
    console.log('🌱 Estado inicial gravado no Postgres (Neon).');
  }

  initialized = true;
}

export async function getAppState() {
  if (!pool) throw new Error('DATABASE_URL não configurada');
  const { rows } = await pool.query(
    'SELECT data FROM app_state WHERE id = $1',
    [STATE_ID]
  );
  return rows.length ? rows[0].data : null;
}

export async function saveAppState(data: unknown) {
  if (!pool) throw new Error('DATABASE_URL não configurada');

  const lastUpdated = new Date().toISOString();
  const payload = {
    ...(data as Record<string, unknown>),
    lastUpdated,
  };

  await pool.query(
    `INSERT INTO app_state (id, data, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE
       SET data = EXCLUDED.data,
           updated_at = EXCLUDED.updated_at`,
    [STATE_ID, JSON.stringify(payload), lastUpdated]
  );

  return lastUpdated;
}

export async function getDatabaseStatus() {
  if (!pool) {
    return {
      connected: false,
      error: 'DATABASE_URL não configurada',
    };
  }

  const startedAt = Date.now();
  try {
    const { rows } = await pool.query(
      `SELECT current_database() AS database,
              current_user AS username,
              version() AS version,
              (SELECT count(*)::int FROM app_state) AS state_rows`
    );
    const row = rows[0];

    return {
      connected: true,
      latencyMs: Date.now() - startedAt,
      database: row.database,
      username: row.username,
      serverVersion: String(row.version).split(',')[0],
      stateRows: row.state_rows,
      initialized,
    };
  } catch (err: any) {
    return {
      connected: false,
      latencyMs: Date.now() - startedAt,
      error: err.message || String(err),
    };
  }
}

export async function closeDatabase() {
  if (pool) {
    await pool.end();
  }
}
