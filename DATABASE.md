# DATABASE.md — Our Little Kitchen

Camada de dados do Our Little Kitchen sobre **Neon Postgres (Lakebase Postgres)**.

Este documento descreve o esquema completo, os relacionamentos, as migrations versionadas,
as políticas de segurança (RLS), as funções e triggers SQL, as regras de cálculo nutricional,
as integrações e os itens que ainda dependem de credenciais externas.

> **Estado:** 20/20 migrations aplicadas · 26 tabelas · 52 chaves estrangeiras ·
> 67 políticas RLS · 20 funções SQL · 16 triggers · 4 itens externos pendentes
> (seção 14).

---

## 1. Sumário executivo

| Área | Situação |
|---|---|
| Banco | Neon Postgres, branch `production`, projeto `snowy-scene-92047823` |
| Migrations | 19 arquivos em `db/migrations/`, todas aplicadas, rastreadas em `schema_migrations` |
| Tabelas | 26 (24 com RLS ativo) |
| Relacionamentos | 52 FKs (`CASCADE` para dono de espaço, `SET NULL` para autor/registrador) |
| Segurança | RLS ativo em 24 tabelas, 67 políticas (SELECT/INSERT/UPDATE/DELETE) |
| SQL | 20 funções (cálculo nutricional + helpers de autorização) e 16 triggers |
| API | 73 rotas REST normalizadas em `src/api.ts` + 7 rotas legadas em `server.ts` |
| Legado | Tabela `app_state` (JSONB) preservada — é o caminho de dados atual do frontend |

---

## 2. Conexão e configuração

| Variável | Onde | Uso |
|---|---|---|
| `DATABASE_URL` | `.env.local` (gitignored) | Pool do app (`db.ts`, driver `pg`) |
| `DATABASE_URL_UNPOOLED` | `.env.local` | Migrations, dumps e tarefas de longa duração |
| `NEON_BRANCH` | `.env.local` | `production` |

O `db.ts` normaliza a string (remove `sslmode`/`channel_binding` para evitar warnings do `pg`)
e habilita TLS quando a URL indica `sslmode=require|verify`.

**Driver:** `node-postgres` (`pg`) com pool reutilizado (`max: 10`, idle 30 s, timeout 10 s) —
o servidor é um processo Express de longa duração, não serverless.

**Arquivos de configuração:**

- `.env.local` — valores reais (gitignored)
- `.env.example` — modelo sem credenciais
- `env.ts` — carrega `.env.local` e `.env` via `dotenv`
- `.neon` — vínculo do projeto Neon (org, projeto, branch)
- `neon.ts` — configuração Neon (`auth: false` no arquivo; o serviço de Auth está habilitado no projeto, mas o login ativo é por PIN)

---

## 3. Migrations versionadas

Diretório: `db/migrations/` · Runner: `db/migrate.ts` (`npm run db:migrate`) · Controle: tabela `schema_migrations`.

```powershell
npm run db:migrate             # aplica pendentes (idempotente, transacional)
npm run test:db                # suíte de integração (servidor precisa estar rodando)
npx tsx db-inspect.mjs         # gera db-status.json com o estado real
npx tsx verify-db.mjs          # resumo rápido de tabelas, seeds, funções e RLS
```

Cada migration roda em `BEGIN`/`COMMIT` próprio e só é marcada após o sucesso.
A chave é o **nome do arquivo**, então reaplicar é seguro. O `server.ts` não
aplica migrations automaticamente — rode `npm run db:migrate` antes de subir
uma versão nova.

| # | Arquivo | Conteúdo |
|---|---|---|
| 001 | `001_kitchen_spaces_profiles_memberships.sql` | Espaços, perfis, memberships |
| 002 | `002_foods.sql` | Alimentos + histórico de nutrição |
| 003 | `003_products_barcodes.sql` | Produtos, código de barras, histórico |
| 004 | `004_household_measures.sql` | Medidas caseiras + conversões |
| 005 | `005_recipes.sql` | Receitas + ingredientes |
| 006 | `006_marmitas.sql` | Marmitas + itens |
| 007 | `007_meals.sql` | Refeições + itens |
| 008 | `008_image_analyses.sql` | Análises de imagem por IA |
| 009 | `009_orders.sql` | Pedidos + histórico de status |
| 010 | `010_shopping_lists.sql` | Listas de compra + itens |
| 011 | `011_storage_buckets_metadata.sql` | Buckets e arquivos (metadados) |
| 012 | `012_nutrition_functions.sql` | Funções de cálculo nutricional |
| 013 | `013_updated_at_triggers.sql` | Triggers `updated_at` e de recálculo |
| 014 | `014_rls_policies.sql` | Políticas RLS em todas as tabelas |
| 015 | `015_seed_data.sql` | Espaço, perfis (Lívia/Mariana), medidas caseiras |
| 016a | `016_integration_hardening.sql` | Endurecimento: índices únicos, integridade, sync |
| 016b | `016_marmita_status_publicada.sql` | Inclui `publicada` no status de marmita |
| 017 | `017_recipe_totals_per_serving.sql` | Totais de receita por porção |
| 018 | `018_test_fixes.sql` | Correções de teste: `calc_recipe_ingredient`, triggers órfãos, `SECURITY DEFINER` |
| 019 | `019_storage_profiles_rls.sql` | RLS de arquivos por espaço e criação de perfis restrita a admin |

> **Nota sobre o prefixo duplicado `016`:** existem dois arquivos iniciados por `016`
> (`016_integration_hardening.sql` e `016_marmita_status_publicada.sql`).
> Como o runner usa o **nome completo** como chave, ambos são rastreados e aplicados
> corretamente — não há conflito. Renomear exige também atualizar `schema_migrations`,
> por isso foi mantido como está.

### 018 — correções apontadas pelos testes

1. `calc_recipe_ingredient` acessava um `RECORD` não atribuído quando o ingrediente era
   alimento (sem produto). Reescrita com variáveis escalares.
2. Triggers `trg_*_updated_at` criados genericamente em tabelas **sem** coluna `updated_at`
   (ex.: `shopping_list_items`) quebravam `UPDATE`s. Remoção dinâmica.
3. Funções de autorização usadas pelas políticas RLS precisam ser `SECURITY DEFINER`
   para não recursarem na própria policy de `memberships`.

---

## 4. Estrutura das tabelas

26 tabelas, agrupadas por domínio. Cada seção lista colunas, FKs, índices, políticas RLS e triggers.

<!-- INICIO SCHEMA GERADO -->

### Identidade

#### `kitchen_spaces` — 1 linha(s), 2 índice(s), RLS **ativo**

