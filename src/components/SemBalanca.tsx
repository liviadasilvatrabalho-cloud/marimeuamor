import React, { useState } from 'react';
import {
  Scale,
  Search,
  Check,
  Sparkles,
  Info,
  Utensils,
  ChevronRight,
  Hand,
  Plus,
} from 'lucide-react';
import { TACO_TBCA_DATABASE, DatabaseFood, calculateNutritionalValues } from '../data/nutritionDatabase';
import { VISUAL_HAND_REFERENCES, COMMON_HOUSEHOLD_MEASURES } from '../data/householdMeasures';
import { FoodItem, MealType, PrepState, MealSlot } from '../types';
import { INITIAL_MEAL_SLOTS } from '../services/storage';

interface SemBalancaProps {
  onAddMealItem: (item: FoodItem, mealType: MealType) => void;
  initialMealType?: MealType;
  mealSlots?: MealSlot[];
}

const PREP_OPTIONS: { id: PrepState | 'todos'; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'cru', label: 'Cru' },
  { id: 'cozido', label: 'Cozido' },
  { id: 'assado', label: 'Assado' },
  { id: 'grelhado', label: 'Grelhado' },
  { id: 'frito', label: 'Frito' },
  { id: 'refogado', label: 'Refogado' },
  { id: 'no_vapor', label: 'No vapor' },
];

