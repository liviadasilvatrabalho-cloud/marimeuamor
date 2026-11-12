import React, { useState } from 'react';
import {
  CalendarDays,
  Plus,
  Trash2,
  Utensils,
  BookOpen,
  CheckCircle2,
  ListChecks,
  ShoppingBag,
  Sparkles,
  ChevronRight,
  X,
} from 'lucide-react';
import { WeeklyPlan, DayOfWeek, MealType, Marmita, Recipe, WeeklyPlanItem } from '../types';

interface PlanejamentoSemanalProps {
  weeklyPlan: WeeklyPlan;
  marmitas: Marmita[];
  recipes: Recipe[];
  onUpdateWeeklyPlan: (plan: WeeklyPlan) => void;
}

const DAYS_OF_WEEK: { key: DayOfWeek; label: string; short: string }[] = [
  { key: 'segunda', label: 'Segunda-feira', short: 'Seg' },
  { key: 'terca', label: 'Terça-feira', short: 'Ter' },
  { key: 'quarta', label: 'Quarta-feira', short: 'Qua' },
  { key: 'quinta', label: 'Quinta-feira', short: 'Qui' },
  { key: 'sexta', label: 'Sexta-feira', short: 'Sex' },
  { key: 'sabado', label: 'Sábado', short: 'Sáb' },
  { key: 'domingo', label: 'Domingo', short: 'Dom' },
];

