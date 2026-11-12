import './env.ts';
import fs from 'fs';
import path from 'path';
import { pool } from './db.ts';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'db', 'migrations');

async function main() {
  if (!pool) {
    console.error('DATABASE_URL não configurada. Execute `neon deploy` ou defina DATABASE_URL no .env.local');
    process.exit(1);
  }

  // Tabela de controle de migrations aplicadas
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const { rows: applied } = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
  const appliedSet = new Set(applied.map((r) => r.version));

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let appliedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`⏭️  ${file} já aplicada`);
      skippedCount++;
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`✅  ${file} aplicada`);
      appliedCount++;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`❌  Falha ao aplicar ${file}:`, err.message);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(`\n📊 Migrations: ${appliedCount} aplicadas, ${skippedCount} já aplicadas, ${files.length} total`);
  await pool.end();
}

main().catch((err) => {
  console.error('Erro nas migrations:', err);
  process.exit(1);
});