> Espaço de cozinha compartilhado entre usuários (ex: Lívia e Mariana).

| Coluna | Tipo | Null | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `name` | `text` | não | `'Nossa Cozinha'::text` |
| `slug` | `text` | não | `'nossa-cozinha'::text` |
| `created_at` | `timestamptz` | não | `now()` |
| `updated_at` | `timestamptz` | não | `now()` |

**Índices:**

- `kitchen_spaces_pkey`
- `kitchen_spaces_slug_key`

**Políticas RLS (1):** SELECT

**Triggers:** `trg_kitchen_spaces_updated_at`

#### `memberships` — 2 linha(s), 4 índice(s), RLS **ativo**

> Vincula perfis a espaços compartilhados, definindo papel dentro do espaço.

| Coluna | Tipo | Null | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `kitchen_space_id` | `uuid` | não | — |
| `profile_id` | `uuid` | não | — |
| `role_in_space` | `text` | não | `'member'::text` |
| `joined_at` | `timestamptz` | não | `now()` |

**Chave estrangeira:**

- `kitchen_space_id` → `kitchen_spaces.id` (`CASCADE`)
- `profile_id` → `profiles.id` (`CASCADE`)

**Índices:**

- `idx_memberships_profile`
- `idx_memberships_space`
- `memberships_kitchen_space_id_profile_id_key`
- `memberships_pkey`

**Políticas RLS (2):** INSERT, SELECT

#### `profile_sessions` — 0 linha(s), 4 índice(s), RLS **ativo**

> Sessões opacas de perfil. Apenas o hash SHA-256 do token é armazenado.

| Coluna | Tipo | Null | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `profile_id` | `uuid` | não | — |
| `token_hash` | `text` | não | — |
| `user_agent` | `text` | sim | — |
| `ip_address` | `text` | sim | — |
| `created_at` | `timestamptz` | não | `now()` |
| `expires_at` | `timestamptz` | não | — |
| `revoked_at` | `timestamptz` | sim | — |

**Chave estrangeira:**

- `profile_id` → `profiles.id` (`CASCADE`)

**Índices:**

- `idx_profile_sessions_expires`
- `idx_profile_sessions_profile`
- `profile_sessions_pkey`
- `profile_sessions_token_hash_key`

**Políticas RLS (1):** SELECT

#### `profiles` — 2 linha(s), 5 índice(s), RLS **ativo**

> Perfis de usuário com metadados nutricionais e papel (admin/user).

| Coluna | Tipo | Null | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `auth_user_id` | `uuid` | sim | — |
| `name` | `text` | não | — |
| `email` | `text` | não | — |
| `role` | `text` | não | `'user'::text` |
| `calorie_goal` | `int` | sim | — |
| `protein_goal_g` | `int` | sim | — |
| `carbs_goal_g` | `int` | sim | — |
| `fat_goal_g` | `int` | sim | — |
| `water_goal_ml` | `int` | sim | — |
| `current_weight_kg` | `numeric` | sim | — |
| `target_weight_kg` | `numeric` | sim | — |
| `height_cm` | `int` | sim | — |
| `diet_preference` | `text` | sim | — |
| `created_at` | `timestamptz` | não | `now()` |
| `updated_at` | `timestamptz` | não | `now()` |
| `pin_hash` | `text` | sim | — |

**Índices:**

- `idx_profiles_auth_user`
- `idx_profiles_email`
- `profiles_auth_user_id_key`
- `profiles_email_key`
- `profiles_pkey`

**Políticas RLS (3):** INSERT, SELECT, UPDATE

**Triggers:** `trg_profiles_updated_at`


### Catálogo

#### `food_household_conversions` — 0 linha(s), 4 índice(s), RLS **ativo**

> Conversão de medida caseira para gramas/ml, específica a cada alimento.

| Coluna | Tipo | Null | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `food_id` | `uuid` | não | — |
| `household_measure_id` | `uuid` | não | — |
| `grams` | `numeric` | não | — |
| `milliliters` | `numeric` | sim | — |
| `estimation_method` | `text` | sim | — |
| `conversion_origin` | `text` | sim | — |

**Chave estrangeira:**

- `food_id` → `foods.id` (`CASCADE`)
- `household_measure_id` → `household_measures.id` (`CASCADE`)

**Índices:**

- `food_household_conversions_food_id_household_measure_id_key`
- `food_household_conversions_pkey`
- `idx_food_household_conversions_food`
- `idx_food_household_conversions_measure`

**Políticas RLS (4):** DELETE, INSERT, SELECT, UPDATE

#### `food_nutrition_history` — 0 linha(s), 3 índice(s), RLS **ativo**

> Audit trail de alterações nutricionais de alimentos (antes/depois).

| Coluna | Tipo | Null | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `food_id` | `uuid` | não | — |
| `changed_by` | `uuid` | sim | — |
| `previous_values` | `jsonb` | não | — |
| `new_values` | `jsonb` | não | — |
| `change_reason` | `text` | sim | — |
| `data_source` | `text` | sim | — |
| `changed_at` | `timestamptz` | não | `now()` |

**Chave estrangeira:**

- `changed_by` → `profiles.id` (`SET NULL`)
- `food_id` → `foods.id` (`CASCADE`)

**Índices:**

- `food_nutrition_history_pkey`
- `idx_food_nutrition_history_changed_at`
- `idx_food_nutrition_history_food`

**Políticas RLS (1):** SELECT

#### `foods` — 2 linha(s), 9 índice(s), RLS **ativo**

> Tabela principal de alimentos com valores nutricionais por 100g e procedência.

| Coluna | Tipo | Null | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `kitchen_space_id` | `uuid` | não | — |
| `created_by` | `uuid` | sim | — |
| `name` | `text` | não | — |
| `alternative_name` | `text` | sim | — |
| `brand` | `text` | sim | — |
| `category` | `text` | não | — |
| `description` | `text` | sim | — |
| `prep_state` | `text` | não | `'cru'::text` |
| `reference_unit` | `text` | não | `'100g'::text` |
| `calories_per_100g` | `numeric` | sim | — |
| `protein_per_100g` | `numeric` | sim | — |
| `carbs_per_100g` | `numeric` | sim | — |
| `fat_total_per_100g` | `numeric` | sim | — |
| `fat_saturated_per_100g` | `numeric` | sim | — |
| `fiber_per_100g` | `numeric` | sim | — |
| `sugars_per_100g` | `numeric` | sim | — |
| `sodium_per_100g` | `numeric` | sim | — |
| `nutrition_source` | `text` | não | `'Manual'::text` |
| `data_origin` | `text` | não | — |
| `verification_status` | `text` | não | `'pending'::text` |
| `verified_by` | `uuid` | sim | — |
| `verified_at` | `timestamptz` | sim | — |
| `deleted_at` | `timestamptz` | sim | — |
| `created_at` | `timestamptz` | não | `now()` |
| `updated_at` | `timestamptz` | não | `now()` |
| `updated_by` | `uuid` | sim | — |
| `external_id` | `text` | sim | — |

