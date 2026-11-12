export interface MeasureDefinition {
  id: string;
  name: string;
  shortLabel: string;
  typicalVolumeMl?: number;
  description: string;
  visualIcon: string; // e.g. spoon, cup, hand, etc.
}

export const COMMON_HOUSEHOLD_MEASURES: MeasureDefinition[] = [
  {
    id: 'colher_sopa',
    name: 'Colher de sopa',
    shortLabel: 'c. sopa',
    typicalVolumeMl: 15,
    description: 'Colher de refeição padrão (~15ml líquido, 15-30g dependendo da densidade)',
    visualIcon: 'Utensils',
  },
  {
    id: 'colher_cha',
    name: 'Colher de chá',
    shortLabel: 'c. chá',
    typicalVolumeMl: 5,
    description: 'Colher pequena de café/chá (~5ml / 5g)',
    visualIcon: 'Coffee',
  },
  {
    id: 'colher_servir',
    name: 'Colher de servir',
    shortLabel: 'c. servir',
    typicalVolumeMl: 45,
    description: 'Colher grande para servir arroz e carnes moídas (~45-60g)',
    visualIcon: 'UtensilsCrossed',
  },
  {
    id: 'concha',
    name: 'Concha',
    shortLabel: 'concha',
    typicalVolumeMl: 130,
    description: 'Concha funda tradicional para feijão, sopas e caldos (~130g)',
    visualIcon: 'Soup',
  },
  {
    id: 'xicara',
    name: 'Xícara de chá (240ml)',
    shortLabel: 'xícara',
    typicalVolumeMl: 240,
    description: 'Xícara de medida culinária padrão de 240ml',
    visualIcon: 'CupSoda',
  },
  {
    id: 'copo',
    name: 'Copo americano / requeijão',
    shortLabel: 'copo',
    typicalVolumeMl: 200,
    description: 'Copo de vidro tradicional de 150ml a 200ml',
    visualIcon: 'GlassWater',
  },
  {
    id: 'fatia',
    name: 'Fatia',
    shortLabel: 'fatia',
    description: 'Fatia de pão, queijo, fruta ou bolo',
    visualIcon: 'Layers',
  },
  {
    id: 'unidade',
    name: 'Unidade',
    shortLabel: 'unid.',
    description: 'Alimento inteiro unitário (ovo, fruta, pão)',
    visualIcon: 'CircleDot',
  },
  {
    id: 'pedaco_medio',
    name: 'Pedaço médio',
    shortLabel: 'ped. médio',
    description: 'Pedaço ou cubo médio (mandioca, batata, bolo)',
    visualIcon: 'Square',
  },
  {
    id: 'file',
    name: 'Filé / Bife',
    shortLabel: 'filé',
    description: 'Filé de peito de frango, carne bovina ou peixe grelhado',
    visualIcon: 'Beef',
  },
  {
    id: 'porcao',
    name: 'Porção',
    shortLabel: 'porção',
    description: 'Porção individual padrão servida no prato',
    visualIcon: 'Sparkles',
  },
];

export interface VisualReference {
  name: string;
  bodyPart: string;
  approxWeightEquivalent: string;
  bestFor: string;
  explanation: string;
}

export const VISUAL_HAND_REFERENCES: VisualReference[] = [
  {
    name: 'Palma da Mão (sem dedos)',
    bodyPart: 'Palma aberta',
    approxWeightEquivalent: '100g a 130g',
    bestFor: 'Filé de frango, bife magro, peixe grelhado',
    explanation: 'A palma da sua mão aberta (desconsiderando os dedos) e com espessura de 1 dedo equivale a aproximadamente 100g-130g de proteína magra pronta.',
  },
  {
    name: 'Punho Fechado',
    bodyPart: 'Punho fechado',
    approxWeightEquivalent: '1 xícara / ~100g a 150g',
    bestFor: 'Arroz, massas, batata cozida, salada de frutas',
    explanation: 'O volume do seu punho fechado equivale a aproximadamente 1 xícara de carboidrato cozido ou vegetais.',
  },
  {
    name: 'Concha da Mão (Punhado)',
    bodyPart: 'Mão em concha',
    approxWeightEquivalent: '25g a 30g',
    bestFor: 'Castanhas, amêndoas, nozes, granola',
    explanation: 'A quantidade de oleaginosas que cabe na concha da mão sem transbordar é a porção padrão de 25g a 30g.',
  },
  {
    name: 'Polegar Inteiro',
    bodyPart: 'Polegar da ponta à junta',
    approxWeightEquivalent: '1 colher de sopa / ~15g a 20g',
    bestFor: 'Pasta de amendoim, queijo cremoso, azeite, manteiga',
    explanation: 'O comprimento do polegar corresponde a aproximadamente 1 colher de sopa (15 a 20g de gordura ou pasta).',
  },
  {
    name: 'Ponta do Indicador',
    bodyPart: 'Primeira falange do indicador',
    approxWeightEquivalent: '1 colher de chá / ~5g',
    bestFor: 'Azeite, manteiga pura, mel, geleia',
    explanation: 'A primeira pontinha do dedo indicador representa 1 colher de chá (aprox. 5g).',
  },
  {
    name: 'Baralho de Cartas',
    bodyPart: 'Objeto de bolso',
    approxWeightEquivalent: '~90g a 100g',
    bestFor: 'Bife bovino fino, queijo minas',
    explanation: 'Um bife com a área e espessura de um maço de baralho pesa cerca de 90 a 100g.',
  },
  {
    name: 'Bola de Tênis',
    bodyPart: 'Objeto esférico',
    approxWeightEquivalent: '~120g a 140g',
    bestFor: 'Maçã, laranja, pera, batata inglesa média',
    explanation: 'Frutas esféricas com o tamanho de uma bola de tênis pesam em média 120g a 140g inteiras.',
  },
];
