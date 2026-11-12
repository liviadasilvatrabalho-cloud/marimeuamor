import React, { useState } from 'react';
import {
  History,
  Calendar,
  Trash2,
  ChevronRight,
  TrendingUp,
  Flame,
  Dna,
  Wheat,
  Droplet,
  Filter,
} from 'lucide-react';
import { AppState, MealLog } from '../types';

interface HistoricoNutricionalProps {
  appState: AppState;
  onDeleteHistoryItem: (id: string) => void;
}

export const HistoricoNutricional: React.FC<HistoricoNutricionalProps> = ({
  appState,
  onDeleteHistoryItem,
}) => {
  const [viewMode, setViewMode] = useState<'diario' | 'semanal' | 'mensal'>('diario');
  const [selectedLog, setSelectedLog] = useState<MealLog | null>(null);

  // Combine todayLogs with historyLogs
  const allLogs: MealLog[] = [...appState.todayLogs, ...appState.historyLogs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Group by date
  const logsByDate: Record<string, MealLog[]> = {};
  allLogs.forEach((log) => {
    const d = log.date;
    if (!logsByDate[d]) logsByDate[d] = [];
    logsByDate[d].push(log);
  });

  // Calculate totals and averages
  const totalDaysTracked = Object.keys(logsByDate).length || 1;
  const totalRecordedCalories = allLogs.reduce((acc, l) => acc + l.totalCalories, 0);
  const avgDailyCalories = Math.round(totalRecordedCalories / totalDaysTracked);
  const avgDailyProtein = (allLogs.reduce((acc, l) => acc + l.totalProtein, 0) / totalDaysTracked).toFixed(1);
  const avgDailyCarbs = (allLogs.reduce((acc, l) => acc + l.totalCarbs, 0) / totalDaysTracked).toFixed(1);
  const avgDailyFat = (allLogs.reduce((acc, l) => acc + l.totalFat, 0) / totalDaysTracked).toFixed(1);

  return (
    <div className="space-y-6 pb-20 lg:pb-12">
      {/* Header Banner */}
      <div className="rounded-3xl bg-gradient-to-br from-[#18121F] via-[#100C16] to-[#09070D] border border-[#33263F] p-4 sm:p-6 lg:p-8">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#8B5CF6] uppercase tracking-wider mb-1">
          <History className="w-4 h-4" />
          <span>Histórico Pessoal de Mariana</span>
        </div>
        <h1 className="font-heading text-xl sm:text-2xl lg:text-3xl font-bold text-[#F8F5FC]">
          Registro Nutricional Permanente 💜
        </h1>
        <p className="text-xs sm:text-sm text-[#B8AFC4] mt-1 max-w-xl">
          Acompanhe sua consistência ao longo dos dias, consulte refeições antigas e mantenha o controle da sua saúde.
        </p>
      </div>

      {/* Averages Summary Cards (NO PROGRESS BARS) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div className="p-4 rounded-2xl bg-[#18121F] border border-[#33263F] text-center">
          <span className="text-xs text-[#B8AFC4] block uppercase font-medium tracking-wider">
            Média Diária de Calorias
          </span>
          <div className="mt-2 flex items-baseline justify-center gap-1 font-mono-numbers">
            <span className="text-2xl sm:text-3xl font-bold text-[#EC4899]">{avgDailyCalories}</span>
            <span className="text-xs text-[#B8AFC4]">kcal/dia</span>
          </div>
          <span className="text-[11px] text-[#A78BFA] mt-1 block">
            Meta diária da Mari: {appState.user.calorieGoal} kcal
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-[#18121F] border border-[#33263F] text-center">
          <span className="text-xs text-[#B8AFC4] block uppercase font-medium tracking-wider">
            Total de Registros
          </span>
          <div className="mt-2 flex items-baseline justify-center gap-1 font-mono-numbers">
            <span className="text-2xl sm:text-3xl font-bold text-[#8B5CF6]">{allLogs.length}</span>
            <span className="text-xs text-[#B8AFC4]">refeições</span>
          </div>
          <span className="text-[11px] text-[#B8AFC4] mt-1 block">
            Em {totalDaysTracked} dia(s) com registros salvos
          </span>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={() => setViewMode('diario')}
          className={`whitespace-nowrap px-3 sm:px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
            viewMode === 'diario'
              ? 'bg-[#8B5CF6] text-white'
              : 'bg-[#18121F] text-[#B8AFC4] border border-[#33263F]'
          }`}
        >
          Visualização Diária
        </button>
        <button
          onClick={() => setViewMode('semanal')}
          className={`whitespace-nowrap px-3 sm:px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
            viewMode === 'semanal'
              ? 'bg-[#8B5CF6] text-white'
              : 'bg-[#18121F] text-[#B8AFC4] border border-[#33263F]'
          }`}
        >
          Resumo Semanal
        </button>
        <button
          onClick={() => setViewMode('mensal')}
          className={`whitespace-nowrap px-3 sm:px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
            viewMode === 'mensal'
              ? 'bg-[#8B5CF6] text-white'
              : 'bg-[#18121F] text-[#B8AFC4] border border-[#33263F]'
          }`}
        >
          Visão Mensal
        </button>
      </div>

      {/* Date-grouped Meal Logs */}
      <div className="space-y-6">
        {Object.entries(logsByDate).map(([dateStr, logs]) => {
          const dayTotalCalories = logs.reduce((acc, l) => acc + l.totalCalories, 0);
          const dayTotalProtein = logs.reduce((acc, l) => acc + l.totalProtein, 0);
          const dayTotalCarbs = logs.reduce((acc, l) => acc + l.totalCarbs, 0);
          const dayTotalFat = logs.reduce((acc, l) => acc + l.totalFat, 0);

          const formattedDay = new Intl.DateTimeFormat('pt-BR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          }).format(new Date(`${dateStr}T12:00:00`));

          return (
            <div
              key={dateStr}
              className="rounded-3xl bg-[#18121F] border border-[#33263F] p-5 space-y-4"
            >
              {/* Day Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#33263F] gap-2">
                <div>
                  <h3 className="text-sm font-bold text-[#F8F5FC] capitalize">
                    {formattedDay}
                  </h3>
                  <span className="text-xs text-[#B8AFC4]">
                    {logs.length} refeições registradas
                  </span>
                </div>

                <div className="text-left sm:text-right font-mono-numbers">
                  <span className="text-sm font-bold text-[#EC4899]">
                    {dayTotalCalories} kcal
                  </span>
                </div>
              </div>

              {/* Logs for this day - NO FOOD NAMES DISPLAYED */}
              <div className="space-y-2">
                {logs.map((log, logIdx) => {
                  const logGrams = log.foods.reduce((acc, f) => acc + (f.portionGrams || 0), 0);

                  return (
                    <div
                      key={log.id}
                      className="p-3.5 rounded-xl bg-[#100C16] border border-[#33263F] flex items-center justify-between gap-3"
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-xs font-bold text-[#A78BFA] px-2 py-0.5 rounded-md bg-[#18121F] border border-[#33263F] mt-0.5">
                          #{logIdx + 1}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-[#EC4899] font-bold uppercase tracking-wider">
                              {log.mealType === 'cafe'
                                ? 'Café da Manhã'
                                : log.mealType === 'almoco'
                                ? 'Almoço'
                                : log.mealType === 'lanche'
                                ? 'Lanche'
                                : 'Jantar'}
                            </span>
                            {logGrams > 0 && (
                              <span className="font-mono-numbers text-[#A78BFA] text-[11px] font-medium">
                                · {logGrams}g total
                              </span>
                            )}
                          </div>

                          <div className="space-y-1 mt-1">
                            {log.foods.map((food, fIdx) => (
                              <div
                                key={food.id || fIdx}
                                className="flex items-center gap-2 text-xs text-[#F8F5FC]"
                              >
                                <span className="font-semibold">
                                  {food.name && food.name !== 'Porção Registrada'
                                    ? food.name
                                    : `Item #${fIdx + 1}`}
                                </span>
                                {food.portionGrams > 0 && (
                                  <span className="text-[#A78BFA] text-[10px] font-mono-numbers">
                                    ({food.portionGrams}g)
                                  </span>
                                )}
                                <span className="text-[#EC4899] text-[10px] font-mono-numbers">
                                  · {food.calories} kcal
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 font-mono-numbers">
                        <div className="text-right">
                          <span className="text-xs font-bold text-[#EC4899]">
                            {log.totalCalories} kcal
                          </span>
                        </div>

                        <button
                          onClick={() => onDeleteHistoryItem(log.id)}
                          className="p-1.5 rounded-lg text-[#B8AFC4] hover:text-rose-400 transition-colors cursor-pointer"
                          title="Excluir do histórico"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
