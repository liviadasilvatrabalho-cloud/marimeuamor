import type { DatabaseFood } from './nutritionDatabase';
import type { NutritionSource, PrepState } from '../types';

type ConversionTuple = [string, number, string];

const food = (
  id: string,
  name: string,
  category: DatabaseFood['category'],
  prepState: PrepState,
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  fiber: number,
  serving: number,
  conversions: ConversionTuple[],
  source: NutritionSource = 'TACO'
): DatabaseFood => ({
  id,
  name,
  category,
  prepState,
  source,
  caloriesPer100g: kcal,
  proteinPer100g: protein,
  carbsPer100g: carbs,
  fatPer100g: fat,
  fiberPer100g: fiber,
  defaultServingGrams: serving,
  householdConversions: conversions.map(([measure, grams, description]) => ({ measure, grams, description })),
});

export const EXTRA_FOODS: DatabaseFood[] = [
  // ===== GRÃOS, CEREAIS E LEGUMINOSAS =====
  food('arroz_branco_cru', 'Arroz branco cru', 'Graos', 'cru', 365, 7.2, 78.6, 0.3, 1.6, 80, [
    ['Colher de sopa cheia', 20, '1 colher de sopa de arroz cru (~20g)'],
    ['Xícara de chá', 180, '1 xícara de arroz cru (~180g)'],
    ['Copo americano', 160, '1 copo americano de arroz cru (~160g)'],
  ]),
  food('arroz_integral_cru', 'Arroz integral cru', 'Graos', 'cru', 360, 7.3, 77.5, 2.7, 3.9, 80, [
    ['Colher de sopa cheia', 20, '1 colher de sopa de arroz integral cru (~20g)'],
    ['Xícara de chá', 180, '1 xícara de arroz integral cru (~180g)'],
    ['Copo americano', 160, '1 copo americano (~160g)'],
  ]),
  food('arroz_parboilizado_cozido', 'Arroz parboilizado cozido', 'Graos', 'cozido', 123, 2.5, 26.5, 0.3, 1.5, 100, [
    ['Colher de sopa cheia', 25, '1 colher de sopa (~25g)'],
    ['Colher de servir', 50, '1 colher de servir (~50g)'],
    ['Xícara de chá', 160, '1 xícara cheia (~160g)'],
    ['Concha média', 120, '1 concha média (~120g)'],
  ]),
  food('macarrao_cozido', 'Macarrão cozido', 'Graos', 'cozido', 158, 5.8, 30.9, 0.9, 1.8, 120, [
    ['Colher de servir', 50, '1 colher de servir (~50g)'],
    ['Xícara de chá', 160, '1 xícara de macarrão cozido (~160g)'],
    ['Prato raso cheio', 180, 'Porção de um prato raso (~180g)'],
  ]),
  food('macarrao_integral_cozido', 'Macarrão integral cozido', 'Graos', 'cozido', 124, 5.3, 25.0, 0.5, 3.9, 120, [
    ['Colher de servir', 50, '1 colher de servir (~50g)'],
    ['Xícara de chá', 160, '1 xícara de macarrão integral (~160g)'],
    ['Prato raso cheio', 180, 'Porção de um prato raso (~180g)'],
  ]),
  food('macarrao_cru', 'Macarrão cru', 'Graos', 'cru', 371, 10.0, 74.7, 1.5, 3.2, 80, [
    ['Colher de sopa cheia', 20, '1 colher de sopa de macarrão cru (~20g)'],
    ['Xícara de chá', 150, '1 xícara de macarrão cru (~150g)'],
    ['Copo americano', 140, '1 copo americano (~140g)'],
  ]),
  food('quinoa_cozida', 'Quinoa cozida', 'Graos', 'cozido', 120, 4.4, 21.3, 1.9, 2.8, 100, [
    ['Colher de sopa cheia', 20, '1 colher de sopa de quinoa (~20g)'],
    ['Colher de servir', 50, '1 colher de servir (~50g)'],
    ['Xícara de chá', 170, '1 xícara de quinoa cozida (~170g)'],
  ]),
  food('quinoa_crua', 'Quinoa crua', 'Graos', 'cru', 368, 14.1, 64.2, 6.1, 7.0, 60, [
    ['Colher de sopa cheia', 15, '1 colher de sopa de quinoa crua (~15g)'],
    ['Xícara de chá', 150, '1 xícara de quinoa crua (~150g)'],
  ]),
  food('cuscuz_milho_cozido', 'Cuscuz de milho cozido', 'Graos', 'cozido', 113, 2.2, 25.3, 0.7, 1.6, 120, [
    ['Colher de servir', 60, '1 colher de servir (~60g)'],
    ['Xícara de chá', 150, '1 xícara de cuscuz (~150g)'],
    ['Prato raso', 120, 'Porção de um prato raso (~120g)'],
  ]),
  food('cuscuz_milho_cru', 'Flocão de milho cru (cuscuz)', 'Graos', 'cru', 370, 7.0, 79.0, 1.0, 3.0, 80, [
    ['Colher de sopa cheia', 20, '1 colher de sopa de flocão (~20g)'],
    ['Xícara de chá', 160, '1 xícara de flocão (~160g)'],
  ]),
  food('feijao_branco_cozido', 'Feijão branco cozido', 'Graos', 'cozido', 142, 8.5, 26.0, 0.5, 10.5, 130, [
    ['Concha média', 130, '1 concha média (~130g)'],
    ['Colher de sopa cheia', 20, '1 colher de sopa (~20g)'],
    ['Xícara de chá', 180, '1 xícara de feijão (~180g)'],
  ]),
  food('ervilha_seca_cozida', 'Ervilha seca cozida', 'Graos', 'cozido', 93, 7.5, 15.8, 0.4, 5.5, 100, [
    ['Concha média', 120, '1 concha média (~120g)'],
    ['Colher de sopa cheia', 25, '1 colher de sopa (~25g)'],
    ['Xícara de chá', 160, '1 xícara de ervilha (~160g)'],
  ]),
  food('soja_cozida', 'Soja cozida', 'Graos', 'cozido', 172, 18.2, 10.0, 9.0, 6.0, 100, [
    ['Colher de sopa cheia', 25, '1 colher de sopa de soja (~25g)'],
    ['Concha média', 120, '1 concha média (~120g)'],
    ['Xícara de chá', 160, '1 xícara de soja (~160g)'],
  ]),
  food('tofu_cru', 'Tofu cru', 'Graos', 'cru', 76, 8.1, 1.9, 4.8, 0.3, 100, [
    ['Cubo médio', 20, '1 cubo médio (~20g)'],
    ['Fatia média', 50, '1 fatia média (~50g)'],
    ['Xícara de chá em cubos', 150, '1 xícara de tofu em cubos (~150g)'],
  ]),
  food('tofu_grelhado', 'Tofu grelhado', 'Graos', 'grelhado', 120, 12.0, 2.5, 7.0, 0.4, 100, [
    ['Fatia média', 50, '1 fatia grelhada (~50g)'],
    ['Cubo médio', 20, '1 cubo grelhado (~20g)'],
    ['Xícara de chá em cubos', 140, '1 xícara de tofu grelhado (~140g)'],
  ]),
  food('grao_de_bico_cru', 'Grão-de-bico cru', 'Graos', 'cru', 364, 19.3, 60.7, 6.0, 17.4, 80, [
    ['Colher de sopa cheia', 20, '1 colher de sopa de grão-de-bico cru (~20g)'],
    ['Xícara de chá', 160, '1 xícara de grão-de-bico cru (~160g)'],
  ]),
  food('lentilha_crua', 'Lentilha crua', 'Graos', 'cru', 339, 24.6, 63.0, 1.1, 10.7, 80, [
    ['Colher de sopa cheia', 20, '1 colher de sopa de lentilha crua (~20g)'],
    ['Xícara de chá', 160, '1 xícara de lentilha crua (~160g)'],
  ]),
  food('farinha_mandioca', 'Farinha de mandioca', 'Graos', 'cru', 361, 1.6, 87.9, 0.3, 6.4, 30, [
    ['Colher de sopa cheia', 15, '1 colher de sopa de farinha (~15g)'],
    ['Colher de servir', 25, '1 colher de servir (~25g)'],
    ['Xícara de chá', 120, '1 xícara de farinha (~120g)'],
  ]),
  food('farinha_aveia', 'Farinha de aveia', 'Graos', 'cru', 394, 13.9, 66.6, 8.5, 9.1, 30, [
    ['Colher de sopa cheia', 15, '1 colher de sopa de farinha de aveia (~15g)'],
    ['Colher de chá', 5, '1 colher de chá (~5g)'],
    ['Xícara de chá', 80, '1 xícara de farinha de aveia (~80g)'],
  ]),

  // ===== CARNES, AVES E PEIXES =====
  food('frango_peito_cru', 'Peito de frango cru sem pele', 'Carnes', 'cru', 119, 21.5, 0.0, 3.6, 0.0, 120, [
    ['Filé médio', 130, '1 filé médio cru (~130g)'],
    ['Filé pequeno', 90, '1 filé pequeno cru (~90g)'],
    ['Xícara de chá em cubos', 140, '1 xícara de frango em cubos (~140g)'],
  ]),
  food('frango_coxa_crua', 'Coxa de frango crua com pele', 'Carnes', 'cru', 161, 17.0, 0.0, 10.0, 0.0, 120, [
    ['1 coxa', 90, '1 coxa média crua (~90g)'],
    ['1 sobrecoxa', 120, '1 sobrecoxa média crua (~120g)'],
    ['2 coxas', 180, '2 coxas médias (~180g)'],
  ]),
  food('frango_coxa_cozida', 'Coxa de frango cozida', 'Carnes', 'cozido', 167, 18.0, 0.0, 10.5, 0.0, 120, [
    ['1 coxa', 90, '1 coxa média cozida (~90g)'],
    ['1 sobrecoxa', 120, '1 sobrecoxa cozida (~120g)'],
    ['2 coxas', 180, '2 coxas médias (~180g)'],
  ]),
  food('frango_coxa_assada', 'Coxa de frango assada', 'Carnes', 'assado', 180, 19.0, 0.0, 11.5, 0.0, 120, [
    ['1 coxa', 90, '1 coxa média assada (~90g)'],
    ['1 sobrecoxa', 120, '1 sobrecoxa assada (~120g)'],
    ['2 coxas', 180, '2 coxas médias (~180g)'],
  ]),
  food('frango_coxa_frita', 'Coxa de frango frita', 'Carnes', 'frito', 220, 18.5, 2.0, 15.5, 0.0, 120, [
    ['1 coxa', 90, '1 coxa média frita (~90g)'],
    ['1 sobrecoxa', 120, '1 sobrecoxa frita (~120g)'],
    ['2 coxas', 180, '2 coxas médias (~180g)'],
  ]),
  food('frango_inteiro_assado', 'Frango inteiro assado', 'Carnes', 'assado', 187, 20.0, 0.0, 12.0, 0.0, 150, [
    ['1/4 de frango', 150, 'Um quarto de frango assado (~150g)'],
    ['1/2 frango', 300, 'Meio frango assado (~300g)'],
    ['Peito assado', 120, '1 peito assado (~120g)'],
  ]),
  food('patinho_cru', 'Patinho bovino cru', 'Carnes', 'cru', 133, 21.0, 0.0, 5.0, 0.0, 120, [
    ['Bife médio', 130, '1 bife médio cru (~130g)'],
    ['Bife pequeno', 90, '1 bife pequeno cru (~90g)'],
    ['Colher de sopa moído', 30, '1 colher de sopa de carne moída crua (~30g)'],
  ]),
  food('patinho_cozido', 'Patinho bovino cozido', 'Carnes', 'cozido', 219, 32.0, 0.0, 9.0, 0.0, 120, [
    ['Bife médio', 130, '1 bife médio cozido (~130g)'],
    ['Bife pequeno', 90, '1 bife pequeno cozido (~90g)'],
    ['Colher de servir desfiado', 60, '1 colher de servir (~60g)'],
  ]),
  food('patinho_grelhado', 'Patinho bovino grelhado', 'Carnes', 'grelhado', 241, 31.9, 0.0, 11.6, 0.0, 120, [
    ['Bife médio', 130, '1 bife médio grelhado (~130g)'],
    ['Bife grande', 180, '1 bife grande grelhado (~180g)'],
    ['Fatia fina', 60, '1 fatia fina (~60g)'],
  ]),
  food('contrafilo_grelhado', 'Contrafilé grelhado', 'Carnes', 'grelhado', 278, 32.0, 0.0, 15.0, 0.0, 120, [
    ['Bife médio', 130, '1 bife médio grelhado (~130g)'],
    ['Bife grande', 180, '1 bife grande grelhado (~180g)'],
    ['Fatia fina', 60, '1 fatia fina (~60g)'],
  ]),
  food('picanha_grelhada', 'Picanha grelhada', 'Carnes', 'grelhado', 289, 29.0, 0.0, 18.0, 0.0, 120, [
    ['Fatia média', 120, '1 fatia média grelhada (~120g)'],
    ['Fatia grande', 180, '1 fatia grande (~180g)'],
    ['2 fatias médias', 240, '2 fatias médias (~240g)'],
  ]),
  food('costela_assada', 'Costela bovina assada', 'Carnes', 'assado', 373, 24.0, 0.0, 30.0, 0.0, 150, [
    ['1 costela média', 100, '1 costela média assada (~100g)'],
    ['2 costelas', 200, '2 costelas médias (~200g)'],
    ['Porção individual', 150, '1 porção individual (~150g)'],
  ]),
  food('figado_bovino_grelhado', 'Fígado bovino grelhado', 'Carnes', 'grelhado', 225, 30.0, 4.0, 9.0, 0.0, 100, [
    ['1 bife de fígado', 100, '1 bife de fígado grelhado (~100g)'],
    ['Colher de servir', 60, '1 colher de servir (~60g)'],
  ]),
  food('carne_moida_crua', 'Carne moída crua', 'Carnes', 'cru', 212, 20.0, 0.0, 14.0, 0.0, 120, [
    ['Colher de sopa cheia', 30, '1 colher de sopa de carne moída crua (~30g)'],
    ['Xícara de chá', 150, '1 xícara de carne moída crua (~150g)'],
  ]),
  food('carne_moida_refogada', 'Carne moída refogada', 'Carnes', 'refogado', 250, 24.0, 1.0, 17.0, 0.0, 120, [
    ['Colher de sopa cheia', 30, '1 colher de sopa de carne moída (~30g)'],
    ['Colher de servir', 60, '1 colher de servir (~60g)'],
    ['Xícara de chá', 150, '1 xícara de carne moída (~150g)'],
  ]),
  food('lombo_suino_cru', 'Lombo suíno cru', 'Carnes', 'cru', 143, 21.0, 0.0, 6.0, 0.0, 120, [
    ['Bife médio', 120, '1 bife de lombo cru (~120g)'],
    ['Fatia fina', 60, '1 fatia fina (~60g)'],
  ]),
  food('lombo_suino_assado', 'Lombo suíno assado', 'Carnes', 'assado', 210, 27.0, 0.0, 11.0, 0.0, 120, [
    ['Bife médio', 120, '1 bife de lombo assado (~120g)'],
    ['Fatia fina', 60, '1 fatia fina (~60g)'],
  ]),
  food('bacon_frito', 'Bacon frito', 'Carnes', 'frito', 541, 37.0, 0.0, 42.0, 0.0, 30, [
    ['1 fatia', 15, '1 fatia de bacon frito (~15g)'],
    ['2 fatias', 30, '2 fatias de bacon (~30g)'],
    ['3 fatias', 45, '3 fatias de bacon (~45g)'],
  ]),
  food('linguica_assada', 'Linguiça assada', 'Carnes', 'assado', 312, 14.0, 2.0, 27.0, 0.0, 80, [
    ['1 unidade', 80, '1 linguiça média assada (~80g)'],
    ['1 rodela', 15, '1 rodela (~15g)'],
    ['3 rodelas', 45, '3 rodelas (~45g)'],
  ]),
  food('linguica_frita', 'Linguiça frita', 'Carnes', 'frito', 350, 15.0, 2.0, 31.0, 0.0, 80, [
    ['1 unidade', 80, '1 linguiça média frita (~80g)'],
    ['1 rodela', 15, '1 rodela frita (~15g)'],
    ['3 rodelas', 45, '3 rodelas fritas (~45g)'],
  ]),
  food('peito_peru_defumado', 'Peito de peru defumado', 'Carnes', 'cru', 94, 18.0, 1.5, 2.0, 0.0, 40, [
    ['1 fatia', 15, '1 fatia de peito de peru (~15g)'],
    ['3 fatias', 45, '3 fatias (~45g)'],
    ['4 fatias', 60, '4 fatias (~60g)'],
  ]),
  food('tilapia_crua', 'Filé de tilápia cru', 'Carnes', 'cru', 96, 20.0, 0.0, 1.7, 0.0, 130, [
    ['Filé médio', 130, '1 filé médio cru (~130g)'],
    ['Filé pequeno', 90, '1 filé pequeno cru (~90g)'],
  ]),
  food('tilapia_assada', 'Filé de tilápia assado', 'Carnes', 'assado', 128, 26.0, 0.0, 2.2, 0.0, 130, [
    ['Filé médio', 130, '1 filé médio assado (~130g)'],
    ['Filé grande', 180, '1 filé grande assado (~180g)'],
  ]),
  food('tilapia_frita', 'Filé de tilápia frito', 'Carnes', 'frito', 200, 24.0, 2.0, 11.0, 0.0, 130, [
    ['Filé médio', 130, '1 filé médio frito (~130g)'],
    ['Filé pequeno', 90, '1 filé pequeno frito (~90g)'],
  ]),
  food('salmao_cru', 'Salmão cru', 'Carnes', 'cru', 208, 20.0, 0.0, 13.0, 0.0, 120, [
    ['Posta média', 120, '1 posta média crua (~120g)'],
    ['Posta pequena', 90, '1 posta pequena crua (~90g)'],
  ]),
  food('salmao_assado', 'Salmão assado', 'Carnes', 'assado', 206, 22.1, 0.0, 12.3, 0.0, 120, [
    ['Posta média', 120, '1 posta média assada (~120g)'],
    ['Posta grande', 170, '1 posta grande assada (~170g)'],
  ]),
  food('atum_fresco_cru', 'Atum fresco cru', 'Carnes', 'cru', 118, 26.0, 0.0, 1.0, 0.0, 100, [
    ['Posta média', 100, '1 posta média crua (~100g)'],
    ['Cubo médio', 20, '1 cubo de atum (~20g)'],
  ]),
  food('camarao_cozido', 'Camarão cozido', 'Carnes', 'cozido', 99, 24.0, 0.0, 0.3, 0.0, 100, [
    ['1 unidade média', 10, '1 camarão médio (~10g)'],
    ['10 unidades', 100, '10 camarões médios (~100g)'],
    ['Colher de sopa cheia', 25, '1 colher de sopa de camarão (~25g)'],
  ]),
  food('camarao_frito', 'Camarão frito', 'Carnes', 'frito', 200, 22.0, 5.0, 10.0, 0.0, 100, [
    ['1 unidade média', 10, '1 camarão médio frito (~10g)'],
    ['10 unidades', 100, '10 camarões médios fritos (~100g)'],
  ]),
  food('sardinha_assada', 'Sardinha assada', 'Carnes', 'assado', 200, 24.0, 0.0, 11.0, 0.0, 100, [
    ['1 unidade média', 50, '1 sardinha média assada (~50g)'],
    ['2 unidades', 100, '2 sardinhas médias (~100g)'],
  ]),
  food('bacalhau_cozido', 'Bacalhau cozido', 'Carnes', 'cozido', 136, 29.0, 0.0, 1.3, 0.0, 100, [
    ['Posta média', 100, '1 posta média cozida (~100g)'],
    ['Colher de servir desfiado', 50, '1 colher de servir de bacalhau desfiado (~50g)'],
  ]),
  food('carne_seca_cozida', 'Carne-seca cozida', 'Carnes', 'cozido', 313, 26.0, 0.0, 23.0, 0.0, 100, [
    ['Fatia média', 60, '1 fatia média cozida (~60g)'],
    ['Colher de servir desfiado', 50, '1 colher de servir desfiado (~50g)'],
  ]),

  // ===== OVOS =====
  food('ovo_cru', 'Ovo de galinha cru', 'Ovos', 'cru', 143, 13.0, 1.6, 8.9, 0.0, 50, [
    ['1 unidade média', 50, '1 ovo médio cru (~50g)'],
    ['2 unidades médias', 100, '2 ovos médios crus (~100g)'],
  ]),
  food('ovo_mexido', 'Ovo mexido', 'Ovos', 'frito', 149, 12.0, 2.0, 10.0, 0.0, 100, [
    ['1 ovo mexido', 50, '1 ovo mexido (~50g)'],
    ['2 ovos mexidos', 100, '2 ovos mexidos (~100g)'],
    ['Colher de sopa cheia', 25, '1 colher de sopa de ovo mexido (~25g)'],
  ]),
  food('omelete_simples', 'Omelete simples', 'Ovos', 'frito', 154, 11.0, 1.5, 11.0, 0.0, 120, [
    ['1 omelete média', 120, '1 omelete média (~120g)'],
    ['1/2 omelete', 60, 'Meia omelete (~60g)'],
  ]),

  // ===== TUBÉRCULOS, RAÍZES E VEGETAIS =====
  food('batata_doce_crua', 'Batata-doce crua sem casca', 'Legumes', 'cru', 86, 1.3, 20.1, 0.1, 3.0, 100, [
    ['Unidade média', 130, '1 batata-doce média crua (~130g)'],
    ['Fatia grossa', 40, '1 rodela ou fatia grossa (~40g)'],
    ['Xícara de chá em cubos', 150, '1 xícara de batata-doce em cubos (~150g)'],
  ]),
  food('batata_doce_assada', 'Batata-doce assada', 'Legumes', 'assado', 90, 2.0, 20.7, 0.2, 3.3, 100, [
    ['Unidade média', 130, '1 batata-doce média assada (~130g)'],
    ['Fatia grossa', 40, '1 fatia grossa assada (~40g)'],
  ]),
  food('batata_inglesa_crua', 'Batata inglesa crua', 'Legumes', 'cru', 77, 2.0, 17.0, 0.1, 2.2, 100, [
    ['Unidade média', 120, '1 batata média crua (~120g)'],
    ['Unidade pequena', 80, '1 batata pequena crua (~80g)'],
    ['Xícara de chá em cubos', 150, '1 xícara de batata em cubos (~150g)'],
  ]),
  food('batata_inglesa_assada', 'Batata inglesa assada', 'Legumes', 'assado', 93, 2.5, 21.0, 0.1, 2.5, 100, [
    ['Unidade média', 120, '1 batata média assada (~120g)'],
    ['Unidade grande', 180, '1 batata grande assada (~180g)'],
  ]),
  food('batata_frita', 'Batata frita', 'Legumes', 'frito', 267, 3.0, 35.0, 13.0, 3.0, 100, [
    ['Porção pequena', 80, '1 porção pequena (~80g)'],
    ['Porção média', 120, '1 porção média (~120g)'],
    ['Porção grande', 180, '1 porção grande (~180g)'],
  ]),
  food('mandioca_crua', 'Mandioca / aipim cru', 'Legumes', 'cru', 160, 1.1, 38.0, 0.3, 1.8, 100, [
    ['Pedaço médio', 60, '1 pedaço médio cru (~60g)'],
    ['Xícara de chá em cubos', 150, '1 xícara de mandioca em cubos (~150g)'],
  ]),
  food('mandioca_frita', 'Mandioca / aipim frito', 'Legumes', 'frito', 300, 1.5, 45.0, 12.0, 2.0, 100, [
    ['Porção pequena', 80, '1 porção pequena (~80g)'],
    ['Porção média', 120, '1 porção média (~120g)'],
  ]),
  food('inhame_cru', 'Inhame cru', 'Legumes', 'cru', 97, 2.0, 23.0, 0.1, 2.0, 100, [
    ['Pedaço médio', 60, '1 pedaço médio cru (~60g)'],
    ['Xícara de chá em cubos', 150, '1 xícara de inhame em cubos (~150g)'],
  ]),
  food('inhame_cozido', 'Inhame cozido', 'Legumes', 'cozido', 98, 2.0, 23.5, 0.1, 2.1, 100, [
    ['Pedaço médio', 60, '1 pedaço médio cozido (~60g)'],
    ['Colher de servir amassado', 60, '1 colher de servir (~60g)'],
  ]),
  food('beterraba_crua', 'Beterraba crua', 'Legumes', 'cru', 49, 1.6, 11.0, 0.2, 3.4, 100, [
    ['Unidade média', 100, '1 beterraba média crua (~100g)'],
    ['Fatia média', 20, '1 fatia média (~20g)'],
    ['Xícara de chá ralada', 100, '1 xícara de beterraba ralada (~100g)'],
  ]),
  food('beterraba_cozida', 'Beterraba cozida', 'Legumes', 'cozido', 32, 1.3, 7.0, 0.1, 2.0, 100, [
    ['Unidade média', 100, '1 beterraba média cozida (~100g)'],
    ['Fatia média', 20, '1 fatia média cozida (~20g)'],
  ]),
  food('cenoura_crua', 'Cenoura crua', 'Legumes', 'cru', 34, 1.3, 7.7, 0.2, 3.2, 80, [
    ['Unidade média', 100, '1 cenoura média crua (~100g)'],
    ['Fatia média', 10, '1 rodela média (~10g)'],
    ['Xícara de chá ralada', 80, '1 xícara de cenoura ralada (~80g)'],
  ]),
  food('cenoura_cozida', 'Cenoura cozida', 'Legumes', 'cozido', 30, 0.8, 6.7, 0.2, 2.5, 80, [
    ['Unidade média', 100, '1 cenoura média cozida (~100g)'],
    ['Colher de servir', 45, '1 colher de servir (~45g)'],
  ]),
  food('abobora_crua', 'Abóbora crua', 'Legumes', 'cru', 26, 1.0, 6.0, 0.1, 1.7, 100, [
    ['Pedaço médio', 50, '1 pedaço médio cru (~50g)'],
    ['Xícara de chá em cubos', 120, '1 xícara de abóbora em cubos (~120g)'],
  ]),
  food('chuchu_cru', 'Chuchu cru', 'Legumes', 'cru', 17, 0.8, 4.0, 0.1, 1.0, 100, [
    ['Unidade média', 150, '1 chuchu médio cru (~150g)'],
    ['Pedaço médio', 50, '1 pedaço médio (~50g)'],
  ]),
  food('chuchu_cozido', 'Chuchu cozido', 'Legumes', 'cozido', 19, 0.8, 4.5, 0.1, 1.2, 100, [
    ['Pedaço médio', 50, '1 pedaço médio cozido (~50g)'],
    ['Colher de servir', 50, '1 colher de servir (~50g)'],
  ]),
  food('brocolis_cru', 'Brócolis cru', 'Legumes', 'cru', 34, 2.8, 6.6, 0.4, 2.6, 80, [
    ['Ramo médio', 25, '1 florete / ramo médio (~25g)'],
    ['Xícara de chá picado', 80, '1 xícara de brócolis picado (~80g)'],
  ]),
  food('couve_flor_crua', 'Couve-flor crua', 'Legumes', 'cru', 23, 1.9, 4.5, 0.3, 2.0, 80, [
    ['Ramo médio', 50, '1 ramo médio (~50g)'],
    ['Xícara de chá picada', 80, '1 xícara de couve-flor picada (~80g)'],
  ]),
  food('couve_flor_cozida', 'Couve-flor cozida', 'Legumes', 'cozido', 19, 1.5, 3.7, 0.2, 1.8, 80, [
    ['Ramo médio', 50, '1 ramo médio cozido (~50g)'],
    ['Colher de servir', 45, '1 colher de servir (~45g)'],
  ]),
  food('couve_manteiga_crua', 'Couve-manteiga crua', 'Legumes', 'cru', 27, 2.9, 4.3, 0.5, 3.0, 50, [
    ['Folha média', 15, '1 folha média (~15g)'],
    ['Xícara de chá picada', 50, '1 xícara de couve picada (~50g)'],
  ]),
  food('couve_manteiga_refogada', 'Couve-manteiga refogada', 'Legumes', 'refogado', 90, 2.5, 6.0, 7.0, 3.5, 60, [
    ['Colher de servir', 45, '1 colher de servir (~45g)'],
    ['Colher de sopa cheia', 25, '1 colher de sopa (~25g)'],
  ]),
  food('espinafre_cru', 'Espinafre cru', 'Legumes', 'cru', 23, 2.9, 3.6, 0.4, 2.2, 50, [
    ['Folha média', 10, '1 folha média (~10g)'],
    ['Xícara de chá picado', 50, '1 xícara de espinafre picado (~50g)'],
  ]),
  food('espinafre_refogado', 'Espinafre refogado', 'Legumes', 'refogado', 67, 2.5, 4.0, 5.0, 2.5, 60, [
    ['Colher de servir', 45, '1 colher de servir (~45g)'],
    ['Colher de sopa cheia', 25, '1 colher de sopa (~25g)'],
  ]),
  food('repolho_cru', 'Repolho cru', 'Legumes', 'cru', 17, 1.3, 3.9, 0.1, 1.9, 60, [
    ['Xícara de chá picado', 60, '1 xícara de repolho picado (~60g)'],
    ['Prato raso cheio', 80, 'Porção de um prato raso (~80g)'],
  ]),
  food('pepino_cru', 'Pepino cru', 'Legumes', 'cru', 10, 0.7, 2.4, 0.1, 0.5, 60, [
    ['Fatia média', 10, '1 rodela média (~10g)'],
    ['Unidade média', 150, '1 pepino médio (~150g)'],
    ['Xícara de chá em fatias', 80, '1 xícara de pepino em fatias (~80g)'],
  ]),
  food('pimentao_cru', 'Pimentão cru', 'Legumes', 'cru', 21, 0.9, 4.9, 0.2, 1.7, 60, [
    ['Fatia média', 15, '1 fatia média (~15g)'],
    ['Unidade média', 120, '1 pimentão médio (~120g)'],
  ]),
  food('cebola_crua', 'Cebola crua', 'Legumes', 'cru', 39, 1.1, 9.3, 0.1, 1.7, 50, [
    ['Unidade média', 100, '1 cebola média (~100g)'],
    ['Colher de sopa picada', 15, '1 colher de sopa de cebola picada (~15g)'],
  ]),
  food('berinjela_crua', 'Berinjela crua', 'Legumes', 'cru', 20, 0.8, 4.8, 0.1, 3.0, 80, [
    ['Fatia média', 30, '1 fatia média (~30g)'],
    ['Unidade média', 200, '1 berinjela média (~200g)'],
  ]),
  food('berinjela_assada', 'Berinjela assada', 'Legumes', 'assado', 36, 1.0, 8.0, 0.2, 2.5, 80, [
    ['Fatia média', 30, '1 fatia assada (~30g)'],
    ['Colher de servir', 50, '1 colher de servir (~50g)'],
  ]),
  food('abobrinha_crua', 'Abobrinha crua', 'Legumes', 'cru', 19, 1.2, 4.0, 0.1, 1.2, 80, [
    ['Fatia média', 20, '1 fatia média (~20g)'],
    ['Unidade média', 200, '1 abobrinha média (~200g)'],
  ]),
  food('tomate_assado', 'Tomate assado', 'Legumes', 'assado', 25, 1.0, 5.0, 0.2, 1.0, 80, [
    ['Fatia média', 20, '1 fatia assada (~20g)'],
    ['Unidade média', 90, '1 tomate médio assado (~90g)'],
  ]),
  food('rucula_crua', 'Rúcula crua', 'Legumes', 'cru', 13, 1.4, 2.2, 0.3, 1.6, 30, [
    ['Folha média', 5, '1 folha média (~5g)'],
    ['Prato raso cheio', 40, 'Porção de um prato raso (~40g)'],
  ]),
  food('agriao_cru', 'Agrião cru', 'Legumes', 'cru', 15, 2.0, 2.0, 0.2, 1.5, 30, [
    ['Folha média', 5, '1 folha média (~5g)'],
    ['Prato raso cheio', 40, 'Porção de um prato raso (~40g)'],
  ]),
  food('cogumelo_cru', 'Cogumelo champignon cru', 'Legumes', 'cru', 22, 3.1, 3.3, 0.3, 1.0, 50, [
    ['1 unidade média', 15, '1 cogumelo médio (~15g)'],
    ['Xícara de chá fatiado', 70, '1 xícara de cogumelo fatiado (~70g)'],
  ]),
  food('cogumelo_refogado', 'Cogumelo champignon refogado', 'Legumes', 'refogado', 43, 3.0, 4.0, 2.5, 1.0, 50, [
    ['Colher de sopa cheia', 25, '1 colher de sopa (~25g)'],
    ['Colher de servir', 50, '1 colher de servir (~50g)'],
  ]),
  food('milho_verde_cru', 'Milho verde cru', 'Legumes', 'cru', 138, 5.0, 28.0, 1.0, 3.0, 100, [
    ['1 espiga média', 150, '1 espiga média crua (~150g)'],
    ['Colher de sopa cheia', 20, '1 colher de sopa de milho (~20g)'],
  ]),
  food('milho_verde_cozido', 'Milho verde cozido', 'Legumes', 'cozido', 98, 3.2, 21.0, 1.0, 2.5, 100, [
    ['1 espiga média', 150, '1 espiga média cozida (~150g)'],
    ['Colher de sopa cheia', 20, '1 colher de sopa de milho cozido (~20g)'],
    ['Xícara de chá', 150, '1 xícara de milho (~150g)'],
  ]),

  // ===== FRUTAS =====
  food('banana_nanica', 'Banana nanica crua', 'Frutas', 'cru', 92, 1.4, 23.8, 0.1, 2.0, 100, [
    ['Unidade média', 100, '1 banana nanica média sem casca (~100g)'],
    ['Unidade pequena', 70, '1 banana pequena (~70g)'],
    ['Xícara de chá amassada', 200, '1 xícara de banana amassada (~200g)'],
  ]),
  food('banana_da_terra', 'Banana-da-terra crua', 'Frutas', 'cru', 128, 1.5, 33.0, 0.2, 2.5, 100, [
    ['Unidade média', 120, '1 banana-da-terra média sem casca (~120g)'],
    ['Fatia média', 15, '1 rodela média (~15g)'],
  ]),
  food('laranja_pera', 'Laranja pera crua', 'Frutas', 'cru', 45, 1.0, 11.0, 0.1, 2.4, 130, [
    ['1 unidade média', 130, '1 laranja média sem casca (~130g)'],
    ['1/2 unidade', 65, 'Meia laranja (~65g)'],
    ['Fatia média', 20, '1 fatia (~20g)'],
  ]),
  food('mexerica', 'Mexerica / tangerina crua', 'Frutas', 'cru', 38, 0.8, 9.5, 0.1, 1.8, 100, [
    ['1 unidade média', 100, '1 mexerica média sem casca (~100g)'],
    ['1/2 unidade', 50, 'Meia mexerica (~50g)'],
  ]),
  food('limao', 'Limão cru', 'Frutas', 'cru', 32, 0.9, 10.0, 0.1, 2.0, 50, [
    ['1 unidade média', 50, '1 limão médio (~50g)'],
    ['Colher de sopa de suco', 15, '1 colher de sopa de suco (~15g)'],
  ]),
  food('mamao_formosa', 'Mamão formosa cru', 'Frutas', 'cru', 45, 0.5, 11.5, 0.1, 1.0, 150, [
    ['Fatia média', 150, '1 fatia média (~150g)'],
    ['Xícara de chá em cubos', 150, '1 xícara de mamão em cubos (~150g)'],
  ]),
  food('manga', 'Manga crua', 'Frutas', 'cru', 64, 0.5, 16.5, 0.2, 1.6, 120, [
    ['1 unidade média', 120, '1 manga média sem casca (~120g)'],
    ['Fatia média', 40, '1 fatia média (~40g)'],
    ['Xícara de chá em cubos', 150, '1 xícara de manga em cubos (~150g)'],
  ]),
  food('abacaxi', 'Abacaxi cru', 'Frutas', 'cru', 48, 0.9, 12.3, 0.1, 1.4, 100, [
    ['Fatia média', 80, '1 fatia média (~80g)'],
    ['Xícara de chá em cubos', 150, '1 xícara de abacaxi em cubos (~150g)'],
  ]),
  food('melancia', 'Melancia crua', 'Frutas', 'cru', 33, 0.6, 8.0, 0.2, 0.4, 150, [
    ['Fatia média', 150, '1 fatia média (~150g)'],
    ['Xícara de chá em cubos', 150, '1 xícara de melancia em cubos (~150g)'],
  ]),
  food('melao', 'Melão cru', 'Frutas', 'cru', 29, 0.7, 7.0, 0.1, 0.8, 120, [
    ['Fatia média', 120, '1 fatia média (~120g)'],
    ['Xícara de chá em cubos', 150, '1 xícara de melão em cubos (~150g)'],
  ]),
  food('uva', 'Uva crua', 'Frutas', 'cru', 53, 0.6, 13.5, 0.1, 0.9, 100, [
    ['1 cacho pequeno', 100, '1 cacho pequeno (~100g)'],
    ['10 unidades', 50, '10 uvas médias (~50g)'],
  ]),
  food('pera', 'Pera crua', 'Frutas', 'cru', 53, 0.4, 13.5, 0.1, 3.0, 130, [
    ['1 unidade média', 130, '1 pera média (~130g)'],
    ['Fatia média', 20, '1 fatia média (~20g)'],
  ]),
  food('goiaba', 'Goiaba crua', 'Frutas', 'cru', 54, 1.1, 12.5, 0.4, 5.4, 100, [
    ['1 unidade média', 100, '1 goiaba média (~100g)'],
    ['Fatia média', 30, '1 fatia média (~30g)'],
  ]),
  food('kiwi', 'Kiwi cru', 'Frutas', 'cru', 51, 1.1, 12.0, 0.4, 3.0, 80, [
    ['1 unidade média', 80, '1 kiwi médio (~80g)'],
    ['Fatia média', 10, '1 fatia média (~10g)'],
  ]),
  food('ameixa', 'Ameixa crua', 'Frutas', 'cru', 53, 0.7, 13.0, 0.2, 1.9, 60, [
    ['1 unidade média', 60, '1 ameixa média (~60g)'],
    ['3 unidades', 180, '3 ameixas médias (~180g)'],
  ]),
  food('pessego', 'Pêssego cru', 'Frutas', 'cru', 36, 0.8, 9.0, 0.1, 1.5, 100, [
    ['1 unidade média', 100, '1 pêssego médio (~100g)'],
    ['Fatia média', 20, '1 fatia média (~20g)'],
  ]),
  food('caju', 'Caju cru', 'Frutas', 'cru', 43, 1.0, 10.0, 0.2, 0.9, 100, [
    ['1 unidade média', 100, '1 caju médio (~100g)'],
    ['Fatia média', 30, '1 fatia média (~30g)'],
  ]),
  food('maracuja', 'Maracujá cru', 'Frutas', 'cru', 68, 2.0, 12.0, 0.5, 10.0, 100, [
    ['1 unidade média', 100, '1 maracujá médio (~100g)'],
    ['Colher de sopa de polpa', 20, '1 colher de sopa de polpa (~20g)'],
  ]),
  food('coco_fresco', 'Coco fresco', 'Frutas', 'cru', 354, 3.3, 15.0, 33.0, 9.0, 50, [
    ['1 pedaço médio', 50, '1 pedaço médio (~50g)'],
    ['Colher de sopa ralado', 15, '1 colher de sopa de coco ralado (~15g)'],
  ]),
  food('amendoim_cru', 'Amendoim cru', 'Frutas', 'cru', 544, 27.0, 16.0, 44.0, 8.0, 30, [
    ['Colher de sopa cheia', 20, '1 colher de sopa de amendoim (~20g)'],
    ['Punhado', 30, '1 punhado (~30g)'],
  ]),
  food('amendoim_torrado', 'Amendoim torrado', 'Frutas', 'assado', 606, 26.0, 18.0, 50.0, 8.0, 30, [
    ['Colher de sopa cheia', 20, '1 colher de sopa de amendoim (~20g)'],
    ['Punhado', 30, '1 punhado (~30g)'],
  ]),
  food('castanha_caju', 'Castanha-de-caju', 'Frutas', 'cru', 570, 18.0, 30.0, 46.0, 3.0, 30, [
    ['1 unidade média', 5, '1 castanha-de-caju (~5g)'],
    ['Punhado', 30, '1 punhado (~30g)'],
  ]),
  food('nozes', 'Nozes', 'Frutas', 'cru', 620, 15.0, 14.0, 59.0, 7.0, 30, [
    ['1 unidade média', 5, '1 noz média (~5g)'],
    ['Punhado', 30, '1 punhado (~30g)'],
  ]),
  food('amendoas', 'Amêndoas', 'Frutas', 'cru', 579, 21.0, 22.0, 50.0, 12.0, 30, [
    ['1 unidade média', 1, '1 amêndoa (~1g)'],
    ['Punhado', 30, '1 punhado (~30g)'],
  ]),
  food('azeitona', 'Azeitona', 'Frutas', 'cru', 145, 1.0, 4.0, 14.0, 2.0, 30, [
    ['1 unidade média', 5, '1 azeitona média (~5g)'],
    ['Colher de sopa', 20, '1 colher de sopa (~20g)'],
  ]),

  // ===== LATICÍNIOS =====
  food('leite_integral', 'Leite integral fluido', 'Laticinios', 'cru', 61, 3.2, 4.8, 3.3, 0.0, 200, [
    ['Copo americano (150ml)', 150, '1 copo americano (~150ml)'],
    ['Copo de requeijão (200ml)', 200, '1 copo de 200ml (~200ml)'],
    ['Xícara de chá (240ml)', 240, '1 xícara cheia (~240ml)'],
  ]),
  food('leite_semidesnatado', 'Leite semidesnatado fluido', 'Laticinios', 'cru', 50, 3.3, 4.9, 2.0, 0.0, 200, [
    ['Copo americano (150ml)', 150, '1 copo americano (~150ml)'],
    ['Copo de requeijão (200ml)', 200, '1 copo de 200ml (~200ml)'],
    ['Xícara de chá (240ml)', 240, '1 xícara cheia (~240ml)'],
  ]),
  food('queijo_mussarela', 'Queijo mussarela', 'Laticinios', 'cru', 330, 22.0, 2.0, 26.0, 0.0, 30, [
    ['1 fatia média', 30, '1 fatia média (~30g)'],
    ['1 fatia fina', 20, '1 fatia fina (~20g)'],
    ['Xícara de chá ralado', 100, '1 xícara de queijo ralado (~100g)'],
  ]),
  food('queijo_prato', 'Queijo prato', 'Laticinios', 'cru', 360, 23.0, 2.0, 29.0, 0.0, 30, [
    ['1 fatia média', 30, '1 fatia média (~30g)'],
    ['1 fatia fina', 20, '1 fatia fina (~20g)'],
  ]),
  food('queijo_parmesao', 'Queijo parmesão', 'Laticinios', 'cru', 453, 36.0, 2.0, 33.0, 0.0, 20, [
    ['Colher de sopa ralado', 10, '1 colher de sopa de parmesão ralado (~10g)'],
    ['1 fatia média', 20, '1 fatia média (~20g)'],
  ]),
  food('ricota', 'Ricota', 'Laticinios', 'cru', 140, 11.0, 3.0, 9.0, 0.0, 50, [
    ['1 fatia média', 30, '1 fatia média (~30g)'],
    ['Colher de sopa cheia', 25, '1 colher de sopa (~25g)'],
  ]),
  food('requeijao', 'Requeijão cremoso', 'Laticinios', 'cru', 257, 9.0, 3.0, 23.0, 0.0, 30, [
    ['Colher de sopa cheia', 25, '1 colher de sopa (~25g)'],
    ['1 fatia / porção', 30, '1 porção individual (~30g)'],
  ]),
  food('iogurte_integral', 'Iogurte integral natural', 'Laticinios', 'cru', 61, 3.5, 5.0, 3.0, 0.0, 170, [
    ['Pote padrão', 170, '1 pote comercial (~170g)'],
    ['Colher de sopa cheia', 25, '1 colher de sopa (~25g)'],
    ['Copo americano (200ml)', 200, '1 copo cheio (~200g)'],
  ]),
  food('iogurte_grego', 'Iogurte grego natural', 'Laticinios', 'cru', 97, 9.0, 4.0, 5.0, 0.0, 100, [
    ['Pote padrão', 100, '1 pote comercial (~100g)'],
    ['Colher de sopa cheia', 25, '1 colher de sopa (~25g)'],
  ]),
  food('creme_leite', 'Creme de leite', 'Laticinios', 'cru', 221, 2.0, 3.0, 22.0, 0.0, 30, [
    ['Colher de sopa cheia', 15, '1 colher de sopa (~15g)'],
    ['Colher de servir', 30, '1 colher de servir (~30g)'],
  ]),
  food('leite_condensado', 'Leite condensado', 'Laticinios', 'cru', 313, 8.0, 57.0, 7.0, 0.0, 20, [
    ['Colher de sopa cheia', 20, '1 colher de sopa (~20g)'],
    ['Colher de chá', 7, '1 colher de chá (~7g)'],
  ]),
  food('doce_leite', 'Doce de leite', 'Laticinios', 'cru', 306, 6.0, 55.0, 7.0, 0.0, 20, [
    ['Colher de sopa cheia', 20, '1 colher de sopa (~20g)'],
    ['Colher de chá', 7, '1 colher de chá (~7g)'],
  ]),

  // ===== PÃES, CEREAIS, DOCES E SNACKS =====
  food('pao_queijo_assado', 'Pão de queijo assado', 'Paes', 'assado', 363, 5.0, 38.0, 22.0, 1.0, 40, [
    ['1 unidade pequena', 20, '1 pão de queijo pequeno (~20g)'],
    ['1 unidade média', 40, '1 pão de queijo médio (~40g)'],
    ['3 unidades médias', 120, '3 pães de queijo médios (~120g)'],
  ]),
  food('bolo_simples_assado', 'Bolo simples assado', 'Doces', 'assado', 300, 5.0, 45.0, 11.0, 1.0, 60, [
    ['1 fatia média', 60, '1 fatia média (~60g)'],
    ['1 fatia pequena', 40, '1 fatia pequena (~40g)'],
  ]),
  food('biscoito_cream_cracker', 'Biscoito cream cracker', 'Paes', 'assado', 432, 10.0, 68.0, 14.0, 2.0, 30, [
    ['1 unidade', 8, '1 biscoito (~8g)'],
    ['3 unidades', 24, '3 biscoitos (~24g)'],
    ['6 unidades', 48, '6 biscoitos (~48g)'],
  ]),
  food('torrada_integral', 'Torrada integral', 'Paes', 'assado', 360, 12.0, 65.0, 5.0, 6.0, 30, [
    ['1 fatia', 10, '1 torrada (~10g)'],
    ['3 fatias', 30, '3 torradas (~30g)'],
  ]),
  food('granola', 'Granola', 'Paes', 'assado', 421, 10.0, 65.0, 14.0, 7.0, 40, [
    ['Colher de sopa cheia', 15, '1 colher de sopa de granola (~15g)'],
    ['Xícara de chá', 100, '1 xícara de granola (~100g)'],
  ]),
  food('pipoca_estourada', 'Pipoca estourada', 'Paes', 'assado', 387, 12.0, 78.0, 4.0, 15.0, 30, [
    ['1 xícara de chá', 8, '1 xícara de pipoca (~8g)'],
    ['1 tigela pequena', 30, '1 tigela pequena (~30g)'],
    ['1 tigela média', 60, '1 tigela média (~60g)'],
  ]),
  food('panqueca', 'Panqueca simples', 'Paes', 'frito', 194, 6.0, 28.0, 7.0, 1.0, 100, [
    ['1 unidade média', 100, '1 panqueca média (~100g)'],
    ['2 unidades', 200, '2 panquecas médias (~200g)'],
  ]),
  food('mel', 'Mel', 'Doces', 'cru', 309, 0.3, 84.0, 0.0, 0.0, 20, [
    ['Colher de sopa cheia', 20, '1 colher de sopa (~20g)'],
    ['Colher de chá', 7, '1 colher de chá (~7g)'],
  ]),
  food('acucar', 'Açúcar refinado', 'Doces', 'cru', 387, 0.0, 100.0, 0.0, 0.0, 10, [
    ['Colher de sopa cheia', 12, '1 colher de sopa (~12g)'],
    ['Colher de chá', 4, '1 colher de chá (~4g)'],
  ]),
  food('achocolatado_po', 'Achocolatado em pó', 'Doces', 'cru', 400, 5.0, 85.0, 4.0, 3.0, 20, [
    ['Colher de sopa cheia', 15, '1 colher de sopa (~15g)'],
    ['Colher de chá', 5, '1 colher de chá (~5g)'],
  ]),
  food('chocolate_ao_leite', 'Chocolate ao leite', 'Doces', 'cru', 535, 7.0, 59.0, 30.0, 3.0, 30, [
    ['1 quadradinho', 10, '1 quadradinho (~10g)'],
    ['3 quadradinhos', 30, '3 quadradinhos (~30g)'],
    ['1 barra pequena', 90, '1 barra pequena (~90g)'],
  ]),

  // ===== GORDURAS E SEMENTES =====
  food('oleo_soja', 'Óleo de soja', 'Gorduras', 'cru', 884, 0.0, 0.0, 100.0, 0.0, 10, [
    ['Colher de sopa', 13, '1 colher de sopa (~13g)'],
    ['Colher de chá', 5, '1 colher de chá (~5g)'],
    ['1 fio', 4, '1 fio de óleo (~4g)'],
  ]),
  food('margarina', 'Margarina com sal', 'Gorduras', 'cru', 596, 0.9, 0.5, 66.0, 0.0, 10, [
    ['Colher de chá rasa', 5, '1 colher de chá (~5g)'],
    ['Colher de sopa rasa', 12, '1 colher de sopa (~12g)'],
    ['1 ponta de faca', 5, '1 ponta de faca (~5g)'],
  ]),
  food('semente_chia', 'Semente de chia', 'Gorduras', 'cru', 486, 17.0, 42.0, 31.0, 34.0, 15, [
    ['Colher de sopa cheia', 12, '1 colher de sopa (~12g)'],
    ['Colher de chá', 4, '1 colher de chá (~4g)'],
  ]),
  food('semente_linhaca', 'Semente de linhaça', 'Gorduras', 'cru', 495, 18.0, 43.0, 34.0, 27.0, 15, [
    ['Colher de sopa cheia', 12, '1 colher de sopa (~12g)'],
    ['Colher de chá', 4, '1 colher de chá (~4g)'],
  ]),

  // ===== BEBIDAS =====
  food('cafe_coado', 'Café coado sem açúcar', 'Bebidas', 'cozido', 2, 0.1, 0.3, 0.0, 0.0, 200, [
    ['Xícara de café (60ml)', 60, '1 xícara pequena (~60ml)'],
    ['Xícara de chá (240ml)', 240, '1 xícara grande (~240ml)'],
  ]),
  food('suco_laranja', 'Suco de laranja natural', 'Bebidas', 'cru', 37, 0.7, 8.5, 0.1, 0.2, 200, [
    ['Copo americano (150ml)', 150, '1 copo americano (~150ml)'],
    ['Copo de 200ml', 200, '1 copo de 200ml (~200ml)'],
    ['Copo de 300ml', 300, '1 copo grande (~300ml)'],
  ]),
  food('refrigerante_cola', 'Refrigerante tipo cola', 'Bebidas', 'cru', 37, 0.0, 9.5, 0.0, 0.0, 350, [
    ['Lata (350ml)', 350, '1 lata (~350ml)'],
    ['Copo de 200ml', 200, '1 copo de 200ml (~200ml)'],
    ['Garrafa pequena (600ml)', 600, '1 garrafa pequena (~600ml)'],
  ]),
  food('cerveja', 'Cerveja pilsen', 'Bebidas', 'cru', 43, 0.6, 3.5, 0.0, 0.0, 350, [
    ['Lata (350ml)', 350, '1 lata (~350ml)'],
    ['Long neck (330ml)', 330, '1 long neck (~330ml)'],
    ['Copo de 300ml', 300, '1 copo (~300ml)'],
  ]),
  food('vinho_tinto', 'Vinho tinto', 'Bebidas', 'cru', 85, 0.1, 2.5, 0.0, 0.0, 150, [
    ['Taça (150ml)', 150, '1 taça (~150ml)'],
    ['Copo de 200ml', 200, '1 copo (~200ml)'],
  ]),

  // ===== SUPLEMENTOS =====
  food('albumina', 'Albumina em pó', 'Suplementos', 'cru', 350, 80.0, 5.0, 0.5, 0.0, 30, [
    ['1 dosador / scoop', 30, '1 scoop padrão (~30g)'],
    ['Colher de sopa cheia', 15, '1 colher de sopa (~15g)'],
  ], 'USDA'),
];