**Chave estrangeira:**

- `created_by` → `profiles.id` (`SET NULL`)
- `kitchen_space_id` → `kitchen_spaces.id` (`CASCADE`)
- `updated_by` → `profiles.id` (`SET NULL`)
- `verified_by` → `profiles.id` (`SET NULL`)

**Índices:**

- `foods_pkey`
- `idx_foods_category`
- `idx_foods_created_by`
- `idx_foods_deleted_at`
- `idx_foods_name`
- `idx_foods_space`
- `idx_foods_unique_name_space`
- `uq_foods_dedupe`
- `uq_foods_external`

**Políticas RLS (4):** DELETE, INSERT, SELECT, UPDATE

**Triggers:** `trg_foods_nutrition_history`, `trg_foods_updated_at`

#### `household_measures` — 10 linha(s), 1 índice(s), RLS **ativo**

> Catálogo de medidas caseiras (colher de sopa, xícara, copo, unidade, fatia, etc.).

| Coluna | Tipo | Null | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `name` | `text` | não | — |
| `short_label` | `text` | sim | — |
| `typical_volume_ml` | `numeric` | sim | — |
| `description` | `text` | sim | — |
| `visual_icon` | `text` | sim | — |
| `created_at` | `timestamptz` | não | `now()` |

**Índices:**

- `household_measures_pkey`

#### `product_nutrition_history` — 0 linha(s), 3 índice(s), RLS **ativo**

> Audit trail de alterações nutricionais de produtos.

| Coluna | Tipo | Null | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `product_id` | `uuid` | não | — |
| `changed_by` | `uuid` | sim | — |
| `previous_values` | `jsonb` | não | — |
| `new_values` | `jsonb` | não | — |
| `change_reason` | `text` | sim | — |
| `data_source` | `text` | sim | — |
| `changed_at` | `timestamptz` | não | `now()` |

**Chave estrangeira:**

- `changed_by` → `profiles.id` (`SET NULL`)
- `product_id` → `products.id` (`CASCADE`)

**Índices:**

- `idx_product_nutrition_history_changed_at`
- `idx_product_nutrition_history_product`
- `product_nutrition_history_pkey`

**Políticas RLS (1):** SELECT

#### `products` — 1 linha(s), 7 índice(s), RLS **ativo**

> Produtos industrializados com código de barras e valores nutricionais.

| Coluna | Tipo | Null | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `kitchen_space_id` | `uuid` | não | — |
| `created_by` | `uuid` | sim | — |
| `barcode` | `text` | não | — |
| `commercial_name` | `text` | não | — |
| `brand` | `text` | sim | — |
| `manufacturer` | `text` | sim | — |
| `category` | `text` | sim | — |
| `description` | `text` | sim | — |
| `image_path` | `text` | sim | — |
| `package_size` | `text` | sim | — |
| `serving_quantity` | `numeric` | sim | — |
| `serving_unit` | `text` | sim | — |
| `calories_per_serving` | `numeric` | sim | — |
| `calories_per_100` | `numeric` | sim | — |
| `protein_per_100` | `numeric` | sim | — |
| `carbs_per_100` | `numeric` | sim | — |
| `fat_per_100` | `numeric` | sim | — |
| `fiber_per_100` | `numeric` | sim | — |
| `sodium_per_100` | `numeric` | sim | — |
| `data_source` | `text` | não | `'Manual'::text` |
| `last_updated_at` | `timestamptz` | não | `now()` |
| `verification_status` | `text` | não | `'pending'::text` |
| `deleted_at` | `timestamptz` | sim | — |
| `created_at` | `timestamptz` | não | `now()` |
| `updated_at` | `timestamptz` | não | `now()` |
| `updated_by` | `uuid` | sim | — |
| `external_id` | `text` | sim | — |

**Chave estrangeira:**

- `created_by` → `profiles.id` (`SET NULL`)
- `kitchen_space_id` → `kitchen_spaces.id` (`CASCADE`)
- `updated_by` → `profiles.id` (`SET NULL`)

**Índices:**

- `idx_products_barcode`
- `idx_products_created_by`
- `idx_products_deleted_at`
- `idx_products_space`
- `products_barcode_key`
- `products_pkey`
- `uq_products_external`

**Políticas RLS (4):** DELETE, INSERT, SELECT, UPDATE

**Triggers:** `trg_products_updated_at`


### Planejamento

#### `marmita_items` — 6 linha(s), 3 índice(s), RLS **ativo**

> Composição de uma marmita com valores nutricionais congelados no preparo.

| Coluna | Tipo | Null | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `marmita_id` | `uuid` | não | — |
| `food_id` | `uuid` | sim | — |
| `weight_grams` | `numeric` | não | — |
| `calories` | `numeric` | sim | — |
| `protein` | `numeric` | sim | — |
| `carbs` | `numeric` | sim | — |
| `fat` | `numeric` | sim | — |
| `fiber` | `numeric` | sim | — |
| `created_at` | `timestamptz` | não | `now()` |

**Chave estrangeira:**

- `food_id` → `foods.id` (`SET NULL`)
- `marmita_id` → `marmitas.id` (`CASCADE`)

**Índices:**

- `idx_marmita_items_food`
- `idx_marmita_items_marmita`
- `marmita_items_pkey`

**Políticas RLS (4):** DELETE, INSERT, SELECT, UPDATE

**Triggers:** `trg_marmita_items_totals`

#### `marmitas` — 3 linha(s), 8 índice(s), RLS **ativo**

> Marmitas com data de preparo, validade, responsável e valores nutricionais do momento.

| Coluna | Tipo | Null | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `kitchen_space_id` | `uuid` | não | — |
| `prepared_by` | `uuid` | não | — |
| `recipient_id` | `uuid` | sim | — |
| `name` | `text` | não | — |
| `description` | `text` | sim | — |
| `photo_path` | `text` | sim | — |
| `prep_date` | `date` | sim | — |
| `expiry_date` | `date` | sim | — |
| `status` | `text` | não | `'preparada'::text` |
| `total_calories` | `numeric` | sim | — |
| `total_protein` | `numeric` | sim | — |
| `total_carbs` | `numeric` | sim | — |
| `total_fat` | `numeric` | sim | — |
| `total_fiber` | `numeric` | sim | — |
| `deleted_at` | `timestamptz` | sim | — |
| `created_at` | `timestamptz` | não | `now()` |
| `updated_at` | `timestamptz` | não | `now()` |
| `updated_by` | `uuid` | sim | — |
| `external_id` | `text` | sim | — |

