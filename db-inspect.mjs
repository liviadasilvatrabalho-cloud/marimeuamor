import './env.ts';
import fs from 'fs';
import path from 'path';
import { pool } from './db.ts';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'db', 'migrations');

async function main() {
  if (!pool) throw new Error('DATABASE_URL não configurada');
  const c = await pool.connect();
  const out = {};

  try {
    // 1. Migrations: arquivos vs aplicadas
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    const applied = (await c.query('SELECT version FROM schema_migrations ORDER BY version')).rows.map((r) => r.version);
    const appliedSet = new Set(applied);
    out.migrations = {
      totalFiles: files.length,
      appliedCount: applied.length,
      pending: files.filter((f) => !appliedSet.has(f)),
      orphaned: applied.filter((v) => !files.includes(v)),
      applied,
    };

    // 2. Tabelas com RLS, índices, contagem
    const tables = (
      await c.query(`
        SELECT c.relname AS table,
               c.relrowsecurity AS rls_enabled,
               (SELECT count(*) FROM pg_index i WHERE i.indrelid = c.oid) AS indexes,
               obj_description(c.oid) AS comment
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY c.relname
      `)
    ).rows;

    out.tables = [];
    for (const t of tables) {
      let count = null;
      try {
        const r = await c.query(`SELECT count(*)::int AS n FROM "${t.table}"`);
        count = r.rows[0].n;
      } catch {}
      // colunas
      const cols = (
        await c.query(
          `SELECT column_name, data_type, is_nullable, column_default
           FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
          [t.table]
        )
      ).rows;
      out.tables.push({
        name: t.table,
        rls: t.rls_enabled,
        indexes: Number(t.indexes),
        rows: count,
        comment: t.comment,
        columns: cols,
      });
    }

    // 3. Foreign keys
    out.foreignKeys = (
      await c.query(`
        SELECT tc.table_name AS tabela, kcu.column_name AS coluna,
               ccu.table_name AS ref_tabela, ccu.column_name AS ref_coluna,
               rc.delete_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
        ORDER BY tc.table_name, kcu.column_name
      `)
    ).rows;

    // 4. Unique constraints / check
    out.constraints = (
      await c.query(`
        SELECT conrelid::regclass::text AS tabela, conname, pg_get_constraintdef(oid) AS def
        FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND contype IN ('u','c','p','f')
        ORDER BY conrelid::regclass::text, conname
      `)
    ).rows;

    // 5. Políticas RLS
    out.policies = (
      await c.query(`
        SELECT polrelid::regclass::text AS tabela, polname,
               CASE polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                           WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE polcmd::text END AS cmd,
               pg_get_expr(polqual, polrelid) AS using_clause,
               pg_get_expr(polwithcheck, polrelid) AS with_check
        FROM pg_policy ORDER BY polrelid::regclass::text, polname
      `)
    ).rows;

    // 6. Funções
    out.functions = (
      await c.query(`
        SELECT p.proname AS nome, pg_get_function_result(p.oid) AS retorno,
               pg_get_function_arguments(p.oid) AS argumentos
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
        ORDER BY p.proname
      `)
    ).rows;

    // 7. Triggers
    out.triggers = (
      await c.query(`
        SELECT tgrelid::regclass::text AS tabela, tgname,
               pg_get_triggerdef(tg.oid) AS def
        FROM pg_trigger tg WHERE NOT tgisinternal
        ORDER BY tgrelid::regclass::text, tgname
      `)
    ).rows;

    // 8. Índices
    out.indexes = (
      await c.query(`
        SELECT tablename, indexname, indexdef FROM pg_indexes
        WHERE schemaname = 'public' ORDER BY tablename, indexname
      `)
    ).rows;

    // 9. Views
    out.views = (
      await c.query(`
        SELECT viewname, definition FROM pg_views
        WHERE schemaname = 'public' ORDER BY viewname
      `)
    ).rows;

    // 10. Seeds / contagens-chave
    out.spaces = (await c.query('SELECT id, name, slug FROM kitchen_spaces')).rows;
    out.profiles = (await c.query('SELECT id, name, email, role FROM profiles')).rows;
    out.memberships = (await c.query('SELECT kitchen_space_id, profile_id, role_in_space FROM memberships')).rows;
    out.householdMeasures = (await c.query('SELECT count(*)::int AS n FROM household_measures')).rows[0].n;

    console.log(JSON.stringify(out, null, 2));
    fs.writeFileSync(path.resolve(process.cwd(), 'db-status.json'), JSON.stringify(out, null, 2), 'utf8');
    console.error('escrito em db-status.json');
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
