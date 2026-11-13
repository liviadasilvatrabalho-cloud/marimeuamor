import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  RotateCcw,
  Plus,
  Scale,
  Flame,
  Clock,
  Trash2,
  Edit3,
  Check,
  X,
  CheckCircle2,
  Sparkles,
  Camera,
  FileText,
  Utensils,
  Search,
  AlertCircle,
  Apple,
} from 'lucide-react';
import { AppState, MealLog, FoodItem, MealType, MealSlot } from '../types';
import { INITIAL_MEAL_SLOTS } from '../services/storage';
import { formatPtBr } from './NutritionLabelModal';

interface MeuDiaProps {
  appState: AppState;
  onOpenRegistrarGramas: (mealType?: MealType) => void;
  onOpenPhotoScanner: (mealType?: MealType) => void;
  onOpenBarcodeScanner: (mealType?: MealType) => void;
  onOpenSemBalanca: (mealType?: MealType) => void;
  onOpenCalculadora: (mealType?: MealType) => void;
  onDeleteMeal: (mealId: string) => void;
  onDeleteFoodItem?: (mealId: string, foodId: string) => void;
  onUpdateFoodItemGrams?: (mealId: string, foodId: string, newGrams: number) => void;
  onUpdateMealSlots?: (slots: MealSlot[]) => void;
  onAddMealItem: (item: FoodItem, targetType: MealType, date?: string, isPlanned?: boolean) => void;
  onTogglePlannedMeal?: (mealId: string, updatedFoods?: FoodItem[]) => void;
  onNavigateToMeusAlimentos?: () => void;
}