**Chave estrangeira:**

- `kitchen_space_id` → `kitchen_spaces.id` (`CASCADE`)
- `prepared_by` → `profiles.id` (`SET NULL`)
- `recipient_id` → `profiles.id` (`SET NULL`)
- `updated_by` → `profiles.id` (`SET NULL`)

**Índices:**

- `idx_marmitas_deleted_at`
- `idx_marmitas_prep_date`
- `idx_marmitas_prepared_by`
- `idx_marmitas_recipient`
- `idx_marmitas_space`
- `idx_marmitas_status`
- `marmitas_pkey`
- `uq_marmitas_external`

**Políticas RLS (4):** DELETE, INSERT, SELECT, UPDATE

**Triggers:** `trg_marmitas_updated_at`

#### `recipe_ingredients` — 8 linha(s), 4 índice(s), RLS **ativo**

> Ingredientes de uma receita com peso em gramas e macros calculados.

| Coluna | Tipo | Null | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `recipe_id` | `uuid` | não | — |
| `food_id` | `uuid` | sim | — |
| `product_id` | `uuid` | sim | — |
| `quantity` | `numeric` | não | — |
| `unit` | `text` | não | — |
| `weight_grams` | `numeric` | não | — |
| `calories` | `numeric` | sim | — |
| `protein` | `numeric` | sim | — |
| `carbs` | `numeric` | sim | — |
| `fat` | `numeric` | sim | — |
| `fiber` | `numeric` | sim | — |
| `created_at` | `timestamptz` | não | `now()` |
| `updated_at` | `timestamptz` | não | `now()` |

**Chave estrangeira:**

- `food_id` → `foods.id` (`SET NULL`)
- `product_id` → `products.id` (`SET NULL`)
- `recipe_id` → `recipes.id` (`CASCADE`)

**Índices:**

- `idx_recipe_ingredients_food`
- `idx_recipe_ingredients_product`
- `idx_recipe_ingredients_recipe`
- `recipe_ingredients_pkey`

**Políticas RLS (4):** DELETE, INSERT, SELECT, UPDATE

**Triggers:** `trg_recipe_ingredients_totals`, `trg_recipe_ingredients_updated_at`

#### `recipes` — 3 linha(s), 6 índice(s), RLS **ativo**

> Receitas com status (sugerida/aprovada/publicada/arquivada) e valores nutricionais por porção.

| Coluna | Tipo | Null | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `kitchen_space_id` | `uuid` | não | — |
| `author_id` | `uuid` | não | — |
| `title` | `text` | não | — |
| `description` | `text` | sim | — |
| `photo_path` | `text` | sim | — |
| `instructions` | `text` | sim | — |
| `servings` | `int` | não | `1` |
| `prep_time_minutes` | `int` | sim | — |
| `status` | `text` | não | `'sugerida'::text` |
| `calories_per_serving` | `numeric` | sim | — |
| `protein_per_serving` | `numeric` | sim | — |
| `carbs_per_serving` | `numeric` | sim | — |
| `fat_per_serving` | `numeric` | sim | — |
| `fiber_per_serving` | `numeric` | sim | — |
| `is_favorite` | `boolean` | sim | `false` |
| `carinho_tip` | `text` | sim | — |
| `deleted_at` | `timestamptz` | sim | — |
| `created_at` | `timestamptz` | não | `now()` |
| `updated_at` | `timestamptz` | não | `now()` |
| `updated_by` | `uuid` | sim | — |
| `external_id` | `text` | sim | — |

**Chave estrangeira:**

- `author_id` → `profiles.id` (`SET NULL`)
- `kitchen_space_id` → `kitchen_spaces.id` (`CASCADE`)
- `updated_by` → `profiles.id` (`SET NULL`)

**Índices:**

- `idx_recipes_author`
- `idx_recipes_deleted_at`
- `idx_recipes_space`
- `idx_recipes_status`
- `recipes_pkey`
- `uq_recipes_external`

**Políticas RLS (4):** DELETE, INSERT, SELECT, UPDATE

**Triggers:** `trg_recipes_updated_at`


### Refeições

#### `image_analyses` — 0 linha(s), 7 índice(s), RLS **ativo**

> Resultado do reconhecimento de imagem: análise original e resultado corrigido separados.

| Coluna | Tipo | Null | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `kitchen_space_id` | `uuid` | não | — |
| `user_id` | `uuid` | não | — |
| `original_photo_path` | `text` | não | — |
| `analysis_date` | `timestamptz` | não | `now()` |
| `identified_ingredients` | `jsonb` | sim | — |
| `estimated_quantities` | `jsonb` | sim | — |
| `estimated_nutrition` | `jsonb` | sim | — |
| `confidence_level` | `int` | sim | — |
| `ai_model` | `text` | sim | — |
| `status` | `text` | não | `'pendente'::text` |
| `user_corrections` | `jsonb` | sim | — |
| `final_result` | `jsonb` | sim | — |
| `meal_id` | `uuid` | sim | — |
| `created_at` | `timestamptz` | não | `now()` |
| `updated_at` | `timestamptz` | não | `now()` |
| `external_id` | `text` | sim | — |

**Chave estrangeira:**

- `kitchen_space_id` → `kitchen_spaces.id` (`CASCADE`)
- `meal_id` → `meals.id` (`SET NULL`)
- `user_id` → `profiles.id` (`SET NULL`)

**Índices:**

- `idx_image_analyses_analysis_date`
- `idx_image_analyses_meal`
- `idx_image_analyses_space`
- `idx_image_analyses_status`
- `idx_image_analyses_user`
- `image_analyses_pkey`
- `uq_image_analyses_external`

**Políticas RLS (4):** DELETE, INSERT, SELECT, UPDATE

**Triggers:** `trg_image_analyses_updated_at`

#### `meal_items` — 1 linha(s), 4 índice(s), RLS **ativo**

> Itens de uma refeição associados a alimento ou produto com peso utilizado.

| Coluna | Tipo | Null | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `meal_id` | `uuid` | não | — |
| `food_id` | `uuid` | sim | — |
| `product_id` | `uuid` | sim | — |
| `weight_grams` | `numeric` | não | — |
| `calories` | `numeric` | sim | — |
| `protein` | `numeric` | sim | — |
| `carbs` | `numeric` | sim | — |
| `fat` | `numeric` | sim | — |
| `fiber` | `numeric` | sim | — |
| `source` | `text` | sim | — |
| `verified` | `boolean` | sim | `false` |
| `created_at` | `timestamptz` | não | `now()` |

