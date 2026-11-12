import './env.ts';
import { pool } from './db.ts';

async function main() {
  if (!pool) throw new Error('DATABASE_URL não configurada');

  const client = await pool.connect();
  try {
    console.log('=== TABELAS CRIADAS ===');
    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE'
      ORDER BY table_name
    `);
    console.log(tables.rows.map(r => r.table_name).join('\n'));

    console.log('\n=== SEED: kitchen_spaces ===');
    console.log((await client.query('SELECT id, name, slug FROM kitchen_spaces')).rows);

    console.log('\n=== SEED: profiles ===');
    console.log((await client.query('SELECT id, name, email, role FROM profiles')).rows);

    console.log('\n=== SEED: memberships ===');
    console.log((await client.query('SELECT kitchen_space_id, profile_id, role_in_space FROM memberships')).rows);

    console.log('\n=== SEED: household_measures ===');
    console.log((await client.query('SELECT id, name, short_label FROM household_measures ORDER BY name')).rows);

    console.log('\n=== FUNÇÕES SQL ===');
    const funcs = await client.query(`
      SELECT proname FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND proname LIKE 'trg_%' OR proname IN ('set_updated_at','calc_food_portion','calc_recipe_ingredient','calc_meal_totals','current_profile_id','current_profile_role','current_kitchen_space_ids','is_space_admin')
      ORDER BY proname
    `);
    console.log(funcs.rows.map(r => r.proname).join('\n'));

    console.log('\n=== POLÍTICAS RLS ===');
    const policies = await client.query(`
      SELECT polname, polrelid::regclass AS tabela, polcmd
      FROM pg_policy ORDER BY polrelid::regclass::text, polname
    `);
    console.log(policies.rows.map(r => `${r.tabela} | ${r.polname} | cmd=${r.polcmd}`).join('\n'));

    console.log('\n=== TRIGGERS ===');
    const triggers = await client.query(`
      SELECT tgname, tgrelid::regclass AS tabela FROM pg_trigger
      WHERE NOT tgisinternal ORDER BY tgrelid::regclass::text, tgname
    `);
    console.log(triggers.rows.map(r => `${r.tabela} | ${r.tgname}`).join('\n'));

    console.log('\n=== MIGRATIONS APLICADAS ===');
    const mig = await client.query('SELECT version FROM schema_migrations ORDER BY version');
    console.log(mig.rows.map(r => r.version).join('\n'));

    // Teste de cálculo nutricional
    console.log('\n=== TESTE calc_food_portion (cottage 50g, 74kcal/100g) ===');
    const calc = await client.query(`SELECT calc_food_portion(50, 74, NULL, NULL, NULL, NULL) AS resultado`);
    console.log(calc.rows[0].resultado);

    // Verifica isolamento: apenas 2 perfis no espaço
    console.log('\n=== CONTAGEM perfis no espaço Nossa Cozinha ===');
    const cnt = await client.query(`
      SELECT count(*) FROM profiles p
      JOIN memberships m ON m.profile_id = p.id
      WHERE m.kitchen_space_id = (SELECT id FROM kitchen_spaces WHERE slug='nossa-cozinha')
    `);
    console.log(`Perfis no espaço: ${cnt.rows[0].count}`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
