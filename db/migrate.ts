import '../env';
import fs from 'fs';
import path from 'path';
import { pool } from '../db';

/**
 * Runner de migrations versionadas.
 *
 * - Lê db/migrations/*.sql em ordem lexicográfica.
 * - Registra cada versão aplicada em schema_migrations.
 * - Executa cada arquivo dentro de uma transação.
 * - É idempotente: migrations já registradas são ignoradas.
 */
export async function runMigrations() {
  if (!pool) throw new Error('DATABASE_URL não configurada');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const dir = path.resolve(process.cwd(), 'db', 'migrations');
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const { rows } = await pool.query<{ version: string }>('SELECT version FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.version));

  const results: Array<{ version: string; status: 'applied' | 'skipped' }> = [];

  for (const file of files) {
    if (applied.has(file)) {
      results.push({ version: file, status: 'skipped' });
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
      results.push({ version: file, status: 'applied' });
      console.log(`✅ migration aplicada: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`❌ falha na migration ${file}:`, err);
      throw err;
    } finally {
      client.release();
    }
  }

  return results;
}

const isDirectRun = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('db/migrate.ts');

if (isDirectRun) {
  runMigrations()
    .then((results) => {
      const applied = results.filter((r) => r.status === 'applied').length;
      console.log(`\nMigrations: ${applied} aplicada(s), ${results.length - applied} já existente(s).`);
      return pool?.end();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