**Chave estrangeira:**

- `food_id` → `foods.id` (`SET NULL`)
- `meal_id` → `meals.id` (`CASCADE`)
- `product_id` → `products.id` (`SET NULL`)

**Índices:**

- `idx_meal_items_food`
- `idx_meal_items_meal`
- `idx_meal_items_product`
- `meal_items_pkey`

**Políticas RLS (4):** DELETE, INSERT, SELECT, UPDATE

**Triggers:** `trg_meal_items_totals`

#### `meals` — 1 linha(s), 7 índice(s), RLS **ativo**

> Refeições registradas com método de identificação e grau de confiança.

| Coluna | Tipo | Null | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `kitchen_space_id` | `uuid` | não | — |
| `user_id` | `uuid` | não | — |
| `meal_date` | `date` | não | — |
| `meal_type` | `text` | não | — |
| `title` | `text` | sim | — |
| `photo_path` | `text` | sim | — |
| `identification_method` | `text` | não | — |
| `confidence_level` | `int` | sim | — |
| `confidence_notes` | `text` | sim | — |
| `total_calories` | `numeric` | sim | — |
| `total_protein` | `numeric` | sim | — |
| `total_carbs` | `numeric` | sim | — |
| `total_fat` | `numeric` | sim | — |
| `total_fiber` | `numeric` | sim | — |
| `deleted_at` | `timestamptz` | sim | — |
| `created_at` | `timestamptz` | não | `now()` |
| `updated_at` | `timestamptz` | não | `now()` |
| `updated_by` | `uuid` | sim | — |
| `external_id` | `text` | sim | — |

**Chave estrangeira:**

- `kitchen_space_id` → `kitchen_spaces.id` (`CASCADE`)
- `updated_by` → `profiles.id` (`SET NULL`)
- `user_id` → `profiles.id` (`SET NULL`)

**Índices:**

- `idx_meals_date`
- `idx_meals_deleted_at`
- `idx_meals_meal_type`
- `idx_meals_space`
- `idx_meals_user`
- `meals_pkey`
- `uq_meals_external`

**Políticas RLS (4):** DELETE, INSERT, SELECT, UPDATE

**Triggers:** `trg_meals_updated_at`


### Operação

#### `order_status_history` — 0 linha(s), 3 índice(s), RLS **ativo**

> Audit trail de mudanças de status dos pedidos.

| Coluna | Tipo | Null | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `order_id` | `uuid` | não | — |
| `previous_status` | `text` | sim | — |
| `new_status` | `text` | não | — |
| `changed_by` | `uuid` | sim | — |
| `changed_at` | `timestamptz` | não | `now()` |

**Chave estrangeira:**

- `changed_by` → `profiles.id` (`SET NULL`)
- `order_id` → `orders.id` (`CASCADE`)

**Índices:**

- `idx_order_status_history_changed_at`
- `idx_order_status_history_order`
- `order_status_history_pkey`

**Políticas RLS (2):** INSERT, SELECT

#### `orders` — 1 linha(s), 6 índice(s), RLS **ativo**

> Solicitações de marmitas da Mariana, visíveis para Lívia.

| Coluna | Tipo | Null | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `kitchen_space_id` | `uuid` | não | — |
| `requester_id` | `uuid` | não | — |
| `description` | `text` | não | — |
| `reference_photo_path` | `text` | sim | — |
| `desired_ingredients` | `text` | sim | — |
| `recipe_id` | `uuid` | sim | — |
| `observations` | `text` | sim | — |
| `status` | `text` | não | `'pendente'::text` |
| `created_at` | `timestamptz` | não | `now()` |
| `completed_at` | `timestamptz` | sim | — |
| `updated_at` | `timestamptz` | não | `now()` |
| `updated_by` | `uuid` | sim | — |
| `external_id` | `text` | sim | — |

**Chave estrangeira:**

- `kitchen_space_id` → `kitchen_spaces.id` (`CASCADE`)
- `recipe_id` → `recipes.id` (`SET NULL`)
- `requester_id` → `profiles.id` (`SET NULL`)
- `updated_by` → `profiles.id` (`SET NULL`)

**Índices:**

- `idx_orders_created_at`
- `idx_orders_requester`
- `idx_orders_space`
- `idx_orders_status`
- `orders_pkey`
- `uq_orders_external`

**Políticas RLS (4):** DELETE, INSERT, SELECT, UPDATE

**Triggers:** `trg_orders_status_history`, `trg_orders_updated_at`

#### `shopping_list_items` — 0 linha(s), 5 índice(s), RLS **ativo**

> Itens de uma lista de compras (alimento ou produto) com quantidade e status de compra.

| Coluna | Tipo | Null | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `shopping_list_id` | `uuid` | não | — |
| `food_id` | `uuid` | sim | — |
| `product_id` | `uuid` | sim | — |
| `quantity` | `numeric` | não | — |
| `unit` | `text` | não | — |
| `is_purchased` | `boolean` | sim | `false` |
| `purchased_at` | `timestamptz` | sim | — |
| `linked_recipe_id` | `uuid` | sim | — |
| `linked_marmita_id` | `uuid` | sim | — |
| `created_at` | `timestamptz` | não | `now()` |

**Chave estrangeira:**

- `food_id` → `foods.id` (`SET NULL`)
- `linked_marmita_id` → `marmitas.id` (`SET NULL`)
- `linked_recipe_id` → `recipes.id` (`SET NULL`)
- `product_id` → `products.id` (`SET NULL`)
- `shopping_list_id` → `shopping_lists.id` (`CASCADE`)

**Índices:**

- `idx_shopping_list_items_food`
- `idx_shopping_list_items_list`
- `idx_shopping_list_items_product`
- `idx_shopping_list_items_purchased`
- `shopping_list_items_pkey`

**Políticas RLS (4):** DELETE, INSERT, SELECT, UPDATE

#### `shopping_lists` — 0 linha(s), 4 índice(s), RLS **ativo**

> Listas de compras do espaço compartilhado.

| Coluna | Tipo | Null | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `kitchen_space_id` | `uuid` | não | — |
| `created_by` | `uuid` | sim | — |
| `name` | `text` | não | — |
| `week_start_date` | `date` | sim | — |
| `created_at` | `timestamptz` | não | `now()` |
| `updated_at` | `timestamptz` | não | `now()` |
| `external_id` | `text` | sim | — |

**Chave estrangeira:**

