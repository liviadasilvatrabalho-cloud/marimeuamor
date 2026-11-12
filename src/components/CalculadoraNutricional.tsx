import React, { useState } from 'react';
import {
  Calculator,
  Search,
  Filter,
  Plus,
  Check,
  Flame,
  Dna,
  Wheat,
  Droplet,
} from 'lucide-react';
import { TACO_TBCA_DATABASE, DatabaseFood, calculateNutritionalValues } from '../data/nutritionDatabase';
import { FoodItem, MealType, MealSlot } from '../types';
import { INITIAL_MEAL_SLOTS } from '../services/storage';

interface CalculadoraNutricionalProps {
  onAddMealItem: (item: FoodItem, mealType: MealType) => void;
  initialMealType?: MealType;
  mealSlots?: MealSlot[];
}

export const CalculadoraNutricional: React.FC<CalculadoraNutricionalProps> = ({
  onAddMealItem,
  initialMealType = 'almoco',
  mealSlots,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [selectedFood, setSelectedFood] = useState<DatabaseFood>(TACO_TBCA_DATABASE[0]);
  const [customGrams, setCustomGrams] = useState<number>(100);
  const [mealType, setMealType] = useState<MealType>(initialMealType);
  const [loggedToast, setLoggedToast] = useState(false);

  const slots = mealSlots && mealSlots.length ? mealSlots : INITIAL_MEAL_SLOTS;

  const categories = ['Todas', 'Graos', 'Carnes', 'Ovos', 'Legumes', 'Frutas', 'Laticinios', 'Gorduras', 'Paes', 'Suplementos', 'Bebidas', 'Doces'];

  const filteredFoods = TACO_TBCA_DATABASE.filter((f) => {
    const matchCategory = selectedCategory === 'Todas' || f.category === selectedCategory;
    const matchSearch = f.name.toLowerCase().includes(search.toLowerCase());
    return matchCategory && matchSearch;
  });

  const calculated = calculateNutritionalValues(selectedFood, customGrams);

  const handleAddMeal = () => {
    const item: FoodItem = {
      id: `calc-${Date.now()}`,
      name: selectedFood.name,
      prepState: selectedFood.prepState,
      portionGrams: customGrams,
      calories: calculated.calories,
      protein: calculated.protein,
      carbs: calculated.carbs,
      fat: calculated.fat,
      fiber: calculated.fiber,
      source: selectedFood.source,
      verified: true,
    };

    onAddMealItem(item, mealType);
    setLoggedToast(true);
    setTimeout(() => setLoggedToast(false), 2500);
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-12">
      {/* Header */}
      <div className="rounded-3xl bg-gradient-to-br from-[#18121F] via-[#100C16] to-[#09070D] border border-[#33263F] p-4 sm:p-6 lg:p-8">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#A78BFA] uppercase tracking-wider mb-1">
          <Calculator className="w-4 h-4" />
          <span>Calculadora Nutricional Matemática</span>
        </div>
        <h1 className="font-heading text-lg sm:text-2xl lg:text-3xl font-bold text-[#F8F5FC]">
          Tabela TACO & TBCA Oficial
        </h1>
        <p className="text-xs sm:text-sm text-[#B8AFC4] mt-1 max-w-2xl leading-relaxed">
          Cálculos proporcionais rigorosos para cada grama consumida. Selecione o alimento, o estado de preparo e o peso para obter macronutrientes exatos.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Filter & Search List */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl bg-[#18121F] border border-[#33263F] p-5 space-y-4">
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar por nome de alimento ou ingrediente..."
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#100C16] border border-[#33263F] text-xs text-[#F8F5FC] focus:outline-none focus:border-[#8B5CF6]"
              />
              <Search className="w-4 h-4 text-[#B8AFC4] absolute left-3 top-3" />
            </div>

            {/* Category Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    selectedCategory === cat
                      ? 'bg-[#8B5CF6] text-white shadow-sm'
                      : 'bg-[#100C16] text-[#B8AFC4] border border-[#33263F] hover:text-[#F8F5FC]'
                  }`}
                >
                  {cat === 'Todas'
                    ? 'Todos'
                    : cat === 'Graos'
                    ? 'Grãos & Feijões'
                    : cat === 'Carnes'
                    ? 'Carnes & Peixes'
                    : cat === 'Laticinios'
                    ? 'Laticínios'
                    : cat === 'Gorduras'
                    ? 'Gorduras & Oleaginosas'
                    : cat === 'Paes'
                    ? 'Pães & Cereais'
                    : cat === 'Doces'
                    ? 'Doces & Snacks'
                    : cat}
                </button>
              ))}
            </div>

            {/* Food List */}
            <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
              {filteredFoods.map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    setSelectedFood(f);
                    setCustomGrams(f.defaultServingGrams);
                  }}
                  className={`w-full p-3 rounded-xl text-left border flex items-center justify-between transition-all ${
                    selectedFood.id === f.id
                      ? 'bg-[#22192C] border-[#8B5CF6] shadow-md shadow-[#8B5CF6]/15'
                      : 'bg-[#100C16] border-[#33263F] hover:border-[#8B5CF6]/40'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#F8F5FC]">{f.name}</span>
                      <span className="text-[10px] text-[#A78BFA] capitalize">
                        ({f.prepState})
                      </span>
                    </div>
                    <span className="text-[11px] text-[#B8AFC4]">
                      Base 100g: {f.caloriesPer100g} kcal · P: {f.proteinPer100g}g · C: {f.carbsPer100g}g · G: {f.fatPer100g}g
                    </span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#18121F] text-[#B8AFC4] border border-[#33263F]">
                    {f.source}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Proportional Calculator & Logging */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl bg-gradient-to-br from-[#18121F] to-[#100C16] border border-[#8B5CF6]/50 p-6 space-y-5 shadow-xl">
            <div className="flex items-start justify-between border-b border-[#33263F] pb-3">
              <div>
                <span className="text-[10px] text-[#A78BFA] uppercase tracking-wider font-semibold">
                  Alimento Selecionado
                </span>
                <h3 className="text-base font-bold text-[#F8F5FC] mt-0.5">
                  {selectedFood.name}
                </h3>
                <p className="text-xs text-[#B8AFC4]">
                  Estado de preparo: <strong className="text-[#EC4899]">{selectedFood.prepState}</strong>
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-[#8B5CF6]/20 text-[#A78BFA] text-[10px] font-bold">
                {selectedFood.source}
              </span>
            </div>

            {/* Grams Adjustment */}
            <div className="p-4 rounded-xl bg-[#100C16] border border-[#33263F] space-y-3">
              <label className="text-xs font-medium text-[#B8AFC4] block">
                Informe a quantidade em gramas:
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="1"
                  max="2000"
                  value={customGrams}
                  onChange={(e) => setCustomGrams(Math.max(1, parseFloat(e.target.value) || 0))}
                  className="flex-1 px-4 py-2.5 text-center font-mono-numbers text-xl font-bold text-[#F8F5FC] bg-[#18121F] border border-[#8B5CF6]/50 rounded-xl focus:outline-none focus:border-[#8B5CF6]"
                />
                <span className="text-sm font-semibold text-[#B8AFC4]">gramas</span>
              </div>
            </div>

            {/* Calculated Macros Result */}
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-[#100C16] border border-[#33263F] flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-[#B8AFC4]">
                  <Flame className="w-4 h-4 text-[#EC4899]" />
                  <span>Valor Energético Total</span>
                </div>
                <div className="text-2xl font-bold text-[#EC4899] font-mono-numbers">
                  {calculated.calories} <span className="text-xs font-normal text-[#B8AFC4]">kcal</span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1.5 sm:gap-2 font-mono-numbers text-center">
                <div className="p-2 sm:p-2.5 rounded-xl bg-[#100C16] border border-[#33263F]">
                  <span className="text-[9px] sm:text-[10px] text-[#B8AFC4] block truncate">Proteína</span>
                  <span className="text-xs sm:text-sm font-bold text-[#8B5CF6]">
                    {calculated.protein}g
                  </span>
                </div>
                <div className="p-2 sm:p-2.5 rounded-xl bg-[#100C16] border border-[#33263F]">
                  <span className="text-[9px] sm:text-[10px] text-[#B8AFC4] block truncate">Carboidrato</span>
                  <span className="text-xs sm:text-sm font-bold text-[#EC4899]">
                    {calculated.carbs}g
                  </span>
                </div>
                <div className="p-2 sm:p-2.5 rounded-xl bg-[#100C16] border border-[#33263F]">
                  <span className="text-[9px] sm:text-[10px] text-[#B8AFC4] block truncate">Gorduras</span>
                  <span className="text-xs sm:text-sm font-bold text-[#F472B6]">
                    {calculated.fat}g
                  </span>
                </div>
                <div className="p-2 sm:p-2.5 rounded-xl bg-[#100C16] border border-[#33263F]">
                  <span className="text-[9px] sm:text-[10px] text-[#B8AFC4] block truncate">Fibras</span>
                  <span className="text-xs sm:text-sm font-bold text-[#38BDF8]">
                    {calculated.fiber}g
                  </span>
                </div>
              </div>
            </div>

            {/* Meal Slot Destination */}
            <div className="space-y-1.5 pt-2">
              <label className="text-xs text-[#B8AFC4] block">
                Salvar em qual refeição de hoje?
              </label>
              <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-5 gap-1.5">
                {slots.map((slot) => (
                  <button
                    key={slot.id}
                    onClick={() => setMealType(slot.id)}
                    className={`py-2 px-1.5 text-center rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                      mealType === slot.id
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

            {/* Add Action Button */}
            <button
              onClick={handleAddMeal}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#6D28D9] via-[#8B5CF6] to-[#EC4899] hover:opacity-95 text-white text-xs font-bold shadow-lg shadow-[#8B5CF6]/30 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar {customGrams}g ao {mealType === 'cafe' ? 'Café' : mealType === 'almoco' ? 'Almoço' : mealType}</span>
            </button>

            {loggedToast && (
              <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs text-center flex items-center justify-center gap-2">
                <Check className="w-4 h-4" />
                <span>Alimento adicionado à sua refeição! 💜</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
