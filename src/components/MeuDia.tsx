import React, { useState } from 'react';
import {
  Camera,
  Barcode,
  Scale,
  Plus,
  Utensils,
  ChevronRight,
  Clock,
  Calendar,
  Trash2,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import { AppState, MealType, MealSlot } from '../types';
import { INITIAL_MEAL_SLOTS } from '../services/storage';

interface MeuDiaProps {
  appState: AppState;
  onNavigateTab: (tab: any) => void;
  onOpenRegistrarGramas: (mealType?: MealType) => void;
  onOpenPhotoScanner: (mealType?: MealType) => void;
  onOpenBarcodeScanner: (mealType?: MealType) => void;
  onOpenSemBalanca: (mealType?: MealType) => void;
  onOpenCalculadora: (mealType?: MealType) => void;
  onDeleteMeal: (mealId: string) => void;
  onDeleteFoodItem?: (mealId: string, foodId: string) => void;
  onUpdateMealSlots?: (slots: MealSlot[]) => void;
}


export const MeuDia: React.FC<MeuDiaProps> = ({
  appState,
  onNavigateTab,
  onOpenRegistrarGramas,
  onOpenPhotoScanner,
  onOpenBarcodeScanner,
  onOpenSemBalanca,
  onOpenCalculadora,
  onDeleteMeal,
  onDeleteFoodItem,
  onUpdateMealSlots,
}) => {
  const { user, todayLogs, weeklyPlan } = appState;
  const mealSlots = (appState.mealSlots && appState.mealSlots.length ? appState.mealSlots : INITIAL_MEAL_SLOTS);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editIcon, setEditIcon] = useState('');

  const startEdit = (slot: MealSlot) => {
    setEditingId(slot.id);
    setEditLabel(slot.label);
    setEditTime(slot.timeHint);
    setEditIcon(slot.icon);
  };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = () => {
    if (!editingId) return;
    const next = mealSlots.map((s) =>
      s.id === editingId
        ? { ...s, label: editLabel.trim() || s.label, timeHint: editTime.trim() || s.timeHint, icon: editIcon.trim() || s.icon }
        : s
    );
    onUpdateMealSlots?.(next);
    setEditingId(null);
  };
  const addMeal = () => {
    const id = `meal-${Date.now()}`;
    const next = [...mealSlots, { id, label: 'Nova Refeição', timeHint: '00:00', icon: '🍽️' }];
    onUpdateMealSlots?.(next);
    setEditingId(id);
    setEditLabel('Nova Refeição');
    setEditTime('00:00');
    setEditIcon('🍽️');
  };
  const removeMeal = (id: string) => {
    const next = mealSlots.filter((s) => s.id !== id);
    onUpdateMealSlots?.(next);
    if (editingId === id) setEditingId(null);
  };

  // Compute daily totals
  const consumedCalories = todayLogs.reduce((acc, log) => acc + log.totalCalories, 0);
  const remainingCalories = Math.max(0, user.calorieGoal - consumedCalories);

  // Formatted date in Brazilian Portuguese
  const todayDateFormatted = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  // Greeting by hour
  const currentHour = new Date().getHours();
  let timeGreeting = 'Bom dia';
  if (currentHour >= 12 && currentHour < 18) {
    timeGreeting = 'Boa tarde';
  } else if (currentHour >= 18 || currentHour < 5) {
    timeGreeting = 'Boa noite';
  }

  // Get current day of week key
  const dayNames: ('domingo' | 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta' | 'sabado')[] = [
    'domingo',
    'segunda',
    'terca',
    'quarta',
    'quinta',
    'sexta',
    'sabado',
  ];
  const todayDayKey = dayNames[new Date().getDay()];
  const plannedToday = weeklyPlan[todayDayKey] || [];

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4 sm:space-y-6 pb-28 lg:pb-12">
      {/* Hero Welcome Banner - Centered & Highly Responsive */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#18121F] via-[#100C16] to-[#09070D] border border-[#33263F] p-4 sm:p-7 shadow-xl text-center">
        {/* Atmospheric ambient glows */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -mt-20 w-80 h-80 bg-[#8B5CF6]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 -mb-16 w-60 h-60 bg-[#EC4899]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-2xl mx-auto flex flex-col items-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#100C16] border border-[#33263F] text-[11px] sm:text-xs font-medium text-[#A78BFA] mb-2 sm:mb-3 capitalize max-w-full">
            <Calendar className="w-3.5 h-3.5 text-[#EC4899] shrink-0" />
            <span className="truncate">{todayDateFormatted}</span>
          </div>

          <h1 className="font-heading text-xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-[#F8F5FC]">
            {timeGreeting}, Mari 🌸
          </h1>


          {/* Centered Quick Action Buttons Grid */}
          <div className="mt-4 sm:mt-6 w-full grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            {/* Primary button: Adicionar Alimento */}
            <button
              onClick={() => onOpenRegistrarGramas()}
              className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2.5 sm:py-3 rounded-2xl bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] hover:from-[#7C3AED] hover:to-[#A78BFA] text-white text-[11px] sm:text-xs font-bold shadow-lg shadow-[#8B5CF6]/25 transition-all active:scale-[0.98] cursor-pointer"
            >
              <Scale className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="truncate">Adicionar Alimento</span>
            </button>

            <button
              onClick={() => onOpenPhotoScanner()}
              className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2.5 sm:py-3 rounded-2xl bg-[#100C16] hover:bg-[#22192C] text-[#F8F5FC] border border-[#33263F] hover:border-[#EC4899]/50 text-[11px] sm:text-xs font-medium transition-all active:scale-[0.98] cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#EC4899] shrink-0" />
              <span className="truncate">Fotografar</span>
            </button>

            <button
              onClick={() => onOpenBarcodeScanner()}
              className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2.5 sm:py-3 rounded-2xl bg-[#100C16] hover:bg-[#22192C] text-[#F8F5FC] border border-[#33263F] hover:border-[#8B5CF6]/50 text-[11px] sm:text-xs font-medium transition-all active:scale-[0.98] cursor-pointer"
            >
              <Barcode className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#A78BFA] shrink-0" />
              <span className="truncate">Código Barras</span>
            </button>

            <button
              onClick={() => onOpenSemBalanca()}
              className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2.5 sm:py-3 rounded-2xl bg-[#100C16] hover:bg-[#22192C] text-[#F8F5FC] border border-[#33263F] hover:border-[#EC4899]/50 text-[11px] sm:text-xs font-medium transition-all active:scale-[0.98] cursor-pointer"
            >
              <Scale className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#EC4899] shrink-0" />
              <span className="truncate">Sem Balança</span>
            </button>
          </div>
        </div>
      </div>

      {/* Numerical Calorie Summary (3 Centered Responsive Side-by-Side Cards, STRICTLY NO PROGRESS BARS) */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-4 w-full">
        {/* Meta Diária */}
        <div className="rounded-2xl bg-[#18121F] border border-[#33263F] p-2.5 sm:p-5 shadow-sm text-center flex flex-col items-center justify-center min-w-0">
          <span className="text-[9px] sm:text-xs uppercase font-medium tracking-wider text-[#B8AFC4] truncate max-w-full">
            Meta Diária
          </span>
          <div className="mt-1 sm:mt-2 flex items-baseline justify-center gap-0.5 sm:gap-1">
            <span className="font-heading text-base sm:text-3xl lg:text-4xl font-bold text-[#F8F5FC] font-mono-numbers">
              {user.calorieGoal}
            </span>
            <span className="text-[9px] sm:text-xs font-medium text-[#A78BFA]">kcal</span>
          </div>
          <p className="text-[9px] sm:text-[11px] text-[#B8AFC4]/70 mt-0.5 sm:mt-1 hidden sm:block">
            Plano da Mari
          </p>
        </div>

        {/* Consumidas Hoje */}
        <div className="rounded-2xl bg-[#18121F] border border-[#33263F] p-2.5 sm:p-5 shadow-sm text-center flex flex-col items-center justify-center min-w-0">
          <span className="text-[9px] sm:text-xs uppercase font-medium tracking-wider text-[#B8AFC4] truncate max-w-full">
            Consumidas
          </span>
          <div className="mt-1 sm:mt-2 flex items-baseline justify-center gap-0.5 sm:gap-1">
            <span className="font-heading text-base sm:text-3xl lg:text-4xl font-bold text-[#EC4899] font-mono-numbers">
              {consumedCalories}
            </span>
            <span className="text-[9px] sm:text-xs font-medium text-[#EC4899]/80">kcal</span>
          </div>
          <p className="text-[9px] sm:text-[11px] text-[#B8AFC4]/70 mt-0.5 sm:mt-1 hidden sm:block">
            {todayLogs.length} registro(s)
          </p>
        </div>

        {/* Calorias Restantes */}
        <div className="rounded-2xl bg-[#18121F] border border-[#33263F] p-2.5 sm:p-5 shadow-sm text-center flex flex-col items-center justify-center min-w-0">
          <span className="text-[9px] sm:text-xs uppercase font-medium tracking-wider text-[#B8AFC4] truncate max-w-full">
            Restantes
          </span>
          <div className="mt-1 sm:mt-2 flex items-baseline justify-center gap-0.5 sm:gap-1">
            <span className="font-heading text-base sm:text-3xl lg:text-4xl font-bold text-[#A78BFA] font-mono-numbers">
              {remainingCalories}
            </span>
            <span className="text-[9px] sm:text-xs font-medium text-[#A78BFA]/80">kcal</span>
          </div>
          <p className="text-[9px] sm:text-[11px] text-[#B8AFC4]/70 mt-0.5 sm:mt-1 hidden sm:block">
            Disponível hoje
          </p>
        </div>
      </div>

      {/* Planned Marmitas for Today (if any) */}
      {plannedToday.length > 0 && (
        <div className="rounded-2xl bg-[#18121F] border border-[#33263F] p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Utensils className="w-4 h-4 text-[#8B5CF6]" />
              <h2 className="text-xs sm:text-sm font-semibold text-[#F8F5FC]">
                Marmitas Planejadas para Hoje
              </h2>
            </div>
            <button
              onClick={() => onNavigateTab('planejamento')}
              className="text-xs text-[#A78BFA] hover:text-[#F8F5FC] transition-colors"
            >
              Ver semana →
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            {plannedToday.map((planItem) => (
              <div
                key={planItem.id}
                className="p-3 rounded-xl bg-[#100C16] border border-[#33263F] flex items-center justify-between gap-3"
              >
                <div>
                  <span className="text-[10px] text-[#EC4899] font-medium uppercase tracking-wider">
                    {planItem.mealType === 'almoco'
                      ? 'Almoço'
                      : planItem.mealType === 'jantar'
                      ? 'Jantar'
                      : planItem.mealType}
                  </span>
                  <div className="flex items-center gap-2 text-xs text-[#B8AFC4] mt-0.5 font-mono-numbers">
                    <span>{planItem.calories} kcal</span>
                  </div>
                </div>
                <button
                  onClick={() => onNavigateTab('marmitas')}
                  className="p-2 rounded-lg bg-[#18121F] hover:bg-[#22192C] text-[#A78BFA] transition-colors cursor-pointer"
                  title="Ver detalhes da marmita"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Meals of the Day Summary */}
      <div className="space-y-3.5 sm:space-y-4">
        <div className="flex items-center justify-between px-1">
          <div>
            <h2 className="text-sm sm:text-lg font-bold text-[#F8F5FC]">
              Refeições de Hoje
            </h2>
            <p className="text-[11px] sm:text-xs text-[#B8AFC4]">
              {todayLogs.length === 0
                ? 'Sem refeições registradas ainda hoje'
                : `${todayLogs.length} registrada(s) · ${consumedCalories} kcal totais`}
            </p>
          </div>

          <button
            onClick={() => onOpenRegistrarGramas()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] text-white text-xs font-semibold shadow-md shadow-[#8B5CF6]/20 transition-all active:scale-95 cursor-pointer"
          >
            <Scale className="w-3.5 h-3.5" />
            <span>Adicionar Alimento</span>
          </button>
        </div>

        <div className="space-y-3">
          {mealSlots.map((type) => {
            const logsForType = todayLogs.filter((log) => log.mealType === type.id);
            const totalMealKcal = logsForType.reduce((acc, l) => acc + l.totalCalories, 0);
            const totalMealGrams = logsForType.reduce(
              (acc, l) => acc + l.foods.reduce((fAcc, f) => fAcc + (f.portionGrams || 0), 0),
              0
            );

            return (
              <div
                key={type.id}
                className="rounded-2xl bg-[#18121F] border border-[#33263F] overflow-hidden transition-all hover:border-[#8B5CF6]/40"
              >
                {/* Meal Header */}
                <div className="p-2.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 border-b border-[#33263F]/40">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                    {editingId === type.id ? (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1 min-w-0 w-full">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <input
                            value={editIcon}
                            onChange={(e) => setEditIcon(e.target.value)}
                            className="w-9 text-center py-1.5 rounded-xl bg-[#100C16] border border-[#33263F] text-base focus:outline-none focus:border-[#8B5CF6] shrink-0"
                            title="Ícone (emoji)"
                          />
                          <input
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            className="flex-1 min-w-0 py-1.5 px-2.5 rounded-xl bg-[#100C16] border border-[#33263F] text-xs sm:text-sm text-[#F8F5FC] focus:outline-none focus:border-[#8B5CF6]"
                            placeholder="Nome da refeição"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            value={editTime}
                            onChange={(e) => setEditTime(e.target.value)}
                            className="flex-1 sm:w-28 py-1.5 px-2.5 rounded-xl bg-[#100C16] border border-[#33263F] text-[11px] text-[#B8AFC4] focus:outline-none focus:border-[#8B5CF6]"
                            placeholder="Horário (ex: 12:30)"
                          />
                          <button
                            onClick={saveEdit}
                            title="Salvar"
                            className="p-1.5 sm:p-2 rounded-xl bg-[#8B5CF6] text-white hover:bg-[#7C3AED] transition-colors cursor-pointer shrink-0"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={cancelEdit}
                            title="Cancelar"
                            className="p-1.5 sm:p-2 rounded-xl bg-[#100C16] text-[#B8AFC4] border border-[#33263F] hover:text-[#F8F5FC] transition-colors cursor-pointer shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#100C16] border border-[#33263F] flex items-center justify-center text-base sm:text-lg shrink-0">
                          {type.icon}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-xs sm:text-sm font-semibold text-[#F8F5FC] truncate">{type.label}</h3>
                          <div className="flex items-center gap-1 text-[10px] sm:text-[11px] text-[#B8AFC4]">
                            <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#A78BFA] shrink-0" />
                            <span className="truncate">{type.timeHint}</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {editingId !== type.id && (
                    <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2.5 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-[#33263F]/20">
                      {logsForType.length > 0 && (
                        <div className="text-left sm:text-right mr-auto sm:mr-0">
                          <div className="text-xs sm:text-sm font-bold text-[#A78BFA] font-mono-numbers">
                            {totalMealKcal} kcal
                          </div>
                          <div className="text-[10px] text-[#B8AFC4] font-mono-numbers">
                            {totalMealGrams > 0 ? `${totalMealGrams}g` : `${logsForType.length} item(ns)`}
                          </div>
                        </div>
                      )}

                      {/* Quick Add Menu */}
                      <div className="flex items-center gap-1 ml-auto sm:ml-0">
                        <button
                          onClick={() => onOpenRegistrarGramas(type.id)}
                          title="Colocar em gramas para esta refeição"
                          className="flex items-center gap-1 px-2 py-1.5 sm:px-2.5 rounded-xl bg-[#100C16] hover:bg-[#22192C] text-[#A78BFA] border border-[#33263F] hover:border-[#8B5CF6]/50 text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <Scale className="w-3.5 h-3.5 text-[#A78BFA]" />
                          <span className="hidden sm:inline">+ Gramas</span>
                        </button>

                        <button
                          onClick={() => onOpenPhotoScanner(type.id)}
                          title="Fotografar esta refeição"
                          className="p-1.5 sm:p-2 rounded-xl bg-[#100C16] hover:bg-[#22192C] text-[#EC4899] border border-[#33263F] hover:border-[#EC4899]/50 transition-colors cursor-pointer"
                        >
                          <Camera className="w-4 h-4" />
                        </button>
                      </div>

                      <button
                        onClick={() => startEdit(type)}
                        title="Editar nome e horário"
                        className="p-1.5 sm:p-2 rounded-xl bg-[#100C16] hover:bg-[#22192C] text-[#B8AFC4] border border-[#33263F] hover:border-[#8B5CF6]/50 transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </button>
                      <button
                        onClick={() => removeMeal(type.id)}
                        title="Remover refeição"
                        className="p-1.5 sm:p-2 rounded-xl bg-[#100C16] hover:bg-[#22192C] text-[#B8AFC4] border border-[#33263F] hover:border-red-500/50 hover:text-red-400 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Meal Items List */}
                {logsForType.length === 0 ? (
                  <div className="px-3 sm:px-4 py-3 sm:py-3.5 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-[#100C16]/40">
                    <span className="text-xs text-[#B8AFC4]/80">
                      Nenhum alimento registrado ainda neste horário.
                    </span>
                    <button
                      onClick={() => onOpenRegistrarGramas(type.id)}
                      className="w-full sm:w-auto px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] text-white text-xs font-semibold shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Scale className="w-3.5 h-3.5" />
                      <span>Adicionar Alimento</span>
                    </button>
                  </div>
                ) : (
                  <div className="p-2.5 sm:p-3 space-y-2">
                    {(() => {
                      // Flatten all foods across logs for this meal type so each is rendered separately
                      const mealFoods = logsForType.flatMap((log) =>
                        log.foods.map((food, fIdx) => ({
                          food,
                          logId: log.id,
                          itemKey: `${log.id}-${food.id || fIdx}`,
                        }))
                      );

                      if (mealFoods.length === 0) {
                        return (
                          <div className="p-3 text-center text-xs text-[#B8AFC4]">
                            Nenhum alimento neste horário.
                          </div>
                        );
                      }

                      return mealFoods.map(({ food, logId, itemKey }, index) => {
                        const foodDisplayName =
                          food.name && food.name !== 'Porção Registrada'
                            ? food.name
                            : `Alimento #${index + 1}`;

                        return (
                          <div
                            key={itemKey}
                            className="p-2.5 sm:p-3 rounded-xl bg-[#100C16] border border-[#33263F]/70 flex items-center justify-between gap-3 hover:border-[#8B5CF6]/40 transition-colors"
                          >
                            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#18121F] border border-[#33263F] flex items-center justify-center text-xs font-bold text-[#A78BFA] shrink-0 font-mono-numbers">
                                #{index + 1}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs sm:text-sm font-semibold text-[#F8F5FC] truncate">
                                    {foodDisplayName}
                                  </span>
                                  {food.portionGrams > 0 && (
                                    <span className="px-1.5 sm:px-2 py-0.5 rounded-md bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 text-[#A78BFA] text-[10px] font-bold font-mono-numbers shrink-0">
                                      {food.portionGrams}g
                                    </span>
                                  )}
                                </div>
                                {food.prepState && food.prepState !== 'cru' && (
                                  <span className="text-[10px] text-[#B8AFC4] block mt-0.5 capitalize">
                                    Preparo: {food.prepState}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                              <div className="text-right font-mono-numbers">
                                <span className="text-xs sm:text-sm font-bold text-[#EC4899]">
                                  {food.calories} kcal
                                </span>
                              </div>

                              <button
                                onClick={() =>
                                  onDeleteFoodItem
                                    ? onDeleteFoodItem(logId, food.id)
                                    : onDeleteMeal(logId)
                                }
                                title={`Remover ${foodDisplayName}`}
                                className="p-1.5 rounded-lg text-[#B8AFC4] hover:text-rose-400 hover:bg-[#18121F] transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            );
          })}
          <button
            onClick={addMeal}
            className="w-full py-2.5 rounded-2xl border border-dashed border-[#33263F] text-[#B8AFC4] hover:text-[#A78BFA] hover:border-[#8B5CF6]/50 text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Adicionar refeição
          </button>
        </div>
      </div>
    </div>
  );
};