- `created_by` → `profiles.id` (`SET NULL`)
- `kitchen_space_id` → `kitchen_spaces.id` (`CASCADE`)

**Índices:**

- `idx_shopping_lists_created_by`
- `idx_shopping_lists_space`
- `shopping_lists_pkey`
- `uq_shopping_lists_external`

**Políticas RLS (4):** DELETE, INSERT, SELECT, UPDATE

**Triggers:** `trg_shopping_lists_updated_at`


### Infraestrutura

#### `schema_migrations` — 19 linha(s), 1 índice(s), sem RLS

| Coluna | Tipo | Null | Padrão |
|---|---|---|---|
| `version` | `text` | não | — |
| `applied_at` | `timestamptz` | não | `now()` |

**Índices:**

- `schema_migrations_pkey`

#### `storage_buckets` — 6 linha(s), 2 índice(s), RLS **ativo**

> Buckets de armazenamento de fotografias (privados, URLs assinadas quando necessário).

| Coluna | Tipo | Null | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `name` | `text` | não | — |
| `description` | `text` | sim | — |
| `access` | `text` | não | `'private'::text` |
| `created_at` | `timestamptz` | não | `now()` |

**Índices:**

- `storage_buckets_name_key`
- `storage_buckets_pkey`

**Políticas RLS (1):** SELECT

#### `storage_files` — 0 linha(s), 3 índice(s), RLS **ativo**

> Metadados de arquivos armazenados (caminhos, nunca binário no Postgres).

| Coluna | Tipo | Null | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `bucket` | `text` | não | — |
| `file_path` | `text` | não | — |
| `file_name` | `text` | não | — |
| `mime_type` | `text` | sim | — |
| `size_bytes` | `bigint` | sim | — |
| `uploaded_by` | `uuid` | sim | — |
| `signed_url` | `text` | sim | — |
| `created_at` | `timestamptz` | não | `now()` |

**Chave estrangeira:**

- `uploaded_by` → `profiles.id` (`SET NULL`)

**Índices:**

- `idx_storage_files_bucket_path`
- `idx_storage_files_uploaded_by`
- `storage_files_pkey`

**Políticas RLS (2):** INSERT, SELECT

#### `sync_events` — 32 linha(s), 2 índice(s), RLS **ativo**

> Fila de eventos para sincronização incremental entre os membros do espaço.

| Coluna | Tipo | Null | Padrão |
|---|---|---|---|
| `id` | `bigint` | não | `nextval('sync_events_id_seq'::regclass)` |
| `kitchen_space_id` | `uuid` | não | — |
| `entity` | `text` | não | — |
| `entity_id` | `uuid` | sim | — |
| `action` | `text` | não | — |
| `payload` | `jsonb` | sim | — |
| `created_at` | `timestamptz` | não | `now()` |

**Chave estrangeira:**

- `kitchen_space_id` → `kitchen_spaces.id` (`CASCADE`)

**Índices:**

- `idx_sync_events_space_id`
- `sync_events_pkey`

**Políticas RLS (1):** SELECT


### Legado

#### `app_state` — 1 linha(s), 2 índice(s), sem RLS

| Coluna | Tipo | Null | Padrão |
|---|---|---|---|
| `id` | `text` | não | — |
| `data` | `jsonb` | não | — |
| `updated_at` | `timestamptz` | não | `now()` |

**Índices:**

- `app_state_pkey`
- `app_state_updated_at_idx`


<!-- FIM SCHEMA GERADO -->

---

## 5. Diagrama de relacionamentos

```
kitchen_spaces ─┬─< memberships >─┬─ profiles ─< profile_sessions
                │                 ├─< foods ─┬─< food_nutrition_history
                │                 │           ├─< food_household_conversions >─ household_measures
                │                 │           └─< recipe_ingredients >─┐
                │                 │                                    │
                │                 ├─< products ─< product_nutrition_history
                │                 │        └───────────────────────────┤ (recipe_ingredients.product_id)
                │                 ├─< recipes ─< recipe_ingredients    │
                │                 │      └─< orders.recipe_id         │
                │                 ├─< marmitas ─< marmita_items >─ foods
                │                 │      └─< shopping_list_items.linked_marmita_id
                │                 ├─< meals ─< meal_items >─ foods / products
                │                 │      └─< image_analyses.meal_id
                │                 ├─< orders ─< order_status_history
                │                 ├─< shopping_lists ─< shopping_list_items
                │                 ├─< image_analyses
                │                 ├─< storage_files
                │                 └─< sync_events
                │
                └── (storage_buckets é global ao espaço)
```

**Convenção de `ON DELETE`:**

- `CASCADE` — remover o dono (`kitchen_spaces`, `profiles` em memberships) remove os dependentes.
- `SET NULL` — ao apagar um autor/registrador (`created_by`, `updated_by`, `prepared_by`,
  `author_id`, `user_id`), a linha é **mantida** e o campo vira `NULL`. Isso preserva o
  histórico nutricional e os registros de refeição.

---

## 6. Segurança — Row Level Security (RLS)

### 6.1 Variáveis de sessão

As políticas leem variáveis definidas por requisição:

| Variável | Conteúdo |
|---|---|
| `app.current_profile_id` | UUID do perfil autenticado |
| `app.current_profile_role` | `admin` ou `user` |

No `src/api.ts` o middleware de identidade resolve o perfil (cookie de sessão `olk_session`,
header `X-Profile-ID` em dev, ou `X-Auth-User-ID` para o Neon Auth) e expõe
`req.profileId`, `req.profileRole` e `req.spaceIds`.

### 6.2 Funções auxiliares de autorização

| Função | Retorna | Observação |
|---|---|---|
| `current_profile_id()` | `uuid` | Lê `app.current_profile_id` |
| `current_profile_role()` | `text` | Lê `app.current_profile_role` |
| `current_kitchen_space_ids()` | `uuid[]` | Espaços do perfil atual |
| `is_space_admin(uuid)` | `boolean` | É admin no espaço informado |
| `profile_is_space_admin(uuid, uuid)` | `boolean` | Admin genérico (usa o id informado) |
| `profile_in_space(uuid, uuid)` | `boolean` | Pertence ao espaço |

As quatro últimas são **`SECURITY DEFINER`** com `SET search_path = public` — sem isso elas
recursariam na própria policy de `memberships`.

### 6.3 Políticas

67 políticas cobrindo `SELECT`, `INSERT`, `UPDATE` e `DELETE` nas 22 tabelas de negócio.