export const SemBalanca: React.FC<SemBalancaProps> = ({
  onAddMealItem,
  initialMealType = 'almoco',
  mealSlots,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPrep, setSelectedPrep] = useState<PrepState | 'todos'>('todos');
  const [selectedFood, setSelectedFood] = useState<DatabaseFood>(TACO_TBCA_DATABASE[0]);
  const [selectedMeasureIndex, setSelectedMeasureIndex] = useState<number>(0);
  const [quantityMultiplier, setQuantityMultiplier] = useState<number>(1);
  const [targetMealType, setTargetMealType] = useState<MealType>(initialMealType);
  const [showToast, setShowToast] = useState<boolean>(false);

  const slots = mealSlots && mealSlots.length ? mealSlots : INITIAL_MEAL_SLOTS;

  // Filter foods
  const filteredFoods = TACO_TBCA_DATABASE.filter((food) => {
    const matchSearch = food.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchPrep = selectedPrep === 'todos' || food.prepState === selectedPrep;
    return matchSearch && matchPrep;
  });

  // Current calculation
  const currentMeasure =
    selectedFood.householdConversions[selectedMeasureIndex] ||
    selectedFood.householdConversions[0] || {
      measure: 'Porção padrão',
      grams: selectedFood.defaultServingGrams,
      description: 'Porção de referência',
    };

  const computedGrams = Math.round(currentMeasure.grams * quantityMultiplier);
  const nutrition = calculateNutritionalValues(selectedFood, computedGrams);

  const handleLogItem = () => {
    const foodItem: FoodItem = {
      id: `sem-balanca-${Date.now()}`,
      name: selectedFood.name,
      prepState: selectedFood.prepState,
      portionGrams: computedGrams,
      calories: nutrition.calories,
      protein: nutrition.protein,
      carbs: nutrition.carbs,
      fat: nutrition.fat,
      fiber: nutrition.fiber,
      source: selectedFood.source,
      householdMeasure: `${quantityMultiplier}x ${currentMeasure.measure} (~${computedGrams}g)`,
      verified: true,
    };

    onAddMealItem(foodItem, targetMealType);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const adjustQuantity = (delta: number) => {
    setQuantityMultiplier((prev) => {
      const next = Math.round((prev + delta) * 100) / 100;
      return Math.min(99, Math.max(0.25, next));
    });
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-12">
      {/* Header Banner */}
      <div className="rounded-3xl bg-gradient-to-br from-[#18121F] via-[#100C16] to-[#09070D] border border-[#33263F] p-4 sm:p-6 lg:p-8">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#EC4899] uppercase tracking-wider mb-1">
          <Scale className="w-4 h-4" />
          <span>Modo Sem Balança</span>
        </div>
        <h1 className="font-heading text-lg sm:text-2xl lg:text-3xl font-bold text-[#F8F5FC]">
          Porções Precisas por Medidas Caseiras
        </h1>
        <p className="text-xs sm:text-sm text-[#B8AFC4] mt-1 max-w-2xl leading-relaxed">
          Nem sempre temos uma balança por perto. Aqui cada colher, concha, fatia ou xícara é calculada com a densidade real de cada alimento da Tabela TACO.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Food Selector & Household Conversions */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl bg-[#18121F] border border-[#33263F] p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[#F8F5FC]">
              1. Selecione o Alimento
            </h2>

            {/* Search */}
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Pesquisar alimento (ex: arroz, frango, feijão, banana...)"
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#100C16] border border-[#33263F] text-xs text-[#F8F5FC] focus:outline-none focus:border-[#8B5CF6]"
              />
              <Search className="w-4 h-4 text-[#B8AFC4] absolute left-3 top-3" />
            </div>

            {/* Preparation Filter */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {PREP_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedPrep(opt.id)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    selectedPrep === opt.id
                      ? 'bg-[#8B5CF6] text-white shadow-sm'
                      : 'bg-[#100C16] text-[#B8AFC4] border border-[#33263F] hover:text-[#F8F5FC] hover:border-[#8B5CF6]/40'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#B8AFC4]">
                {filteredFoods.length} alimento(s) encontrado(s)
              </span>
            </div>

            {/* Food Chips / Results */}
            <div className="flex flex-wrap gap-1.5 max-h-64 overflow-y-auto pr-1">
              {filteredFoods.map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    setSelectedFood(f);
                    setSelectedMeasureIndex(0);
                    setQuantityMultiplier(1);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                    selectedFood.id === f.id
                      ? 'bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] text-white shadow-md shadow-[#8B5CF6]/30'
                      : 'bg-[#100C16] text-[#B8AFC4] border border-[#33263F] hover:text-[#F8F5FC] hover:border-[#8B5CF6]/40'
                  }`}
                >
                  {f.name}
                </button>
              ))}
            </div>

            {/* Step 2: Choose Household Measure */}
            <div className="pt-4 border-t border-[#33263F] space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#F8F5FC]">
                  2. Escolha a Medida Caseira
                </h3>
                <span className="text-xs text-[#A78BFA]">
                  Densidade calibrada para {selectedFood.name}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-80 overflow-y-auto pr-1">
                {selectedFood.householdConversions.map((conv, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedMeasureIndex(idx)}
                    className={`p-3 rounded-xl text-left border transition-all ${
                      selectedMeasureIndex === idx
                        ? 'bg-[#22192C] border-[#EC4899] shadow-md shadow-[#EC4899]/15'
                        : 'bg-[#100C16] border-[#33263F] hover:border-[#8B5CF6]/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#F8F5FC]">
                        {conv.measure}
                      </span>
                      <span className="text-xs font-semibold text-[#A78BFA] font-mono-numbers">
                        ~{conv.grams}g
                      </span>
                    </div>
                    <p className="text-[11px] text-[#B8AFC4] mt-1 leading-snug">
                      {conv.description}
                    </p>
                  </button>
                ))}
              </div>

              {/* Multiplier */}
              <div className="p-3.5 sm:p-4 rounded-xl bg-[#100C16] border border-[#33263F] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs text-[#B8AFC4]">
                    Quantas medidas você consumiu?
                  </label>
                  <span className="text-[11px] font-mono-numbers text-[#A78BFA] shrink-0">
                    {computedGrams}g no total
                  </span>
                </div>

                {/* Stepper + custom amount */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => adjustQuantity(-1)}
                    aria-label="Diminuir quantidade"
                    className="w-9 h-9 shrink-0 rounded-xl bg-[#18121F] border border-[#33263F] text-[#F8F5FC] hover:border-[#8B5CF6]/50 flex items-center justify-center text-lg font-bold cursor-pointer"
                  >
                    −
                  </button>
                  <div className="flex-1 flex items-center justify-center gap-2 bg-[#18121F] border border-[#8B5CF6]/50 rounded-xl px-2 py-1.5">
                    <input
                      type="number"
                      min="0.25"
                      step="0.25"
                      max="99"
                      value={quantityMultiplier}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (Number.isFinite(val)) {
                          setQuantityMultiplier(Math.min(99, Math.max(0.25, val)));
                        }
                      }}
                      className="w-16 bg-transparent text-center font-mono-numbers text-lg font-bold text-[#F8F5FC] focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-[11px] text-[#B8AFC4]">medidas</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => adjustQuantity(1)}
                    aria-label="Aumentar quantidade"
                    className="w-9 h-9 shrink-0 rounded-xl bg-[#18121F] border border-[#33263F] text-[#F8F5FC] hover:border-[#8B5CF6]/50 flex items-center justify-center text-lg font-bold cursor-pointer"
                  >
                    +
                  </button>
                </div>

                <p className="text-[11px] text-[#A78BFA] text-center">
                  {quantityMultiplier} × {currentMeasure.measure} ≈ {computedGrams}g
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Calculated Nutrition & Add to Meal */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl bg-gradient-to-br from-[#18121F] to-[#100C16] border border-[#8B5CF6]/50 p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#33263F] pb-3">
              <div>
                <span className="text-[10px] text-[#A78BFA] uppercase tracking-wider font-semibold">
                  Resultado Nutricional
                </span>
                <h3 className="text-base font-bold text-[#F8F5FC] mt-0.5">
                  {selectedFood.name}
                </h3>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-[#8B5CF6]/20 text-[#A78BFA] text-[10px] font-bold">
                Fonte: {selectedFood.source}
              </span>
            </div>

            {/* Calculated Weight and Calories */}
            <div className="p-4 rounded-xl bg-[#100C16] border border-[#33263F] flex items-center justify-between">
              <div>
                <span className="text-xs text-[#B8AFC4]">Peso Estimado:</span>
                <div className="text-2xl font-bold text-[#F8F5FC] font-mono-numbers">
                  {computedGrams} <span className="text-sm font-normal text-[#B8AFC4]">gramas</span>
                </div>
                <p className="text-[11px] text-[#A78BFA] mt-0.5">
                  {quantityMultiplier}x {currentMeasure.measure}
                </p>
              </div>

              <div className="text-right">
                <span className="text-xs text-[#B8AFC4]">Energia:</span>
                <div className="text-2xl font-bold text-[#EC4899] font-mono-numbers">
                  {nutrition.calories} <span className="text-sm font-normal text-[#B8AFC4]">kcal</span>
                </div>
              </div>
            </div>

            {/* Detailed Macros */}
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2 font-mono-numbers text-center">
              <div className="p-2 sm:p-2.5 rounded-xl bg-[#100C16] border border-[#33263F]">
                <span className="text-[9px] sm:text-[10px] text-[#B8AFC4] block truncate">Proteína</span>
                <span className="text-xs sm:text-sm font-bold text-[#8B5CF6]">
                  {nutrition.protein}g
                </span>
              </div>
              <div className="p-2 sm:p-2.5 rounded-xl bg-[#100C16] border border-[#33263F]">
                <span className="text-[9px] sm:text-[10px] text-[#B8AFC4] block truncate">Carboidrato</span>
                <span className="text-xs sm:text-sm font-bold text-[#EC4899]">
                  {nutrition.carbs}g
                </span>
              </div>
              <div className="p-2 sm:p-2.5 rounded-xl bg-[#100C16] border border-[#33263F]">
                <span className="text-[9px] sm:text-[10px] text-[#B8AFC4] block truncate">Gordura</span>
                <span className="text-xs sm:text-sm font-bold text-[#F472B6]">
                  {nutrition.fat}g
                </span>
              </div>
              <div className="p-2 sm:p-2.5 rounded-xl bg-[#100C16] border border-[#33263F]">
                <span className="text-[9px] sm:text-[10px] text-[#B8AFC4] block truncate">Fibras</span>
                <span className="text-xs sm:text-sm font-bold text-[#38BDF8]">
                  {nutrition.fiber}g
                </span>
              </div>
            </div>

            {/* Meal Destination Selector */}
            <div className="pt-2">
              <label className="text-xs text-[#B8AFC4] block mb-1.5">
                Salvar em qual refeição de hoje?
              </label>
              <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-5 gap-1.5">
                {slots.map((slot) => (
                  <button
                    key={slot.id}
                    onClick={() => setTargetMealType(slot.id)}
                    className={`py-2 px-1.5 text-center rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                      targetMealType === slot.id
                        ? 'bg-[#8B5CF6] text-white shadow-md shadow-[#8B5CF6]/30 font-semibold'
                        : 'bg-[#100C16] text-[#B8AFC4] border border-[#33263F] hover:text-[#F8F5FC]'
                    }`}
                  >
                    <span className="shrink-0">{slot.icon}</span>
                    <span className="truncate">{slot.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Add Button */}
            <button
              onClick={handleLogItem}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#6D28D9] via-[#8B5CF6] to-[#EC4899] hover:opacity-95 text-white text-xs font-bold shadow-lg shadow-[#8B5CF6]/30 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar ao {targetMealType === 'cafe' ? 'Café' : targetMealType === 'almoco' ? 'Almoço' : targetMealType} ({computedGrams}g)</span>
            </button>

            {showToast && (
              <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs text-center flex items-center justify-center gap-2">
                <Check className="w-4 h-4" />
                <span>Alimento registrado no seu dia! 💜</span>
              </div>
            )}
          </div>

          {/* Visual Hand References Guide */}
          <div className="rounded-2xl bg-[#18121F] border border-[#33263F] p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Hand className="w-4 h-4 text-[#A78BFA]" />
              <h3 className="text-xs font-bold text-[#F8F5FC]">
                Guia Visual Anatômico da Mão
              </h3>
            </div>
            <div className="space-y-2">
              {VISUAL_HAND_REFERENCES.slice(0, 4).map((ref, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-xl bg-[#100C16] border border-[#33263F] text-xs space-y-0.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#F8F5FC]">{ref.name}</span>
                    <span className="text-[#EC4899] font-mono-numbers">{ref.approxWeightEquivalent}</span>
                  </div>
                  <p className="text-[11px] text-[#B8AFC4]">{ref.bestFor}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