export const MeuDia: React.FC<MeuDiaProps> = ({
  appState,
  onOpenRegistrarGramas,
  onOpenPhotoScanner,
  onOpenBarcodeScanner,
  onOpenSemBalanca,
  onOpenCalculadora,
  onDeleteMeal,
  onDeleteFoodItem,
  onUpdateFoodItemGrams,
  onAddMealItem,
  onTogglePlannedMeal,
  onNavigateToMeusAlimentos,
}) => {
  const { user, todayLogs = [], historyLogs = [], customFoods = [], mealSlots } = appState;
  const slots = mealSlots && mealSlots.length ? mealSlots : INITIAL_MEAL_SLOTS;

  // Selected date state (default today in YYYY-MM-DD)
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  // Inline Grams Editor State
  const [editingFoodKey, setEditingFoodKey] = useState<string | null>(null);
  const [editingGrams, setEditingGrams] = useState<string>('100');

  // Food Picker Modal State (to pick from Meus Alimentos directly into any slot)
  const [foodPickerSlot, setFoodPickerSlot] = useState<{ mealType: MealType; isPlanned: boolean } | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [selectedFoodToInsert, setSelectedFoodToInsert] = useState<FoodItem | null>(null);
  const [insertGrams, setInsertGrams] = useState<string>('100');

  // Add & Delete Meal Slot State
  const [isAddingMealSlot, setIsAddingMealSlot] = useState(false);
  const [newSlotLabel, setNewSlotLabel] = useState('');
  const [newSlotTime, setNewSlotTime] = useState('');
  const [newSlotIcon, setNewSlotIcon] = useState('🍽️');
  const [slotToDelete, setSlotToDelete] = useState<MealSlot | null>(null);

  // Mark Planned Meal as Consumed Modal State
  const [mealToConsume, setMealToConsume] = useState<MealLog | null>(null);
  const [adjustingFoods, setAdjustingFoods] = useState<FoodItem[]>([]);

  // Date Navigation Helpers
  const changeDateByDays = (days: number) => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const goToToday = () => {
    setSelectedDate(todayStr);
  };

  // Formatted date string in Brazilian Portuguese
  const formattedDateInfo = useMemo(() => {
    const d = new Date(selectedDate + 'T12:00:00');
    const dayOfWeek = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(d);
    const day = d.getDate();
    const month = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(d);
    const year = d.getFullYear();

    const capitalizedDayOfWeek = dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1);
    const dateLabel = `${day} de ${month} de ${year} — ${capitalizedDayOfWeek}`;

    const isToday = selectedDate === todayStr;
    const isFuture = selectedDate > todayStr;
    const isPast = selectedDate < todayStr;

    return { dateLabel, isToday, isFuture, isPast };
  }, [selectedDate, todayStr]);

  // Combine and filter all logs for the selected date
  const allLogs = useMemo(() => {
    return [...todayLogs, ...historyLogs];
  }, [todayLogs, historyLogs]);

  const dateMeals = useMemo(() => {
    return allLogs.filter((m) => m.date === selectedDate);
  }, [allLogs, selectedDate]);

  // Separate Consumed vs Planned meals for the selected date
  const consumedMeals = useMemo(() => {
    return dateMeals.filter((m) => !m.isPlanned);
  }, [dateMeals]);

  const plannedMeals = useMemo(() => {
    return dateMeals.filter((m) => Boolean(m.isPlanned));
  }, [dateMeals]);

  // Daily totals for the selected date
  const consumedCalories = useMemo(() => {
    return consumedMeals.reduce((acc, m) => acc + (m.totalCalories || 0), 0);
  }, [consumedMeals]);

  const plannedCalories = useMemo(() => {
    return plannedMeals.reduce((acc, m) => acc + (m.totalCalories || 0), 0);
  }, [plannedMeals]);

  const remainingCalories = Math.max(0, (user.calorieGoal || 2200) - consumedCalories);

  // Consumed Macros
  const consumedMacros = useMemo(() => {
    let p = 0, c = 0, f = 0, fib = 0;
    for (const m of consumedMeals) {
      p += m.totalProtein || 0;
      c += m.totalCarbs || 0;
      f += m.totalFat || 0;
      fib += m.totalFiber || 0;
    }
    return {
      protein: Number(p.toFixed(1)),
      carbs: Number(c.toFixed(1)),
      fat: Number(f.toFixed(1)),
      fiber: Number(fib.toFixed(1)),
    };
  }, [consumedMeals]);

  // Planned Macros
  const plannedMacros = useMemo(() => {
    let p = 0, c = 0, f = 0, fib = 0;
    for (const m of plannedMeals) {
      p += m.totalProtein || 0;
      c += m.totalCarbs || 0;
      f += m.totalFat || 0;
      fib += m.totalFiber || 0;
    }
    return {
      protein: Number(p.toFixed(1)),
      carbs: Number(c.toFixed(1)),
      fat: Number(f.toFixed(1)),
      fiber: Number(fib.toFixed(1)),
    };
  }, [plannedMeals]);

  // Handle open mark as consumed modal
  const handleOpenMarkAsConsumed = (meal: MealLog) => {
    setMealToConsume(meal);
    setAdjustingFoods(meal.foods.map((f) => ({ ...f })));
  };

  const handleAdjustGramsInPlan = (index: number, newGrams: number) => {
    setAdjustingFoods((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const g = Math.max(1, newGrams);
        const p100 = item.per100g || {
          calories: ((item.calories || 0) / (item.portionGrams || 100)) * 100,
          protein: ((item.protein || 0) / (item.portionGrams || 100)) * 100,
          carbs: ((item.carbs || 0) / (item.portionGrams || 100)) * 100,
          fat: ((item.fat || 0) / (item.portionGrams || 100)) * 100,
          fiber: ((item.fiber || 0) / (item.portionGrams || 100)) * 100,
        };
        const ratio = g / 100;
        return {
          ...item,
          portionGrams: g,
          calories: Number(((p100.calories || 0) * ratio).toFixed(1)),
          protein: Number(((p100.protein || 0) * ratio).toFixed(2)),
          carbs: Number(((p100.carbs || 0) * ratio).toFixed(2)),
          fat: Number(((p100.fat || 0) * ratio).toFixed(2)),
          fiber: Number(((p100.fiber || 0) * ratio).toFixed(2)),
        };
      })
    );
  };

  const handleConfirmMarkAsConsumed = () => {
    if (!mealToConsume) return;
    if (onTogglePlannedMeal) {
      onTogglePlannedMeal(mealToConsume.id, adjustingFoods);
    }
    setMealToConsume(null);
  };

  // Quick insertion from Meus Alimentos
  const filteredPickerFoods = useMemo(() => {
    if (!pickerSearch.trim()) return customFoods;
    const q = pickerSearch.toLowerCase().trim();
    return customFoods.filter(
      (f) => f.name.toLowerCase().includes(q) || (f.brand && f.brand.toLowerCase().includes(q))
    );
  }, [customFoods, pickerSearch]);

  const handleConfirmInsertFromPicker = () => {
    if (!foodPickerSlot || !selectedFoodToInsert) return;

    const parsedGrams = parseFloat(String(insertGrams).replace(',', '.')) || 100;
    const grams = Math.max(1, parsedGrams);
    const p100 = selectedFoodToInsert.per100g || {
      calories: ((selectedFoodToInsert.calories || 0) / (selectedFoodToInsert.portionGrams || 100)) * 100,
      protein: ((selectedFoodToInsert.protein || 0) / (selectedFoodToInsert.portionGrams || 100)) * 100,
      carbs: ((selectedFoodToInsert.carbs || 0) / (selectedFoodToInsert.portionGrams || 100)) * 100,
      fat: ((selectedFoodToInsert.fat || 0) / (selectedFoodToInsert.portionGrams || 100)) * 100,
      fiber: ((selectedFoodToInsert.fiber || 0) / (selectedFoodToInsert.portionGrams || 100)) * 100,
    };
    const ratio = grams / 100;

    const itemToAdd: FoodItem = {
      ...selectedFoodToInsert,
      id: `meal-item-${Date.now()}`,
      portionGrams: grams,
      calories: Number(((p100.calories || 0) * ratio).toFixed(1)),
      protein: Number(((p100.protein || 0) * ratio).toFixed(2)),
      carbs: Number(((p100.carbs || 0) * ratio).toFixed(2)),
      fat: Number(((p100.fat || 0) * ratio).toFixed(2)),
      fiber: Number(((p100.fiber || 0) * ratio).toFixed(2)),
    };

    onAddMealItem(itemToAdd, foodPickerSlot.mealType, selectedDate, foodPickerSlot.isPlanned);
    setFoodPickerSlot(null);
    setSelectedFoodToInsert(null);
    setPickerSearch('');
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4 sm:space-y-6 pb-28 lg:pb-12 animate-fadeIn">
      {/* ============================================================ */}
      {/* BARRA DE NAVEGAÇÃO POR CALENDÁRIO ENTRE DIAS                */}
      {/* ============================================================ */}
      <div className="rounded-3xl bg-[#140E1B] border border-[#322046] p-3 sm:p-4 shadow-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Botões Voltar / Avançar Dia */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => changeDateByDays(-1)}
              className="p-2 rounded-xl bg-[#1A1224] border border-[#322046] text-[#B5A8C8] hover:text-[#FAF8FC] hover:border-[#8B5CF6] transition-colors cursor-pointer"
              title="Dia anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => changeDateByDays(1)}
              className="p-2 rounded-xl bg-[#1A1224] border border-[#322046] text-[#B5A8C8] hover:text-[#FAF8FC] hover:border-[#8B5CF6] transition-colors cursor-pointer"
              title="Próximo dia"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {!formattedDateInfo.isToday && (
              <button
                type="button"
                onClick={goToToday}
                className="px-3 py-1.5 rounded-xl bg-[#1F142B] border border-[#8B5CF6]/50 text-[#A78BFA] text-xs font-bold hover:bg-[#8B5CF6]/20 transition-all cursor-pointer flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Hoje</span>
              </button>
            )}
          </div>

          {/* Seletor de Data Nativo Discreto */}
          <div className="flex items-center gap-2">
            <label className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1A1224] border border-[#322046] hover:border-[#8B5CF6] text-xs font-semibold text-[#FAF8FC] cursor-pointer transition-colors">
              <CalendarIcon className="w-3.5 h-3.5 text-[#EC4899]" />
              <span>Selecionar Data</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </label>
          </div>
        </div>

        {/* Título da Data Selecionada e Status */}
        <div className="pt-2 border-t border-[#2D1B3E] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm sm:text-base font-bold text-[#FAF8FC]">
              {formattedDateInfo.dateLabel}
            </h2>
          </div>

          <div>
            {formattedDateInfo.isToday && (
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-bold text-emerald-400">
                Hoje
              </span>
            )}
            {formattedDateInfo.isFuture && (
              <span className="px-2.5 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-[11px] font-bold text-[#C084FC] flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#EC4899]" />
                <span>Data Futura — Planejamento</span>
              </span>
            )}
            {formattedDateInfo.isPast && (
              <span className="px-2.5 py-0.5 rounded-full bg-[#1A1224] border border-[#322046] text-[11px] font-bold text-[#B5A8C8]">
                Histórico
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* RESUMO DIÁRIO: CALORIAS CONSUMIDAS, PLANEJADAS E RESTANTES  */}
      {/* ============================================================ */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 w-full">
        {/* Meta Diária */}
        <div className="rounded-2xl bg-[#140E1B] border border-[#322046] p-3 sm:p-5 text-center flex flex-col items-center justify-center shadow-md">
          <span className="text-[10px] sm:text-xs uppercase font-medium tracking-wider text-[#B5A8C8]">
            Meta Diária
          </span>
          <div className="mt-1 flex items-baseline justify-center gap-1">
            <span className="font-heading text-lg sm:text-3xl font-bold text-[#FAF8FC] font-mono-numbers">
              {formatPtBr(user.calorieGoal || 2200)}
            </span>
            <span className="text-[10px] sm:text-xs text-[#A78BFA]">kcal</span>
          </div>
          <span className="text-[9px] text-[#7B6E8F] mt-0.5 hidden sm:block">
            {user.name || 'Mariana'}
          </span>
        </div>

        {/* Calorias Consumidas (Real) */}
        <div className="rounded-2xl bg-[#140E1B] border border-pink-500/30 p-3 sm:p-5 text-center flex flex-col items-center justify-center shadow-md">
          <span className="text-[10px] sm:text-xs uppercase font-medium tracking-wider text-[#B5A8C8]">
            Consumidas
          </span>
          <div className="mt-1 flex items-baseline justify-center gap-1">
            <span className="font-heading text-lg sm:text-3xl font-bold text-[#EC4899] font-mono-numbers">
              {formatPtBr(consumedCalories)}
            </span>
            <span className="text-[10px] sm:text-xs text-pink-300">kcal</span>
          </div>
          <span className="text-[9px] text-[#7B6E8F] mt-0.5 hidden sm:block">
            {consumedMeals.length} refeição(ões) real(is)
          </span>
        </div>

        {/* Calorias Restantes */}
        <div className="rounded-2xl bg-[#140E1B] border border-[#322046] p-3 sm:p-5 text-center flex flex-col items-center justify-center shadow-md">
          <span className="text-[10px] sm:text-xs uppercase font-medium tracking-wider text-[#B5A8C8]">
            Restantes
          </span>
          <div className="mt-1 flex items-baseline justify-center gap-1">
            <span className="font-heading text-lg sm:text-3xl font-bold text-[#A78BFA] font-mono-numbers">
              {formatPtBr(remainingCalories)}
            </span>
            <span className="text-[10px] sm:text-xs text-violet-300">kcal</span>
          </div>
          <span className="text-[9px] text-[#7B6E8F] mt-0.5 hidden sm:block">
            Disponível
          </span>
        </div>
      </div>

      {/* Cartão de Calorias Planejadas (Aparece em destaque quando houver planos) */}
      {plannedCalories > 0 && (
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-[#1B1126] via-[#241334] to-[#1B1126] border border-[#8B5CF6]/40 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#8B5CF6]/20 text-[#C084FC]">
              <Sparkles className="w-4 h-4 text-[#EC4899]" />
            </div>
            <div>
              <span className="text-xs font-bold text-[#FAF8FC] block">
                Planejamento do Dia: {formatPtBr(plannedCalories)} kcal
              </span>
              <span className="text-[11px] text-[#B5A8C8]">
                Restante após todo o planejamento: {formatPtBr(Math.max(0, (user.calorieGoal || 2200) - consumedCalories - plannedCalories))} kcal
              </span>
            </div>
          </div>
          <span className="px-3 py-1 rounded-xl bg-[#120B19] border border-[#8B5CF6]/40 text-xs font-bold text-[#A78BFA]">
            {plannedMeals.length} refeição(ões) planejada(s)
          </span>
        </div>
      )}

      {/* Macronutrientes Consumidos */}
      <div className="p-3 rounded-2xl bg-[#140E1B] border border-[#322046] flex items-center justify-around gap-2 text-center font-mono-numbers text-xs">
        <div>
          <span className="text-[10px] text-[#B5A8C8] block">Carbos</span>
          <span className="font-bold text-[#A78BFA]">{formatPtBr(consumedMacros.carbs)}g</span>
        </div>
        <div className="w-px h-6 bg-[#2D1B3E]" />
        <div>
          <span className="text-[10px] text-[#B5A8C8] block">Proteínas</span>
          <span className="font-bold text-[#C084FC]">{formatPtBr(consumedMacros.protein)}g</span>
        </div>
        <div className="w-px h-6 bg-[#2D1B3E]" />
        <div>
          <span className="text-[10px] text-[#B5A8C8] block">Gorduras</span>
          <span className="font-bold text-[#F472B6]">{formatPtBr(consumedMacros.fat)}g</span>
        </div>
        <div className="w-px h-6 bg-[#2D1B3E]" />
        <div>
          <span className="text-[10px] text-[#B5A8C8] block">Fibras</span>
          <span className="font-bold text-emerald-400">{formatPtBr(consumedMacros.fiber)}g</span>
        </div>
      </div>

      {/* ============================================================ */}
      {/* REFEIÇÕES DO DIA (SLOTS)                                    */}
      {/* ============================================================ */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-[#FAF8FC] tracking-tight">
                {formattedDateInfo.isToday ? 'Refeições de Hoje 🌸' : 'Refeições do Dia 🌸'}
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 text-[10px] font-bold text-[#A78BFA]">
                {slots.length} horários
              </span>
            </div>
            <p className="text-[11px] text-[#B5A8C8]">
              {dateMeals.length === 0
                ? 'Sem refeições registradas ainda nesta data'
                : `${dateMeals.length} refeição(ões) anotada(s)`}
            </p>
          </div>

          {onNavigateToMeusAlimentos && (
            <button
              type="button"
              onClick={onNavigateToMeusAlimentos}
              className="self-start sm:self-auto px-3.5 py-1.5 rounded-xl bg-[#1A1224] hover:bg-[#20152B] border border-[#322046] hover:border-[#8B5CF6] text-xs font-semibold text-[#A78BFA] hover:text-[#EC4899] flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <Apple className="w-3.5 h-3.5 text-[#EC4899]" />
              <span>Meus Alimentos Salvos</span>
            </button>
          )}
        </div>

        {slots.map((slot) => {
          const slotConsumed = consumedMeals.filter((m) => m.mealType === slot.id);
          const slotPlanned = plannedMeals.filter((m) => m.mealType === slot.id);

          const slotConsumedCals = slotConsumed.reduce((acc, m) => acc + (m.totalCalories || 0), 0);
          const slotPlannedCals = slotPlanned.reduce((acc, m) => acc + (m.totalCalories || 0), 0);

          const isEmpty = slotConsumed.length === 0 && slotPlanned.length === 0;

          return (
            <div
              key={slot.id}
              className="rounded-3xl bg-[#140E1B] border border-[#2D1B3E] hover:border-[#8B5CF6]/40 transition-all overflow-hidden shadow-lg shadow-black/20"
            >
              {/* Header do Slot */}
              <div className="p-3.5 sm:p-4 bg-gradient-to-r from-[#181022] to-[#140E1B] border-b border-[#2D1B3E] flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-[#1F142B] border border-[#3A2452] flex items-center justify-center text-xl shadow-inner shrink-0">
                    {slot.icon}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm sm:text-base font-bold text-[#FAF8FC] truncate">
                      {slot.label}
                    </h4>
                    <div className="flex items-center gap-1.5 text-[11px] text-[#B5A8C8]">
                      <Clock className="w-3 h-3 text-[#A78BFA]" />
                      <span>{slot.timeHint}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {slotConsumedCals > 0 ? (
                    <span className="px-3 py-1 rounded-xl bg-pink-500/15 border border-pink-500/30 text-xs font-bold text-[#EC4899] font-mono-numbers">
                      {formatPtBr(slotConsumedCals)} kcal
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-xl bg-[#1A1224] border border-[#322046] text-[10px] font-semibold text-[#7B6E8F] font-mono-numbers">
                      0 kcal
                    </span>
                  )}
                  {slotPlannedCals > 0 && (
                    <span className="px-2.5 py-1 rounded-xl bg-purple-500/15 border border-purple-500/30 text-[10px] font-bold text-[#C084FC]">
                      +{formatPtBr(slotPlannedCals)} planejado
                    </span>
                  )}

                  {onUpdateMealSlots && (
                    <button
                      type="button"
                      onClick={() => setSlotToDelete(slot)}
                      className="p-1.5 rounded-xl text-[#7B6E8F] hover:text-rose-400 hover:bg-[#20152B] transition-colors cursor-pointer"
                      title={`Excluir refeição ${slot.label}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Conteúdo do Slot: Refeições Consumidas e Planejadas */}
              <div className="p-3.5 sm:p-4 space-y-3">
                {/* 1. REFEIÇÕES CONSUMIDAS REAIS */}
                {slotConsumed.map((meal) => (
                  <div
                    key={meal.id}
                    className="p-3 rounded-2xl bg-[#1A1224] border border-[#322046] space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="text-xs font-bold text-[#FAF8FC]">Consumido</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteMeal(meal.id)}
                        className="text-[11px] text-[#B5A8C8] hover:text-rose-400 flex items-center gap-1 cursor-pointer"
                        title="Excluir refeição"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Excluir</span>
                      </button>
                    </div>

                    <div className="space-y-1.5 divide-y divide-[#2D1B3E]/60">
                      {meal.foods.map((food) => {
                        const isEditingThis = editingFoodKey === `${meal.id}-${food.id}`;

                        return (
                          <div
                            key={food.id}
                            className="pt-1.5 first:pt-0 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="font-semibold text-[#FAF8FC] truncate block">
                                {food.name}
                              </span>
                              <span className="text-[10px] text-[#B5A8C8]">
                                {formatPtBr(food.portionGrams)}g · {formatPtBr(food.protein)}g P · {formatPtBr(food.carbs)}g C · {formatPtBr(food.fat)}g G
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-bold text-[#EC4899] font-mono-numbers">
                                {formatPtBr(food.calories)} kcal
                              </span>

                              {isEditingThis ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={editingGrams}
                                    onChange={(e) => setEditingGrams(e.target.value.replace(/[^0-9.,]/g, ''))}
                                    onBlur={() => {
                                      const parsed = parseFloat(editingGrams.replace(',', '.'));
                                      if (!parsed || parsed <= 0) setEditingGrams('100');
                                    }}
                                    placeholder="100"
                                    className="w-16 px-1 py-0.5 bg-[#120B19] border border-[#8B5CF6] text-xs font-bold text-center text-white rounded focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (onUpdateFoodItemGrams) {
                                        const parsed = Math.max(1, parseFloat(editingGrams.replace(',', '.')) || 100);
                                        onUpdateFoodItemGrams(meal.id, food.id, parsed);
                                      }
                                      setEditingFoodKey(null);
                                    }}
                                    className="p-1 rounded bg-emerald-600 text-white"
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingFoodKey(null)}
                                    className="p-1 rounded bg-[#2D1B3E] text-white"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingFoodKey(`${meal.id}-${food.id}`);
                                    setEditingGrams(String(food.portionGrams || 100));
                                  }}
                                  className="p-1 rounded-md text-[#B5A8C8] hover:text-[#FAF8FC] hover:bg-[#20152B]"
                                  title="Alterar gramas"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                              )}

                              {onDeleteFoodItem && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteFoodItem(meal.id, food.id)}
                                  className="p-1 rounded-md text-[#B5A8C8] hover:text-rose-400"
                                  title="Remover este alimento"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* 2. REFEIÇÕES PLANEJADAS (DIFERENCIADAS VISUALMENTE) */}
                {slotPlanned.map((meal) => (
                  <div
                    key={meal.id}
                    className="p-3.5 rounded-2xl bg-[#1A1224]/80 border border-dashed border-[#8B5CF6]/50 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#A78BFA] animate-pulse" />
                        <span className="text-xs font-bold text-[#A78BFA]">Planejado</span>
                        <span className="text-[10px] text-[#7B6E8F]">
                          (Não conta no consumo real até confirmar)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteMeal(meal.id)}
                        className="text-[11px] text-[#B5A8C8] hover:text-rose-400 flex items-center gap-1 cursor-pointer"
                        title="Excluir planejamento"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Lista de Alimentos do Planejamento */}
                    <div className="space-y-1 divide-y divide-[#2D1B3E]/40 text-xs">
                      {meal.foods.map((food) => (
                        <div key={food.id} className="pt-1 first:pt-0 flex items-center justify-between gap-2">
                          <span className="text-[#FAF8FC] truncate">{food.name} ({formatPtBr(food.portionGrams)}g)</span>
                          <span className="text-[#A78BFA] font-mono-numbers">{formatPtBr(food.calories)} kcal</span>
                        </div>
                      ))}
                    </div>

                    {/* Botão de Destaque: Marcar como Consumida */}
                    <div className="pt-1 flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#FAF8FC]">
                        Total planejado: {formatPtBr(meal.totalCalories)} kcal
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenMarkAsConsumed(meal)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md shadow-emerald-600/25 active:scale-95 transition-all cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Marcar como Consumida</span>
                      </button>
                    </div>
                  </div>
                ))}

                {/* ESTADO VAZIO: DESIGN DELICADO E PERFEITO PARA A MARI */}
                {isEmpty ? (
                  <div className="py-6 px-4 text-center rounded-2xl bg-[#181022]/60 border border-dashed border-[#2D1B3E] space-y-3.5">
                    <div className="w-10 h-10 rounded-full bg-[#1F142B] border border-[#3A2452] flex items-center justify-center mx-auto text-[#A78BFA]">
                      <Utensils className="w-5 h-5 text-[#C084FC]" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-[#FAF8FC]">
                        Nenhum alimento registrado ainda neste horário.
                      </p>
                      <p className="text-[11px] text-[#7B6E8F] mt-0.5">
                        Escolha um alimento salvo ou planeje sua refeição com carinho 💜
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1 max-w-sm mx-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setFoodPickerSlot({ mealType: slot.id, isPlanned: false });
                          setSelectedFoodToInsert(null);
                          setPickerSearch('');
                        }}
                        className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED] via-[#8B5CF6] to-[#EC4899] hover:brightness-110 text-white text-xs font-bold shadow-lg shadow-[#7C3AED]/25 active:scale-95 transition-all cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Adicionar Alimento</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setFoodPickerSlot({ mealType: slot.id, isPlanned: true });
                          setSelectedFoodToInsert(null);
                          setPickerSearch('');
                        }}
                        className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#1A1224] hover:bg-[#20152B] border border-[#8B5CF6]/50 hover:border-[#EC4899] text-xs font-semibold text-[#C084FC] active:scale-95 transition-all cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-[#EC4899]" />
                        <span>Planejar</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Botões de Ação quando o slot já contém alimentos */
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#2D1B3E]/60">
                    <button
                      type="button"
                      onClick={() => {
                        setFoodPickerSlot({ mealType: slot.id, isPlanned: false });
                        setSelectedFoodToInsert(null);
                        setPickerSearch('');
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#1A1224] hover:bg-[#20152B] border border-[#322046] hover:border-[#8B5CF6] text-xs font-semibold text-[#FAF8FC] transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#A78BFA]" />
                      <span>+ Adicionar Alimento</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setFoodPickerSlot({ mealType: slot.id, isPlanned: true });
                        setSelectedFoodToInsert(null);
                        setPickerSearch('');
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#1A1224] hover:bg-[#20152B] border border-[#322046] hover:border-[#EC4899] text-xs font-semibold text-[#C084FC] transition-colors cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#EC4899]" />
                      <span>+ Planejar</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Botão para Adicionar Nova Refeição na Rotina Diária */}
        {onUpdateMealSlots && (
          <button
            type="button"
            onClick={() => {
              setNewSlotLabel('');
              setNewSlotTime('15:00 - 16:00');
              setNewSlotIcon('🍽️');
              setIsAddingMealSlot(true);
            }}
            className="w-full py-3.5 rounded-2xl border border-dashed border-[#322046] hover:border-[#8B5CF6]/70 bg-[#140E1B]/50 hover:bg-[#1A1224] text-xs font-semibold text-[#B5A8C8] hover:text-[#FAF8FC] flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm active:scale-[0.99]"
          >
            <Plus className="w-4 h-4 text-[#A78BFA]" />
            <span>+ Adicionar refeição na rotina</span>
          </button>
        )}
      </div>

      {/* ============================================================ */}
      {/* MODAL: SELECIONAR ALIMENTO DA BIBLIOTECA "MEUS ALIMENTOS"    */}
      {/* ============================================================ */}
      {foodPickerSlot && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
          <div className="w-full max-w-lg bg-[#140E1B] border-t sm:border border-[#322046] rounded-t-3xl sm:rounded-3xl p-5 space-y-4 shadow-2xl max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#2D1B3E]">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-gradient-to-tr from-[#6D28D9] to-[#EC4899] text-white">
                  <Apple className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#FAF8FC]">
                    {foodPickerSlot.isPlanned ? 'Planejar Refeição' : 'Adicionar Alimento'}
                  </h3>
                  <p className="text-[11px] text-[#B5A8C8]">
                    Selecione um alimento da sua biblioteca para a data {formattedDateInfo.dateLabel.split('—')[0]}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFoodPickerSlot(null)}
                className="p-1.5 rounded-lg text-[#B5A8C8] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Barra de Pesquisa de Alimentos Salvos */}
            <div className="relative">
              <Search className="w-4 h-4 text-[#B5A8C8] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Pesquisar em Meus Alimentos..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#1A1224] border border-[#322046] text-xs text-[#FAF8FC] placeholder-[#7B6E8F] focus:outline-none focus:border-[#8B5CF6]"
              />
            </div>

            {/* Lista de Alimentos Salvos Selecionáveis */}
            {!selectedFoodToInsert ? (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {filteredPickerFoods.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[#B5A8C8] space-y-2">
                    <p>Nenhum alimento cadastrado corresponde a essa busca.</p>
                    {onNavigateToMeusAlimentos && (
                      <button
                        type="button"
                        onClick={() => {
                          setFoodPickerSlot(null);
                          onNavigateToMeusAlimentos();
                        }}
                        className="px-3 py-1.5 rounded-xl bg-[#8B5CF6] text-white font-bold"
                      >
                        Cadastrar Novo Alimento
                      </button>
                    )}
                  </div>
                ) : (
                  filteredPickerFoods.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setSelectedFoodToInsert(f);
                        setInsertGrams(f.portionGrams || 100);
                      }}
                      className="w-full p-2.5 rounded-xl bg-[#181022] hover:bg-[#20152B] border border-[#2D1B3E] hover:border-[#8B5CF6] text-left flex items-center justify-between gap-2 transition-colors cursor-pointer"
                    >
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-[#FAF8FC] block truncate">
                          {f.name}
                        </span>
                        <span className="text-[10px] text-[#B5A8C8] block truncate">
                          {f.brand ? `${f.brand} · ` : ''}100g ≈ {formatPtBr(f.per100g?.calories ?? f.calories)} kcal
                        </span>
                      </div>
                      <span className="text-xs font-bold text-[#EC4899] font-mono-numbers shrink-0">
                        Selecionar
                      </span>
                    </button>
                  ))
                )}
              </div>
            ) : (
              /* Configuração de Gramas para o Alimento Selecionado */
              <div className="p-4 rounded-2xl bg-[#181022] border border-[#8B5CF6]/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-[#FAF8FC]">{selectedFoodToInsert.name}</h4>
                    <span className="text-[10px] text-[#B5A8C8]">
                      {selectedFoodToInsert.brand || 'Alimento Salvo'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedFoodToInsert(null)}
                    className="text-[10px] text-[#A78BFA] hover:underline"
                  >
                    Trocar Alimento
                  </button>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="text-xs font-semibold text-[#FAF8FC]">
                    Quantidade a adicionar:
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={insertGrams}
                      onChange={(e) => setInsertGrams(e.target.value.replace(/[^0-9.,]/g, ''))}
                      onBlur={() => {
                        const parsed = parseFloat(insertGrams.replace(',', '.'));
                        if (!parsed || parsed <= 0) setInsertGrams('100');
                      }}
                      placeholder="100"
                      className="w-20 px-2 py-1 text-center font-bold text-xs bg-[#120B19] border border-[#8B5CF6] rounded-lg text-[#FAF8FC] focus:outline-none"
                    />
                    <span className="text-xs text-[#B5A8C8]">g</span>
                  </div>
                </div>

                <input
                  type="range"
                  min="10"
                  max="500"
                  step="5"
                  value={parseFloat(insertGrams.replace(',', '.')) || 10}
                  onChange={(e) => setInsertGrams(e.target.value)}
                  className="w-full accent-[#EC4899] cursor-pointer"
                />

                {(() => {
                  const p100 = selectedFoodToInsert.per100g || {
                    calories: selectedFoodToInsert.calories,
                    protein: selectedFoodToInsert.protein,
                    carbs: selectedFoodToInsert.carbs,
                    fat: selectedFoodToInsert.fat,
                  };
                  const parsed = parseFloat(insertGrams.replace(',', '.')) || 0;
                  const ratio = Math.max(0, parsed) / 100;
                  const cals = formatPtBr(Number(((p100.calories || 0) * ratio).toFixed(1)));
                  const prot = formatPtBr(Number(((p100.protein || 0) * ratio).toFixed(2)));
                  const carb = formatPtBr(Number(((p100.carbs || 0) * ratio).toFixed(2)));
                  const fat = formatPtBr(Number(((p100.fat || 0) * ratio).toFixed(2)));

                  return (
                    <div className="grid grid-cols-4 gap-1.5 pt-1 text-center font-mono-numbers text-[11px]">
                      <div className="p-1.5 rounded-lg bg-[#120B19] border border-pink-500/20">
                        <span className="text-[9px] text-[#B5A8C8] block">Calorias</span>
                        <span className="font-bold text-[#EC4899]">{cals} kcal</span>
                      </div>
                      <div className="p-1.5 rounded-lg bg-[#120B19] border border-violet-500/20">
                        <span className="text-[9px] text-[#B5A8C8] block">Carbos</span>
                        <span className="font-bold text-[#A78BFA]">{carb}g</span>
                      </div>
                      <div className="p-1.5 rounded-lg bg-[#120B19] border border-purple-500/20">
                        <span className="text-[9px] text-[#B5A8C8] block">Proteína</span>
                        <span className="font-bold text-[#C084FC]">{prot}g</span>
                      </div>
                      <div className="p-1.5 rounded-lg bg-[#120B19] border border-rose-500/20">
                        <span className="text-[9px] text-[#B5A8C8] block">Gordura</span>
                        <span className="font-bold text-[#F472B6]">{fat}g</span>
                      </div>
                    </div>
                  );
                })()}

                <button
                  type="button"
                  onClick={handleConfirmInsertFromPicker}
                  className="w-full mt-2 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#8B5CF6] to-[#EC4899] text-white text-xs font-bold shadow-lg shadow-[#8B5CF6]/30 hover:opacity-95 transition-all cursor-pointer"
                >
                  Confirmar e Adicionar ({insertGrams}g)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: MARCAR REFEIÇÃO PLANEJADA COMO CONSUMIDA              */}
      {/* ============================================================ */}
      {mealToConsume && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-[#140E1B] border border-emerald-500/40 rounded-3xl p-5 space-y-4 shadow-2xl max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center gap-2.5 pb-2 border-b border-[#2D1B3E]">
              <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#FAF8FC]">
                  Confirmar Consumo da Refeição
                </h3>
                <p className="text-[11px] text-emerald-300">
                  Esta refeição sairá do planejamento e passará a contar no seu consumo real.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-[#FAF8FC] block">
                Confira ou ajuste as quantidades consumidas:
              </span>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {adjustingFoods.map((f, idx) => (
                  <div
                    key={f.id}
                    className="p-2.5 rounded-xl bg-[#181022] border border-[#2D1B3E] flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold text-[#FAF8FC] block truncate">{f.name}</span>
                      <span className="text-[10px] text-[#EC4899] font-mono-numbers">
                        {formatPtBr(f.calories)} kcal
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={f.portionGrams === 0 ? '' : f.portionGrams}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9.,]/g, '');
                          const num = parseFloat(val.replace(',', '.'));
                          handleAdjustGramsInPlan(idx, isNaN(num) ? 0 : num);
                        }}
                        onBlur={() => {
                          if (!f.portionGrams || f.portionGrams <= 0) {
                            handleAdjustGramsInPlan(idx, 100);
                          }
                        }}
                        placeholder="100"
                        className="w-16 px-2 py-1 text-center font-bold text-xs bg-[#120B19] border border-emerald-500/40 rounded-lg text-[#FAF8FC] focus:outline-none"
                      />
                      <span className="text-xs text-[#B5A8C8]">g</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-200 text-xs flex items-center justify-between">
              <span>Total real a somar hoje:</span>
              <span className="font-bold font-mono-numbers text-sm text-emerald-400">
                {formatPtBr(adjustingFoods.reduce((acc, f) => acc + (f.calories || 0), 0))} kcal
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMealToConsume(null)}
                className="px-4 py-2 rounded-xl bg-[#1A1224] border border-[#322046] text-xs font-medium text-[#B5A8C8] hover:text-white cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmMarkAsConsumed}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Confirmar Consumo</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: ADICIONAR NOVA REFEIÇÃO / HORÁRIO NA ROTINA           */}
      {/* ============================================================ */}
      {isAddingMealSlot && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-[#140E1B] border border-[#8B5CF6]/50 rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#2D1B3E]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#6D28D9] to-[#EC4899] text-white flex items-center justify-center text-lg shadow-md shadow-[#6D28D9]/30">
                  {newSlotIcon}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#FAF8FC]">
                    Adicionar Nova Refeição 🌸
                  </h3>
                  <p className="text-[11px] text-[#B5A8C8]">
                    Crie um novo horário na rotina diária da Mari
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddingMealSlot(false)}
                className="p-1.5 rounded-lg text-[#B5A8C8] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 pt-1">
              {/* Nome da Refeição */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#FAF8FC]">Nome da Refeição:</label>
                <input
                  type="text"
                  required
                  value={newSlotLabel}
                  onChange={(e) => setNewSlotLabel(e.target.value)}
                  placeholder="Ex: Pré-Treino, Ceia, Colação, Lanche..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#1A1224] border border-[#322046] focus:border-[#8B5CF6] text-xs font-medium text-[#FAF8FC] placeholder-[#7B6E8F] focus:outline-none"
                />
              </div>

              {/* Horário Sugerido */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#FAF8FC]">Horário Sugerido:</label>
                <input
                  type="text"
                  value={newSlotTime}
                  onChange={(e) => setNewSlotTime(e.target.value)}
                  placeholder="Ex: 15:00 - 15:30"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#1A1224] border border-[#322046] focus:border-[#8B5CF6] text-xs font-medium text-[#FAF8FC] placeholder-[#7B6E8F] focus:outline-none"
                />
              </div>

              {/* Escolha do Ícone */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#FAF8FC]">Ícone:</label>
                <div className="flex flex-wrap gap-2">
                  {['☕', '🍌', '🥗', '🍎', '🍲', '🌙', '🥣', '🥪', '🥑', '🍓', '🏋️‍♀️', '🍳', '🍽️', '🥤', '🍰'].map((ico) => (
                    <button
                      key={ico}
                      type="button"
                      onClick={() => setNewSlotIcon(ico)}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg border transition-all cursor-pointer ${
                        newSlotIcon === ico
                          ? 'bg-[#2A173B] border-[#EC4899] scale-110 shadow-md'
                          : 'bg-[#181022] border-[#322046] hover:border-[#8B5CF6]'
                      }`}
                    >
                      {ico}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#2D1B3E]">
              <button
                type="button"
                onClick={() => setIsAddingMealSlot(false)}
                className="px-4 py-2 rounded-xl bg-[#1A1224] border border-[#322046] text-xs font-medium text-[#B5A8C8] hover:text-white cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const label = newSlotLabel.trim();
                  if (!label) return;
                  const newSlot: MealSlot = {
                    id: `slot_${Date.now()}`,
                    label,
                    timeHint: newSlotTime.trim() || 'Horário livre',
                    icon: newSlotIcon || '🍽️',
                  };
                  if (onUpdateMealSlots) {
                    onUpdateMealSlots([...slots, newSlot]);
                  }
                  setIsAddingMealSlot(false);
                }}
                disabled={!newSlotLabel.trim()}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#8B5CF6] to-[#EC4899] hover:brightness-110 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-[#8B5CF6]/30 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Salvar Refeição</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: EXCLUIR REFEIÇÃO / HORÁRIO DA ROTINA                  */}
      {/* ============================================================ */}
      {slotToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-sm bg-[#140E1B] border border-rose-500/40 rounded-3xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#FAF8FC]">
                  Excluir {slotToDelete.label}?
                </h3>
                <p className="text-[11px] text-[#B5A8C8]">
                  Esta refeição será removida da sua rotina diária.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#1A1224] border border-[#322046] text-xs text-[#B5A8C8] flex items-center gap-2">
              <span className="text-lg">{slotToDelete.icon}</span>
              <div>
                <span className="font-bold text-[#FAF8FC] block">{slotToDelete.label}</span>
                <span className="text-[10px] text-[#7B6E8F]">{slotToDelete.timeHint}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSlotToDelete(null)}
                className="px-4 py-2 rounded-xl bg-[#1A1224] border border-[#322046] text-xs font-medium text-[#B5A8C8] hover:text-white cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onUpdateMealSlots) {
                    onUpdateMealSlots(slots.filter((s) => s.id !== slotToDelete.id));
                  }
                  setSlotToDelete(null);
                }}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Excluir Refeição</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
