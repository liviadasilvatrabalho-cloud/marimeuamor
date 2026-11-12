-- Migration 015: Dados iniciais (seed) — Lívia (admin) e Mariana (user)
-- Our Little Kitchen - Neon Postgres
-- Os dois usuários pertencem ao mesmo espaço compartilhado "Nossa Cozinha".
-- NÃO sobrescreve dados existentes (usado apenas na primeira instalação).

-- Espaço compartilhado
INSERT INTO kitchen_spaces (id, name, slug)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Nossa Cozinha',
  'nossa-cozinha'
)
ON CONFLICT (slug) DO NOTHING;

-- Perfil: Lívia (administradora)
INSERT INTO profiles (id, name, email, role, calorie_goal, protein_goal_g, carbs_goal_g, fat_goal_g, water_goal_ml, current_weight_kg, target_weight_kg, height_cm, diet_preference)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'Lívia',
  'livia@ourlittlekitchen.app',
  'admin',
  2000, 130, 220, 60, 2200, 62.0, 60.0, 165, 'Equilibrada'
)
ON CONFLICT (email) DO NOTHING;

-- Perfil: Mariana (usuária)
INSERT INTO profiles (id, name, email, role, calorie_goal, protein_goal_g, carbs_goal_g, fat_goal_g, water_goal_ml, current_weight_kg, target_weight_kg, height_cm, diet_preference)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  'Mariana',
  'mariana@ourlittlekitchen.app',
  'user',
  1850, 115, 200, 50, 2200, 58.5, 57.0, 164, 'Equilibrada & Saudável'
)
ON CONFLICT (email) DO NOTHING;

-- Associações ao espaço compartilhado
INSERT INTO memberships (kitchen_space_id, profile_id, role_in_space)
VALUES
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'admin'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'member')
ON CONFLICT (kitchen_space_id, profile_id) DO NOTHING;

-- Medidas caseiras padrão
INSERT INTO household_measures (id, name, short_label, typical_volume_ml, description, visual_icon) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Colher de sopa', 'c. sopa', 15, 'Colher de refeição padrão (~15ml líquido, 15-30g)', 'Utensils'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Colher de chá', 'c. chá', 5, 'Colher pequena de café/chá (~5ml / 5g)', 'Coffee'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Colher de servir', 'c. servir', 45, 'Colher grande para servir arroz e carnes moídas (~45-60g)', 'UtensilsCrossed'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Concha', 'concha', 130, 'Concha funda para feijão, sopas e caldos (~130g)', 'Soup'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Xícara de chá (240ml)', 'xícara', 240, 'Xícara de medida culinária padrão de 240ml', 'CupSoda'),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'Copo americano / requeijão', 'copo', 200, 'Copo de vidro tradicional de 150ml a 200ml', 'GlassWater'),
  ('10101010-1010-1010-1010-101010101010', 'Fatia', 'fatia', NULL, 'Fatia de pão, queijo, fruta ou bolo', 'Layers'),
  ('20202020-2020-2020-2020-202020202020', 'Unidade', 'unid.', NULL, 'Alimento inteiro unitário (ovo, fruta, pão)', 'CircleDot'),
  ('30303030-3030-3030-3030-303030303030', 'Filé / Bife', 'filé', NULL, 'Filé de peito de frango, carne bovina ou peixe grelhado', 'Beef'),
  ('40404040-4040-4040-4040-404040404040', 'Porção', 'porção', NULL, 'Porção individual padrão servida no prato', 'Sparkles')
ON CONFLICT (id) DO NOTHING;

COMMENT ON COLUMN profiles.role IS 'Papel do usuário: admin (Lívia) gerencia todos os registros; user (Mariana) consulta, registra refeições, sugere receitas e cria pedidos.';