- `kitchen_spaces`: apenas `SELECT` (gerenciado no seed/seed migration).
- `profiles`: `SELECT/INSERT/UPDATE`, **sem** `DELETE` (perfil não é apagável).
- `food_nutrition_history`, `product_nutrition_history`, `order_status_history`: append-only
  (`SELECT` + `INSERT`) — auditoria imutável.
- `sync_events`: apenas `SELECT` (escrita via função `emit_sync_event`).
- `app_state` e `schema_migrations`: **sem RLS** (tabelas de infraestrutura/legado).

### 6.4 Regras de autorização aplicadas

- **Mariana não edita nem apaga marmitas publicadas de Lívia.** No `PUT /api/marmitas/:id`
  a cláusula é `is_space_admin(space) OR (prepared_by = profile AND status <> 'publicada')`;
  o `DELETE` exige `is_space_admin`.
- **Papel não auto-editável:** a alteração de `role` em `profiles`/`memberships` é
  validada na camada da API (`api.ts`) — um perfil não pode elevar o próprio papel.
- **Isolamento entre espaços:** toda consulta passa por
  `kitchen_space_id = ANY(SELECT kitchen_space_id FROM memberships WHERE profile_id = $n)`.
  Um perfil de outro espaço vê conjuntos vazios.

### 6.5 Estado atual da execução

O app conecta como **dono das tabelas**, e o dono **bypassa o RLS** no Postgres.
Por isso as políticas estão definidas e são válidas/documentadas, mas o isolamento
efetivo hoje é garantido pelas cláusulas `WHERE` da API. Quando o Neon Auth for ligado e
a conexão passar a usar um papel não-dono, as políticas passam a valer automaticamente
sem alteração de código.

---

## 7. Funções SQL

### 7.1 Cálculo nutricional

| Função | Assinatura | Retorno |
|---|---|---|
| `calc_food_portion` | `(p_grams, p_calories_100g, p_protein_100g, p_carbs_100g, p_fat_100g, p_fiber_100g, p_sugars_100g, p_sodium_100g)` | `jsonb` |
| `calc_food_portion` | `(p_grams, p_calories_100g)` — sobrecarga curta | `jsonb` |
| `calc_recipe_ingredient` | `(p_food_id, p_product_id, p_weight_grams)` | `jsonb` |
| `calc_meal_totals` | `(p_meal_id)` | `TABLE(...)` |

**Regra de cálculo (exigência da missão):**

```
valor = (gramas / 100) × valor_por_100g
```

- **Sem arredondamento intermediário** — o resultado só é arredondado na apresentação.
- **`NULL` ≠ `0`** — nutriente desconhecido permanece `NULL`, nunca vira `0`.
- `calc_recipe_ingredient` resolve alimento **ou** produto (`COALESCE(food, product)`).

**Verificação oficial (exemplo da missão):**

```
calc_food_portion(50, 74)  →  { "calories": 37, "ratio": 0.5, "portion_grams": 50 }
                               (50/100 × 74 = 37 ✓)
calc_food_portion(50, NULL) →  { "calories": null, ... }   ← NULL preservado, não 0
```

### 7.2 Recálculo de totais (disparados por trigger)

| Função | Disparador | O que recalcula |
|---|---|---|
| `recalc_marmita_totals` | `trg_marmitas_updated_at`/`trg_marmita_items_totals` | Totais da marmita |
| `recalc_recipe_totals` | `trg_recipe_ingredients_totals` | Totais da receita (por porção) |
| `recalc_meal_totals` | `trg_meal_items_totals` | Totais da refeição |

### 7.3 Infraestrutura

| Função | Uso |
|---|---|
| `set_updated_at()` | Trigger genérico de `updated_at` |
| `emit_sync_event(space, entity, id, action, payload)` | Grava evento de sincronização multi-dispositivo |
| `trg_food_nutrition_history()` | Audita alterações nutricionais de alimento |
| `trg_order_status_history()` | Registra transições de status de pedido |

---

## 8. Triggers

16 triggers no total.

**`updated_at` automático (10):** `foods`, `products`, `recipes`, `marmitas`, `meals`,
`orders`, `shopping_lists`, `image_analyses`, `profiles`, `kitchen_spaces`.

**Recálculo de totais (3):** `marmita_items`, `meal_items`, `recipe_ingredients`.

**Auditoria/histórico (2):** `foods` → `trg_foods_nutrition_history`,
`orders` → `trg_orders_status_history`.

> A migration 018 remove triggers `trg_*_updated_at` órfãos em tabelas que não possuem a
> coluna `updated_at` (ex.: `shopping_list_items`), que quebravam `UPDATE`s.

---

## 9. Código de barras — fluxo local-first

1. **Local:** `GET /api/products/lookup/:code` consulta `products.barcode` (único globalmente).
2. **Open Food Facts:** se não encontrado, o client consulta a API externa.
3. **Confirmação:** o usuário confere/edita os dados retornados.
4. **Salva:** `POST /api/products` persiste com `data_source` registrado.

**Garantias:**
- `products_barcode_key` — unicidade **global** de código de barras.
- Duplicata retorna `409` com o produto existente.
- Alterações nutricionais gravam linha em `product_nutrition_history`.
- `GET /api/products/:id/history` devolve o histórico.

---

## 10. API REST

Todas as rotas exigem identidade (cookie `olk_session`, ou `X-Profile-ID` em desenvolvimento).
Montadas em `/api` pelo `server.ts`.

### 10.1 Autenticação e perfis

| Método | Rota |
|---|---|
| GET | `/api/auth/profiles` |
| POST | `/api/auth/login`, `/api/auth/logout` |
| GET | `/api/auth/me` |
| POST | `/api/auth/change-pin` |
| GET/PATCH | `/api/me` |
| GET | `/api/spaces`, `/api/profiles` |
| PATCH | `/api/profiles/:id` |

### 10.2 Recursos

