import React, { useEffect, useState } from 'react';
import {
  Scale,
  X,
  Search,
  Check,
  Flame,
  Utensils,
  Tag,
  Database,
} from 'lucide-react';
import { TACO_TBCA_DATABASE, DatabaseFood, calculateNutritionalValues } from '../data/nutritionDatabase';
import { FoodItem, MealType, MealSlot } from '../types';
import { INITIAL_MEAL_SLOTS } from '../services/storage';

interface RegistrarGramasModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMealType?: MealType;
  mealSlots?: MealSlot[];
  customFoods?: FoodItem[];
  onSaveMealItem: (item: FoodItem, targetType: MealType) => void;
}

export const RegistrarGramasModal: React.FC<RegistrarGramasModalProps> = ({
  isOpen,
  onClose,
  initialMealType = 'almoco',
  mealSlots,
  customFoods = [],
  onSaveMealItem,
}) => {
  const [selectedMeal, setSelectedMeal] = useState<MealType>(initialMealType);
  const [activeTab, setActiveTab] = useState<'tabela' | 'direto'>('tabela');
  const [grams, setGrams] = useState<number | ''>('');
  const [search, setSearch] = useState('');

  const slots = mealSlots && mealSlots.length ? mealSlots : INITIAL_MEAL_SLOTS;

  // Selected item states
  const [selectedFood, setSelectedFood] = useState<DatabaseFood | null>(null);
  const [selectedCustomFood, setSelectedCustomFood] = useState<FoodItem | null>(null);
  const [customFoodName, setCustomFoodName] = useState<string>('');

  // Direct kcal mode
  const [directCalories, setDirectCalories] = useState<number | ''>(200);

  useEffect(() => {
    if (isOpen) {
      setGrams('');
      setSelectedFood(null);
      setSelectedCustomFood(null);
      setCustomFoodName('');
      setSearch('');
      setSelectedMeal(initialMealType);
    }
  }, [isOpen, initialMealType]);

  if (!isOpen) return null;

  // Filter custom foods saved by user in the database
  const filteredCustomFoods = customFoods.filter((f) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      f.name.toLowerCase().includes(q) ||
      (f.brand && f.brand.toLowerCase().includes(q)) ||
      (f.barcode && f.barcode.includes(q))
    );
  }).slice(0, 6);

  // Filter official TACO/TBCA foods
  const filteredOfficialFoods = TACO_TBCA_DATABASE.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 8);

  // Proportional calculation for the selected food and entered grams
  const parsedGrams = typeof grams === 'number' && grams > 0 ? grams : 0;

  // Calculate nutrition for either official food or custom saved food
  let calculatedNutrition = { portionGrams: 0, calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

  if (selectedFood) {
    calculatedNutrition = calculateNutritionalValues(selectedFood, parsedGrams);
  } else if (selectedCustomFood) {
    const serving = selectedCustomFood.portionGrams || 100;
    const p100 = selectedCustomFood.per100g || {
      calories: Math.round(((selectedCustomFood.calories || 0) / serving) * 100),
      protein: Number((((selectedCustomFood.protein || 0) / serving) * 100).toFixed(1)),
      carbs: Number((((selectedCustomFood.carbs || 0) / serving) * 100).toFixed(1)),
      fat: Number((((selectedCustomFood.fat || 0) / serving) * 100).toFixed(1)),
      fiber: Number((((selectedCustomFood.fiber || 0) / serving) * 100).toFixed(1)),
    };
    const ratio = parsedGrams / 100;
    calculatedNutrition = {
      portionGrams: parsedGrams,
      calories: Math.round((p100.calories || 0) * ratio),
      protein: Number(((p100.protein || 0) * ratio).toFixed(1)),
      carbs: Number(((p100.carbs || 0) * ratio).toFixed(1)),
      fat: Number(((p100.fat || 0) * ratio).toFixed(1)),
      fiber: Number(((p100.fiber || 0) * ratio).toFixed(1)),
    };
  }

  const currentFoodDisplayName =
    customFoodName.trim() ||
    (activeTab === 'tabela'
      ? selectedCustomFood?.name || selectedFood?.name || ''
      : 'Alimento');

  const hasSelection = selectedFood !== null || selectedCustomFood !== null;
  const canConfirm = parsedGrams > 0 && (activeTab === 'direto' || hasSelection);

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
      brand: selectedCustomFood?.brand || undefined,
      barcode: selectedCustomFood?.barcode || undefined,
      prepState: selectedFood?.prepState || selectedCustomFood?.prepState || 'cru',
      portionGrams: validGrams,
      calories: finalCalories,
      protein: finalProtein,
      carbs: finalCarbs,
      fat: finalFat,
      fiber: finalFiber,
      per100g: selectedCustomFood?.per100g || (selectedFood ? {
        calories: selectedFood.caloriesPer100g,
        protein: selectedFood.proteinPer100g,
        carbs: selectedFood.carbsPer100g,
        fat: selectedFood.fatPer100g,
        fiber: selectedFood.fiberPer100g,
      } : undefined),
      source: selectedCustomFood ? selectedCustomFood.source : activeTab === 'tabela' ? 'TACO' : 'Manual',
      verified: true,
    };

    onSaveMealItem(foodItem, selectedMeal);
    setCustomFoodName('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4">
      <div
        className="relative w-full max-w-lg bg-[#18121F] border-t sm:border border-[#33263F] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col h-[90dvh] sm:h-auto sm:max-h-[88vh] overflow-hidden"
        style={{ maxHeight: 'calc(100dvh - 1.5rem)' }}
      >
        {/* Header Fixo */}
        <div className="shrink-0 p-3.5 sm:p-4 border-b border-[#33263F] flex items-center justify-between bg-[#18121F]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-2xl bg-gradient-to-tr from-[#6D28D9] via-[#8B5CF6] to-[#EC4899] text-white shadow-md shadow-[#8B5CF6]/30 shrink-0">
              <Scale className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-lg font-bold text-[#F8F5FC] truncate">
                Adicionar em Gramas
              </h2>
              <p className="text-[11px] sm:text-xs text-[#B8AFC4] truncate">
                Selecione da base ou dos seus produtos salvos e ajuste a quantidade
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

        {/* Modal Body Rolável com padding para barra de navegação Android */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-3.5 sm:space-y-4 pb-20 sm:pb-6">

        {/* Meal Selector */}
        <div className="space-y-1">
          <label className="text-[11px] sm:text-xs font-medium text-[#B8AFC4] block">
            Escolha a refeição:
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
                <span className="text-xs truncate">{m.label}</span>
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
            Alimentos & Produtos Salvos
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
            Gramas & Calorias Direto
          </button>
        </div>

        {/* Input de Gramas - aparece após selecionar um alimento ou no modo direto */}
        {(activeTab === 'direto' || hasSelection) && (
          <div className="p-3 sm:p-4 rounded-2xl bg-[#100C16] border border-[#33263F] space-y-1.5 animate-fadeIn">
            <label className="text-xs font-semibold text-[#F8F5FC] flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#A78BFA]" />
                <span>Quantidade que vai consumir (em Gramas):</span>
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

        {/* Tab 1: Alimentos Oficiais e Alimentos Salvos no Banco */}
        {activeTab === 'tabela' && (
          <div className="space-y-2.5 sm:space-y-3">
            <div className="space-y-1">
              <label className="text-[11px] sm:text-xs font-medium text-[#B8AFC4] block">
                Pesquisar alimento salvo ou tabela TACO:
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Pesquisar (ex: frango, arroz, aveia, iogurte...)"
                  className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#100C16] border border-[#33263F] text-xs text-[#F8F5FC] focus:outline-none focus:border-[#8B5CF6]"
                />
                <Search className="w-3.5 h-3.5 text-[#B8AFC4] absolute left-2.5 top-2.5" />
              </div>
            </div>

            {/* SEÇÃO 1: Alimentos Salvos no Banco da Mari (prioritários) */}
            {filteredCustomFoods.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                  <Database className="w-3 h-3" />
                  <span>Seus Produtos Salvos no Banco</span>
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-32 overflow-y-auto pr-0.5">
                  {filteredCustomFoods.map((f) => {
                    const isSelected = selectedCustomFood?.id === f.id;
                    const serving = f.portionGrams || 100;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => {
                          setSelectedCustomFood(f);
                          setSelectedFood(null);
                          setCustomFoodName(f.name);
                          if (!grams) setGrams(serving);
                        }}
                        className={`p-2 rounded-xl text-left border flex items-center justify-between transition-all cursor-pointer min-w-0 ${
                          isSelected
                            ? 'bg-[#1C2826] border-emerald-500 text-white shadow-sm'
                            : 'bg-[#100C16] border-[#33263F] text-[#B8AFC4] hover:border-emerald-500/40 hover:text-[#F8F5FC]'
                        }`}
                      >
                        <div className="min-w-0 mr-1.5">
                          <span className="text-xs font-semibold block truncate">
                            {f.name}
                          </span>
                          <span className="text-[10px] text-[#B8AFC4] truncate block">
                            {f.brand ? `${f.brand} · ` : ''}Alimento Salvo
                          </span>
                        </div>
                        <span className="text-[10px] font-mono-numbers shrink-0 text-emerald-400 font-bold">
                          {f.calories} kcal
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SEÇÃO 2: Tabela TACO / TBCA oficial */}
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-[#A78BFA] uppercase tracking-wider block">
                Tabela Oficial (TACO/TBCA)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-32 overflow-y-auto pr-0.5">
                {filteredOfficialFoods.map((f) => {
                  const isSelected = selectedFood?.id === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setSelectedFood(f);
                        setSelectedCustomFood(null);
                        setCustomFoodName(f.name);
                        if (!grams) setGrams(100);
                      }}
                      className={`p-2 rounded-xl text-left border flex items-center justify-between transition-all cursor-pointer min-w-0 ${
                        isSelected
                          ? 'bg-[#22192C] border-[#8B5CF6] text-[#F8F5FC]'
                          : 'bg-[#100C16] border-[#33263F] text-[#B8AFC4] hover:border-[#8B5CF6]/30 hover:text-[#F8F5FC]'
                      }`}
                    >
                      <span className="text-xs truncate mr-1">{f.name}</span>
                      <span className="text-[10px] font-mono-numbers shrink-0 text-[#A78BFA]">
                        {f.caloriesPer100g} kcal
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Nome editável do item selecionado */}
            {hasSelection && (
              <div className="p-2.5 rounded-2xl bg-[#100C16] border border-[#33263F] space-y-1">
                <label className="text-[10px] font-semibold text-[#B8AFC4] flex items-center gap-1.5">
                  <Tag className="w-3 h-3 text-[#A78BFA]" />
                  <span>Nome para exibir no registro da refeição:</span>
                </label>
                <input
                  type="text"
                  value={customFoodName}
                  onChange={(e) => setCustomFoodName(e.target.value)}
                  placeholder="Ex: Iogurte Danone, Frango grelhado..."
                  className="w-full py-1.5 px-2.5 rounded-xl bg-[#18121F] border border-[#33263F] text-xs font-semibold text-[#F8F5FC] focus:outline-none focus:border-[#8B5CF6]"
                />
              </div>
            )}

            {/* Preview dinâmico de calorias recalculadas */}
            {hasSelection ? (
              <div className="p-3 sm:p-3.5 rounded-2xl bg-gradient-to-r from-[#18121F] to-[#100C16] border border-[#8B5CF6]/40 flex items-center justify-between gap-2 min-w-0">
                <div className="min-w-0">
                  <span className="text-[10px] text-[#A78BFA] uppercase font-semibold block">
                    Cálculo Recalculado
                  </span>
                  <div className="text-xs text-[#B8AFC4] mt-0.5 truncate">
                    <strong className="text-[#F8F5FC]">{currentFoodDisplayName}</strong> ·{' '}
                    <span className="font-mono-numbers font-bold text-white">{parsedGrams}g</span>
                  </div>
                  <div className="flex gap-2 text-[10px] text-[#B8AFC4] mt-1 font-mono-numbers">
                    <span>P: {calculatedNutrition.protein}g</span>
                    <span>C: {calculatedNutrition.carbs}g</span>
                    <span>G: {calculatedNutrition.fat}g</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xl sm:text-2xl font-bold text-[#EC4899] font-mono-numbers">
                    {calculatedNutrition.calories} kcal
                  </div>
                  <div className="text-[9px] text-[#B8AFC4]">
                    {selectedCustomFood ? 'Do seu banco de dados' : 'Tabela TACO oficial'}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-[#B8AFC4] text-center italic py-1">
                Toque em um alimento acima para informar os gramas.
              </p>
            )}
          </div>
        )}

        {/* Tab 2: Modo Direto */}
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

        {/* Botão de Confirmação */}
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
              ? activeTab === 'tabela' && !hasSelection
                ? 'Escolha um alimento para continuar'
                : 'Digite a quantidade em gramas'
              : `Adicionar ${currentFoodDisplayName} (${parsedGrams}g · ${activeTab === 'tabela' ? calculatedNutrition.calories : (directCalories || 0)} kcal)`}
          </span>
        </button>
        </div>
      </div>
    </div>
  );
};
