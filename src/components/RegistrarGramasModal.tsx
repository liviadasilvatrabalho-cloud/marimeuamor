import React, { useEffect, useState } from 'react';
import {
  Scale,
  X,
  Search,
  Check,
  Flame,
  Utensils,
  Tag,
} from 'lucide-react';
import { TACO_TBCA_DATABASE, DatabaseFood, calculateNutritionalValues } from '../data/nutritionDatabase';
import { FoodItem, MealType, MealSlot } from '../types';
import { INITIAL_MEAL_SLOTS } from '../services/storage';

interface RegistrarGramasModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMealType?: MealType;
  mealSlots?: MealSlot[];
  onSaveMealItem: (item: FoodItem, targetType: MealType) => void;
}

const MEAL_OPTIONS: { id: MealType; label: string; icon: string }[] = [
  { id: 'cafe', label: 'Café', icon: '☕' },
  { id: 'almoco', label: 'Almoço', icon: '🥗' },
  { id: 'lanche', label: 'Lanche', icon: '🍎' },
  { id: 'jantar', label: 'Jantar', icon: '🍲' },
  { id: 'ceia', label: 'Ceia', icon: '🌙' },
];

export const RegistrarGramasModal: React.FC<RegistrarGramasModalProps> = ({
  isOpen,
  onClose,
  initialMealType = 'almoco',
  mealSlots,
  onSaveMealItem,
}) => {
  const [selectedMeal, setSelectedMeal] = useState<MealType>(initialMealType);
  const [activeTab, setActiveTab] = useState<'tabela' | 'direto'>('tabela');
  const [grams, setGrams] = useState<number | ''>('');
  const [search, setSearch] = useState('');

  const slots = mealSlots && mealSlots.length ? mealSlots : INITIAL_MEAL_SLOTS;
  const [selectedFood, setSelectedFood] = useState<DatabaseFood | null>(null);
  const [customFoodName, setCustomFoodName] = useState<string>('');

  // Direct kcal mode
  const [directCalories, setDirectCalories] = useState<number | ''>(200);

  // Every time the modal opens, start with the grams field zeroed and no food selected
  useEffect(() => {
    if (isOpen) {
      setGrams('');
      setSelectedFood(null);
      setCustomFoodName('');
      setSearch('');
      setSelectedMeal(initialMealType);
    }
  }, [isOpen, initialMealType]);

  if (!isOpen) return null;

  // Filtered foods for calculation
  const filteredFoods = TACO_TBCA_DATABASE.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 8);

  // Proportional calculation for the selected food and entered grams
  const parsedGrams = typeof grams === 'number' && grams > 0 ? grams : 0;
  const calculatedNutrition = selectedFood
    ? calculateNutritionalValues(selectedFood, parsedGrams)
    : { portionGrams: 0, calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

  const currentFoodDisplayName =
    customFoodName.trim() || (activeTab === 'tabela' ? selectedFood?.name || '' : 'Alimento');

  const canConfirm = parsedGrams > 0 && (activeTab === 'direto' || selectedFood !== null);

  const handleConfirmSave = () => {
    if (!canConfirm) return;

    const validGrams = Math.max(1, typeof grams === 'number' ? grams : 100);

    let finalCalories = calculatedNutrition.calories;
    let finalProtein = calculatedNutrition.protein;
    let finalCarbs = calculatedNutrition.carbs;
    let finalFat = calculatedNutrition.fat;
    let finalFiber = calculatedNutrition.fiber;

    if (activeTab === 'direto') {
      finalCalories = Math.max(0, typeof directCalories === 'number' ? directCalories : 0);
      finalProtein = 0;
      finalCarbs = 0;
      finalFat = 0;
      finalFiber = 0;
    }

    const foodItem: FoodItem = {
      id: `gramas-${Date.now()}`,
      name: currentFoodDisplayName,
      prepState: selectedFood?.prepState || 'cozido',
      portionGrams: validGrams,
      calories: finalCalories,
      protein: finalProtein,
      carbs: finalCarbs,
      fat: finalFat,
      fiber: finalFiber,
      source: activeTab === 'tabela' ? 'TACO' : 'Manual',
      verified: true,
    };

    onSaveMealItem(foodItem, selectedMeal);
    setCustomFoodName('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="relative w-full max-w-lg bg-[#18121F] border-t sm:border border-[#33263F] rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 pb-safe shadow-2xl max-h-[92vh] overflow-y-auto overflow-x-hidden space-y-3.5 sm:space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#33263F]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-2xl bg-gradient-to-tr from-[#6D28D9] via-[#8B5CF6] to-[#EC4899] text-white shadow-md shadow-[#8B5CF6]/30 shrink-0">
              <Scale className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-lg font-bold text-[#F8F5FC] truncate">
                Adicionar Alimento
              </h2>
              <p className="text-[11px] sm:text-xs text-[#B8AFC4] truncate">
                Cada alimento ficará separado na refeição com seu próprio peso e calorias.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-xl text-[#B8AFC4] hover:text-[#F8F5FC] hover:bg-[#22192C] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Meal Selector */}
        <div className="space-y-1">
          <label className="text-[11px] sm:text-xs font-medium text-[#B8AFC4] block">
            Escolha o horário da refeição:
          </label>
          <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-5 gap-1.5">
            {slots.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMeal(m.id)}
                className={`py-2 px-2 rounded-xl text-center flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  selectedMeal === m.id
                    ? 'bg-gradient-to-r from-[#8B5CF6] to-[#6D28D9] text-white font-semibold shadow-md shadow-[#8B5CF6]/30'
                    : 'bg-[#100C16] text-[#B8AFC4] border border-[#33263F] hover:border-[#8B5CF6]/40 hover:text-[#F8F5FC]'
                }`}
              >
                <span className="text-xs sm:text-sm shrink-0">{m.icon}</span>
                <span className="text-xs truncate">
                  {m.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="grid grid-cols-2 gap-1.5 sm:gap-2 p-1 rounded-2xl bg-[#100C16] border border-[#33263F]">
          <button
            type="button"
            onClick={() => setActiveTab('tabela')}
            className={`py-1.5 sm:py-2 px-2 rounded-xl text-xs font-semibold transition-all cursor-pointer text-center truncate ${
              activeTab === 'tabela'
                ? 'bg-[#18121F] text-[#A78BFA] border border-[#8B5CF6]/40 shadow-sm'
                : 'text-[#B8AFC4] hover:text-[#F8F5FC]'
            }`}
          >
            Calcular por Alimento
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('direto')}
            className={`py-1.5 sm:py-2 px-2 rounded-xl text-xs font-semibold transition-all cursor-pointer text-center truncate ${
              activeTab === 'direto'
                ? 'bg-[#18121F] text-[#EC4899] border border-[#EC4899]/40 shadow-sm'
                : 'text-[#B8AFC4] hover:text-[#F8F5FC]'
            }`}
          >
            Gramas & Calorias
          </button>
        </div>

        {/* Pure Grams Input - only appears after selecting a food */}
        {(activeTab === 'direto' || selectedFood !== null) && (
          <div className="p-3 sm:p-4 rounded-2xl bg-[#100C16] border border-[#33263F] space-y-1.5">
            <label className="text-xs font-semibold text-[#F8F5FC] flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#A78BFA]" />
                <span>Quantidade em Gramas:</span>
              </span>
              <span className="text-xs font-mono-numbers text-[#A78BFA]">
                {parsedGrams}g
              </span>
            </label>

            <div className="relative">
              <input
                type="number"
                min="1"
                max="5000"
                value={grams}
                onChange={(e) => {
                  const val = e.target.value;
                  setGrams(val === '' ? '' : parseInt(val) || 0);
                }}
                placeholder="Ex: 150"
                className="w-full py-2.5 sm:py-3 px-4 rounded-xl bg-[#18121F] border border-[#8B5CF6]/50 text-xl font-bold font-mono-numbers text-center text-[#F8F5FC] focus:outline-none focus:border-[#EC4899] transition-all"
              />
              <span className="absolute right-3.5 top-2.5 sm:top-3 text-xs text-[#B8AFC4] font-semibold">
                gramas
              </span>
            </div>
          </div>
        )}

        {/* Tab 1: Food Selection for Real Calorie Calculation */}
        {activeTab === 'tabela' && (
          <div className="space-y-2.5 sm:space-y-3">
            <div className="space-y-1">
              <label className="text-[11px] sm:text-xs font-medium text-[#B8AFC4] block">
                Pesquisar alimento:
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Pesquisar (ex: arroz, frango, feijão...)"
                  className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#100C16] border border-[#33263F] text-xs text-[#F8F5FC] focus:outline-none focus:border-[#8B5CF6]"
                />
                <Search className="w-3.5 h-3.5 text-[#B8AFC4] absolute left-2.5 top-2.5" />
              </div>
            </div>

            {/* Quick List of Foods */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto overflow-x-hidden pr-0.5">
              {filteredFoods.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setSelectedFood(f);
                    setCustomFoodName(f.name);
                  }}
                  className={`p-2 rounded-xl text-left border flex items-center justify-between transition-all cursor-pointer min-w-0 ${
                    selectedFood?.id === f.id
                      ? 'bg-[#22192C] border-[#8B5CF6] text-[#F8F5FC]'
                      : 'bg-[#100C16] border-[#33263F] text-[#B8AFC4] hover:border-[#8B5CF6]/30 hover:text-[#F8F5FC]'
                  }`}
                >
                  <span className="text-xs truncate mr-1">{f.name}</span>
                  <span className="text-[10px] font-mono-numbers shrink-0 text-[#A78BFA]">
                    {f.caloriesPer100g} kcal
                  </span>
                </button>
              ))}
            </div>

            {/* Editable Name Field for Selected Food */}
            {selectedFood && (
              <div className="p-2.5 sm:p-3 rounded-2xl bg-[#100C16] border border-[#33263F] space-y-1">
                <label className="text-[10px] sm:text-[11px] font-semibold text-[#B8AFC4] flex items-center gap-1.5">
                  <Tag className="w-3 h-3 text-[#A78BFA]" />
                  <span>Nome que aparecerá no seu dia:</span>
                </label>
                <input
                  type="text"
                  value={customFoodName || selectedFood.name}
                  onChange={(e) => setCustomFoodName(e.target.value)}
                  placeholder="Ex: Arroz Branco cozido"
                  className="w-full py-1.5 px-2.5 rounded-xl bg-[#18121F] border border-[#33263F] text-xs font-semibold text-[#F8F5FC] focus:outline-none focus:border-[#8B5CF6]"
                />
              </div>
            )}

            {/* Result Preview Box */}
            {selectedFood ? (
              <div className="p-3 sm:p-3.5 rounded-2xl bg-gradient-to-r from-[#18121F] to-[#100C16] border border-[#8B5CF6]/40 flex items-center justify-between gap-2 min-w-0">
                <div className="min-w-0">
                  <span className="text-[10px] text-[#A78BFA] uppercase font-semibold block">
                    Cálculo Individual
                  </span>
                  <div className="text-xs text-[#B8AFC4] mt-0.5 truncate">
                    <strong className="text-[#F8F5FC]">{currentFoodDisplayName}</strong> ·{' '}
                    <span className="font-mono-numbers">{parsedGrams}g</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xl sm:text-2xl font-bold text-[#EC4899] font-mono-numbers">
                    {calculatedNutrition.calories} kcal
                  </div>
                  <div className="text-[9px] text-[#B8AFC4]">
                    Tabela TACO oficial
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-[#B8AFC4] text-center italic py-1">
                Toque em um alimento acima para digitar a quantidade em gramas.
              </p>
            )}
          </div>
        )}

        {/* Tab 2: Direct Calories & Grams */}
        {activeTab === 'direto' && (
          <div className="space-y-2.5 sm:space-y-3">
            <div className="p-3 sm:p-4 rounded-2xl bg-[#100C16] border border-[#33263F] space-y-1.5">
              <label className="text-xs font-semibold text-[#F8F5FC] flex items-center gap-1.5">
                <Utensils className="w-3.5 h-3.5 text-[#A78BFA]" />
                <span>Nome do Alimento:</span>
              </label>
              <input
                type="text"
                value={customFoodName}
                onChange={(e) => setCustomFoodName(e.target.value)}
                placeholder="Ex: Arroz, Omelete, Iogurte, Frango..."
                className="w-full py-2 px-3 rounded-xl bg-[#18121F] border border-[#33263F] text-xs font-semibold text-[#F8F5FC] focus:outline-none focus:border-[#8B5CF6]"
              />
            </div>

            <div className="p-3 sm:p-4 rounded-2xl bg-[#100C16] border border-[#33263F] space-y-1.5">
              <label className="text-xs font-semibold text-[#F8F5FC] flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-[#EC4899]" />
                <span>Calorias Totais (kcal):</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="5000"
                  value={directCalories}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDirectCalories(val === '' ? '' : parseInt(val) || 0);
                  }}
                  placeholder="Ex: 300"
                  className="w-full py-2.5 px-4 rounded-xl bg-[#18121F] border border-[#EC4899]/50 text-xl font-bold font-mono-numbers text-center text-[#EC4899] focus:outline-none focus:border-[#8B5CF6]"
                />
                <span className="absolute right-3.5 top-2.5 text-xs text-[#B8AFC4] font-semibold">
                  kcal
                </span>
              </div>
            </div>

            <p className="text-[11px] text-[#B8AFC4] text-center truncate">
              Item: <strong>{currentFoodDisplayName}</strong> · <strong>{parsedGrams}g</strong> ·{' '}
              <strong className="text-[#EC4899]">{directCalories || 0} kcal</strong>
            </p>
          </div>
        )}

        {/* Encouraging Note */}
        <p className="text-[10px] sm:text-[11px] text-[#A78BFA] text-center italic">
          💜 Cada alimento ficará separado na refeição com seu próprio peso e calorias.
        </p>

        {/* Confirm Button */}
        <button
          type="button"
          onClick={handleConfirmSave}
          disabled={!canConfirm}
          className={`w-full py-3 sm:py-3.5 px-3 rounded-2xl text-white text-xs font-bold shadow-lg transition-all flex items-center justify-center gap-2 ${
            canConfirm
              ? 'bg-gradient-to-r from-[#6D28D9] via-[#8B5CF6] to-[#EC4899] hover:from-[#7C3AED] hover:to-[#F472B6] shadow-[#8B5CF6]/30 active:scale-[0.98] cursor-pointer'
              : 'bg-[#22192C] text-[#B8AFC4] shadow-none cursor-not-allowed opacity-70'
          }`}
        >
          <Check className="w-4 h-4 shrink-0" />
          <span className="truncate">
            {!canConfirm
              ? activeTab === 'tabela' && !selectedFood
                ? 'Escolha um alimento para continuar'
                : 'Digite a quantidade em gramas'
              : `Adicionar ${currentFoodDisplayName} (${parsedGrams}g · ${activeTab === 'tabela' ? calculatedNutrition.calories : (directCalories || 0)} kcal)`}
          </span>
        </button>
      </div>
    </div>
  );
};