| Domínio | Rotas |
|---|---|
| Alimentos | `GET/POST /api/foods`, `GET/PUT/DELETE /api/foods/:id`, `POST /api/foods/:id/restore`, `GET /api/foods/:id/history`, `GET/POST /api/foods/:id/conversions`, `GET /api/household-measures` |
| Produtos | `GET/POST /api/products`, `GET /api/products/lookup/:code`, `PUT/DELETE /api/products/:id`, `POST /api/products/:id/restore`, `GET /api/products/:id/history` |
| Receitas | `GET/POST /api/recipes`, `GET/PUT/DELETE /api/recipes/:id`, `POST /api/recipes/:id/approve`, `POST /api/recipes/:id/restore` |
| Marmitas | `GET/POST /api/marmitas`, `GET/PUT/DELETE /api/marmitas/:id`, `POST /api/marmitas/:id/publish`, `POST /api/marmitas/:id/restore` |
| Refeições | `GET/POST /api/meals`, `GET/PUT/DELETE /api/meals/:id`, `POST /api/meals/:id/restore` |
| Pedidos | `GET/POST /api/orders`, `GET/DELETE /api/orders/:id`, `PUT /api/orders/:id/status`, `GET /api/orders/:id/history` |
| Compras | `GET/POST /api/shopping-lists`, `GET/PUT/DELETE /api/shopping-lists/:id`, `GET/POST /api/shopping-lists/:id/items`, `PATCH /api/shopping-lists/items/:id/purchase`, `DELETE /api/shopping-lists/items/:id` |
| Análises | `GET/POST /api/image-analyses`, `GET/PUT/DELETE /api/image-analyses/:id` |
| Arquivos | `POST /api/uploads`, `GET/DELETE /api/files/:id` |
| Cálculo | `GET /api/calc/food-portion`, `GET /api/calc/portion` |
| Sync | `GET /api/sync/status`, `GET /api/sync/events` |
| Status | `GET /api/data/status` |

### 10.3 Rotas legadas (mantidas no `server.ts`)

`GET /api/health` · `GET/POST /api/storage` · `POST /api/gemini/analyze-meal` ·
`POST /api/gemini/ocr-label` · `POST /api/gemini/recipe-assistant` ·
`POST /api/gemini/read-barcode` · `GET /api/barcode/:code`

> Registradas **antes** do `apiRouter`, portanto continuam com prioridade e não são
> sombreadas pelas rotas normalizadas.

### 10.4 Exclusão lógica (soft delete)

`foods`, `products`, `recipes`, `marmitas`, `meals` usam `deleted_at`:
- `DELETE` seta `deleted_at = now()` (não remove a linha).
- Listagens filtram `deleted_at IS NULL`.
- `POST /:id/restore` limpa `deleted_at`.
- Os índices únicos são **parciais** (`WHERE deleted_at IS NULL`), permitindo recriar
  um registro com o mesmo nome após a exclusão lógica.

---

## 11. Integrações

| Integração | Status | Observação |
|---|---|---|
| **Neon Postgres** | ✅ Funcionando | Pool `pg`, migrations aplicadas |
| **Gemini (IA)** | ⚠️ Sem chave | `GEMINI_API_KEY` não configurada — rotas `/api/gemini/*` retornam erro controlado |
| **Open Food Facts** | ✅ Disponível | Consulta externa no fluxo de código de barras (sem chave) |
| **Neon Auth** | ⏳ Habilitado, sem usuários | `profiles.auth_user_id` está pronto; hoje o login ativo é por PIN (scrypt + `profile_sessions`) |
| **Armazenamento de arquivos** | ⚠️ Local | Metadados em `storage_files`/`storage_buckets`; bytes em `data/uploads/`. Neon Object Storage não existe em `aws-sa-east-1` |
| **Sync multi-dispositivo** | ✅ Funcionando | `sync_events` + polling em `/api/sync/status` a cada 6 s. Neon Realtime não existe em `aws-sa-east-1` |
| **Frontend** | ✅ Autenticado, caminho legado | Login por perfil/PIN, sessão restaurada e polling de sync; a UI ainda lê/escreve o blob `app_state` via `/api/storage`, que é espelhado nas tabelas normalizadas |

---

## 12. Seeds

Aplicados pela migration `015_seed_data.sql`:

| Entidade | Valor |
|---|---|
| Espaço | **Nossa Cozinha** (`nossa-cozinha`) |
| Perfil admin | **Lívia** — `role = admin`, membro `admin` do espaço |
| Perfil usuário | **Mariana** — `role = user`, membro `member` do espaço |
| Medidas caseiras | 10 unidades (colher de chá, xícara, concha, ...) |
| Metas da Mari | 1850 kcal · 115 g proteína · 200 g carboidrato · 50 g gordura · 2200 ml água |

Estado legado: `app_state` contém 1 documento (`mariana_kitchen_data`) semeado de
`data/mariana_kitchen_data.json`, preservando o funcionamento atual do app.

---

## 13. Variáveis de ambiente

Ver `.env.example` (sem credenciais reais).

| Variável | Obrigatória | Uso |
|---|---|---|
| `DATABASE_URL` | ✅ | Pool do app |
| `DATABASE_URL_UNPOOLED` | Convenção | Migrations e dumps |
| `GEMINI_API_KEY` | Para IA | Análise de refeição, OCR, assistente de receita |
| `APP_URL` | Não | Links auto-referenciais |
| `ALLOW_PROFILE_HEADER` | Não | `false` desativa o header `X-Profile-ID` fora de dev |
| `OLK_SETUP_CODE` | Não | Código de configuração inicial do login por PIN |
| `NODE_ENV` | Não | `production` ativa cookies `Secure` e serve `dist/` |
| `DISABLE_HMR` | Não | Desativa HMR do Vite |

---

## 14. Itens pendentes (dependem de credenciais/decisão externa)

1. **`GEMINI_API_KEY`** — sem ela, scanner de refeição, OCR de rótulo, assistente de receita
   e leitura de código de barras por IA não funcionam. As rotas respondem 503 de forma
   controlada; não foram testadas com chave real.
2. **Neon Object Storage / Functions / AI Gateway / Realtime** — indisponíveis em
   `aws-sa-east-1`. Usá-los exigiria um projeto em `aws-us-east-2`, `aws-us-east-1`,
   `aws-eu-central-1` ou `aws-ap-southeast-1`. Para não substituir o projeto atual:
   arquivos ficam em `data/uploads/` e a sincronização é por polling.
3. **Neon Auth** — habilitado no branch, mas sem usuários. O login ativo é por PIN.
   `profiles.auth_user_id` está pronto para o vínculo quando o provedor for ativado.
4. **Papel de banco não-dono** — hoje o app conecta como dono (RLS bypassed). A API aplica
   autorização explícita e as políticas foram validadas com um papel não-proprietário nos
   testes. Para acesso direto via Data API, crie um papel restrito e defina
   `app.current_profile_id` por sessão.

---

## 15. Scripts de tooling

| Script | Função |
|---|---|
| `npm run db:migrate` | Aplica migrations pendentes (idempotente) — runner canônico |
| `npx tsx verify-db.mjs` | Resumo de tabelas, seeds, funções, RLS, triggers |
| `npx tsx db-inspect.mjs` | Inspecão completa → `db-status.json` |
| `npm run test:db` | Suíte de integração (`tests/run.ts`) contra o servidor real |
| `npx tsx apply-migrations.mjs` | Runner legado; mantenha `db/migrate.ts` como canônico |