export const PlanejamentoSemanal: React.FC<PlanejamentoSemanalProps> = ({
  weeklyPlan,
  marmitas,
  recipes,
  onUpdateWeeklyPlan,
}) => {
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('segunda');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [targetMealType, setTargetMealType] = useState<MealType>('almoco');
  const [selectedMarmitaId, setSelectedMarmitaId] = useState<string>(marmitas[0]?.id || '');
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>('');
  const [sourceChoice, setSourceChoice] = useState<'marmita' | 'receita'>('marmita');

  // Grocery list modal state
  const [isGroceryOpen, setIsGroceryOpen] = useState(false);
  const [checkedGroceries, setCheckedGroceries] = useState<Record<string, boolean>>({});

  const dayItems = weeklyPlan[selectedDay] || [];

  const handleAddItemToDay = () => {
    let newItem: WeeklyPlanItem | null = null;

    if (sourceChoice === 'marmita') {
      const marmita = marmitas.find((m) => m.id === selectedMarmitaId);
      if (marmita) {
        newItem = {
          id: `plan-item-${Date.now()}`,
          mealType: targetMealType,
          title: marmita.name,
          marmitaId: marmita.id,
          calories: marmita.totalCalories,
          protein: marmita.totalProtein,
          carbs: marmita.totalCarbs,
          fat: marmita.totalFat,
        };
      }
    } else {
      const recipe = recipes.find((r) => r.id === selectedRecipeId);
      if (recipe) {
        newItem = {
          id: `plan-item-${Date.now()}`,
          mealType: targetMealType,
          title: recipe.title,
          recipeId: recipe.id,
          calories: recipe.caloriesPerServing,
          protein: recipe.proteinPerServing,
          carbs: recipe.carbsPerServing,
          fat: recipe.fatPerServing,
        };
      }
    }

    if (newItem) {
      const updatedDayList = [...(weeklyPlan[selectedDay] || []), newItem];
      onUpdateWeeklyPlan({
        ...weeklyPlan,
        [selectedDay]: updatedDayList,
      });
      setIsAddModalOpen(false);
    }
  };

  const handleRemoveItem = (itemId: string) => {
    const updated = (weeklyPlan[selectedDay] || []).filter((it) => it.id !== itemId);
    onUpdateWeeklyPlan({
      ...weeklyPlan,
      [selectedDay]: updated,
    });
  };

  // Compile automated grocery list from weekly planned marmitas and recipes
  const generateGroceryList = () => {
    const ingredientsMap: Record<string, { amount: string; count: number }> = {};

    Object.values(weeklyPlan).forEach((dayList) => {
      dayList.forEach((planItem) => {
        if (planItem.marmitaId) {
          const marmita = marmitas.find((m) => m.id === planItem.marmitaId);
          if (marmita) {
            marmita.items.forEach((it) => {
              const current = ingredientsMap[it.foodName] || { amount: `${it.weightGrams}g`, count: 0 };
              ingredientsMap[it.foodName] = {
                amount: `${it.weightGrams}g por refeição`,
                count: current.count + 1,
              };
            });
          }
        } else if (planItem.recipeId) {
          const recipe = recipes.find((r) => r.id === planItem.recipeId);
          if (recipe) {
            recipe.ingredients.forEach((ing) => {
              const current = ingredientsMap[ing.name] || { amount: ing.amount, count: 0 };
              ingredientsMap[ing.name] = {
                amount: ing.amount,
                count: current.count + 1,
              };
            });
          }
        }
      });
    });

    return Object.entries(ingredientsMap).map(([name, info]) => ({
      name,
      amount: info.amount,
      occurrences: info.count,
    }));
  };

  const groceryList = generateGroceryList();

  return (
    <div className="space-y-6 pb-20 lg:pb-12">
      {/* Header Banner */}
      <div className="rounded-3xl bg-gradient-to-br from-[#18121F] via-[#100C16] to-[#09070D] border border-[#33263F] p-4 sm:p-6 lg:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#8B5CF6] uppercase tracking-wider mb-1">
            <CalendarDays className="w-4 h-4" />
            <span>Organização Semanal</span>
          </div>
          <h1 className="font-heading text-xl sm:text-2xl lg:text-3xl font-bold text-[#F8F5FC]">
            Planejamento dos 7 Dias 💜
          </h1>
          <p className="text-xs sm:text-sm text-[#B8AFC4] mt-1 max-w-xl">
            Atribua suas marmitas e receitas aos dias da semana para uma alimentação tranquila, sem surpresas e com carinho.
          </p>
        </div>

        <button
          onClick={() => setIsGroceryOpen(true)}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-[#18121F] hover:bg-[#22192C] text-[#A78BFA] border border-[#8B5CF6]/40 text-xs font-bold transition-colors cursor-pointer shrink-0"
        >
          <ShoppingBag className="w-4 h-4 text-[#EC4899]" />
          <span>Lista de Compras ({groceryList.length})</span>
        </button>
      </div>

      {/* 7 Days Responsive Selector: Smooth horizontal scroll on mobile, 7-col grid on desktop */}
      <div className="flex sm:grid sm:grid-cols-7 gap-2 overflow-x-auto pb-2 no-scrollbar">
        {DAYS_OF_WEEK.map((day) => {
          const itemsCount = (weeklyPlan[day.key] || []).length;
          const isSelected = selectedDay === day.key;

          return (
            <button
              key={day.key}
              onClick={() => setSelectedDay(day.key)}
              className={`min-w-[82px] sm:min-w-0 flex-1 shrink-0 p-2.5 sm:p-3 rounded-2xl text-center border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-gradient-to-b from-[#6D28D9]/40 to-[#18121F] border-[#8B5CF6] text-white shadow-lg shadow-[#8B5CF6]/20'
                  : 'bg-[#18121F] border-[#33263F] text-[#B8AFC4] hover:text-[#F8F5FC] hover:border-[#8B5CF6]/40'
              }`}
            >
              <span className="text-[10px] sm:text-[11px] font-semibold block uppercase tracking-wider">
                {day.short}
              </span>
              <span className="text-xs sm:text-sm font-bold block mt-0.5 truncate">
                {day.label.split('-')[0]}
              </span>
              <span className="text-[10px] text-[#A78BFA] block mt-0.5">
                {itemsCount} {itemsCount === 1 ? 'refeição' : 'refeições'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected Day View */}
      <div className="rounded-3xl bg-[#18121F] border border-[#33263F] p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-[#33263F] pb-4">
          <div>
            <h2 className="text-lg font-bold text-[#F8F5FC] capitalize">
              {DAYS_OF_WEEK.find((d) => d.key === selectedDay)?.label}
            </h2>
            <p className="text-xs text-[#B8AFC4]">
              {dayItems.length} refeições planejadas para este dia
            </p>
          </div>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] text-white text-xs font-bold shadow-md shadow-[#8B5CF6]/30 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar ao Dia</span>
          </button>
        </div>

        {dayItems.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#B8AFC4] space-y-2">
            <Utensils className="w-8 h-8 mx-auto text-[#A78BFA] opacity-50" />
            <p>Nenhuma marmita ou receita planejada para este dia.</p>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="text-[#A78BFA] hover:text-[#F8F5FC] font-semibold"
            >
              + Adicionar refeição planejada
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {dayItems.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-2xl bg-[#100C16] border border-[#33263F] flex items-center justify-between gap-4"
              >
                <div>
                  <span className="text-[10px] text-[#EC4899] font-bold uppercase tracking-wider block">
                    {item.mealType === 'cafe'
                      ? 'Café da Manhã'
                      : item.mealType === 'almoco'
                      ? 'Almoço'
                      : item.mealType === 'lanche'
                      ? 'Lanche'
                      : 'Jantar'}
                  </span>
                  <h4 className="text-sm font-semibold text-[#F8F5FC] mt-0.5">{item.title}</h4>
                  <div className="flex items-center gap-2 text-xs text-[#B8AFC4] font-mono-numbers mt-1">
                    <span className="text-[#A78BFA] font-bold">{item.calories} kcal</span>
                    <span>·</span>
                    <span>P: {item.protein}g</span>
                    <span>·</span>
                    <span>C: {item.carbs}g</span>
                    <span>·</span>
                    <span>G: {item.fat}g</span>
                  </div>
                </div>

                <button
                  onClick={() => handleRemoveItem(item.id)}
                  className="p-2 rounded-xl text-[#B8AFC4] hover:text-rose-400 hover:bg-[#18121F] transition-colors"
                  title="Remover do planejamento"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ADD ITEM TO DAY MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-[#18121F] border border-[#33263F] rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#33263F]">
              <h3 className="text-base font-bold text-[#F8F5FC]">
                Adicionar ao Planejamento
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 text-[#B8AFC4] hover:text-[#F8F5FC]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Meal Slot */}
            <div className="space-y-1">
              <label className="text-xs text-[#B8AFC4]">Horário / Refeição:</label>
              <div className="grid grid-cols-4 gap-1.5">
                {(['cafe', 'almoco', 'lanche', 'jantar'] as MealType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setTargetMealType(type)}
                    className={`py-1.5 text-center rounded-xl text-xs font-semibold ${
                      targetMealType === type
                        ? 'bg-[#8B5CF6] text-white'
                        : 'bg-[#100C16] text-[#B8AFC4] border border-[#33263F]'
                    }`}
                  >
                    {type === 'cafe' ? 'Café' : type === 'almoco' ? 'Almoço' : type === 'lanche' ? 'Lanche' : 'Jantar'}
                  </button>
                ))}
              </div>
            </div>

            {/* Source switch */}
            <div className="flex gap-2">
              <button
                onClick={() => setSourceChoice('marmita')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold ${
                  sourceChoice === 'marmita'
                    ? 'bg-[#8B5CF6] text-white'
                    : 'bg-[#100C16] text-[#B8AFC4] border border-[#33263F]'
                }`}
              >
                Das Minhas Marmitas
              </button>
              <button
                onClick={() => setSourceChoice('receita')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold ${
                  sourceChoice === 'receita'
                    ? 'bg-[#8B5CF6] text-white'
                    : 'bg-[#100C16] text-[#B8AFC4] border border-[#33263F]'
                }`}
              >
                Do Livro de Receitas
              </button>
            </div>

            {/* Selection */}
            {sourceChoice === 'marmita' ? (
              <div className="space-y-1">
                <label className="text-xs text-[#B8AFC4]">Escolha a Marmita:</label>
                <select
                  value={selectedMarmitaId}
                  onChange={(e) => setSelectedMarmitaId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#100C16] border border-[#33263F] text-xs text-[#F8F5FC]"
                >
                  {marmitas.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.totalCalories} kcal)
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs text-[#B8AFC4]">Escolha a Receita:</label>
                <select
                  value={selectedRecipeId}
                  onChange={(e) => setSelectedRecipeId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#100C16] border border-[#33263F] text-xs text-[#F8F5FC]"
                >
                  <option value="">Selecione uma receita...</option>
                  {recipes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title} ({r.caloriesPerServing} kcal)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#100C16] text-xs text-[#B8AFC4]"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddItemToDay}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#EC4899] text-white text-xs font-bold"
              >
                Salvar no Dia
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GROCERY LIST MODAL */}
      {isGroceryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-lg bg-[#18121F] border border-[#33263F] rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#33263F]">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-[#EC4899]" />
                <h3 className="text-base font-bold text-[#F8F5FC]">
                  Lista de Compras Automática da Semana
                </h3>
              </div>
              <button
                onClick={() => setIsGroceryOpen(false)}
                className="p-1.5 text-[#B8AFC4] hover:text-[#F8F5FC]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#B8AFC4]">
              Gerada a partir dos ingredientes de todas as marmitas e receitas planejadas para os 7 dias da semana:
            </p>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {groceryList.length === 0 ? (
                <p className="text-xs text-[#B8AFC4] py-4 text-center">
                  Adicione marmitas ao planejamento para gerar sua lista de supermercado.
                </p>
              ) : (
                groceryList.map((item, idx) => {
                  const isChecked = !!checkedGroceries[item.name];
                  return (
                    <div
                      key={idx}
                      onClick={() =>
                        setCheckedGroceries((prev) => ({
                          ...prev,
                          [item.name]: !isChecked,
                        }))
                      }
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-[#100C16] border-[#33263F] opacity-50'
                          : 'bg-[#100C16] border-[#33263F] hover:border-[#8B5CF6]/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-lg border flex items-center justify-center ${
                            isChecked
                              ? 'bg-[#8B5CF6] border-[#8B5CF6] text-white'
                              : 'border-[#33263F]'
                          }`}
                        >
                          {isChecked && <CheckCircle2 className="w-4 h-4" />}
                        </div>
                        <span
                          className={`text-xs font-semibold ${
                            isChecked ? 'line-through text-[#B8AFC4]' : 'text-[#F8F5FC]'
                          }`}
                        >
                          {item.name}
                        </span>
                      </div>
                      <span className="text-xs text-[#A78BFA] font-mono-numbers">
                        {item.amount} ({item.occurrences}x na semana)
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setIsGroceryOpen(false)}
                className="px-5 py-2 rounded-xl bg-[#8B5CF6] text-white text-xs font-bold"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
