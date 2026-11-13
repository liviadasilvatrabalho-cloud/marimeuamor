import React, { useState } from 'react';
import {
  Heart,
  Sparkles,
  Flame,
  Check,
  Plus,
  Minus,
  User,
  ShieldCheck,
} from 'lucide-react';
import { UserProfile, AppState } from '../types';

interface PerfilMarianaProps {
  user: UserProfile;
  appState: AppState;
  onUpdateProfile: (updated: UserProfile) => void;
  onExportData?: () => void;
  onImportData?: (data: AppState) => void;
}

export const PerfilMariana: React.FC<PerfilMarianaProps> = ({
  user,
  onUpdateProfile,
}) => {
  const [userName, setUserName] = useState<string>('Mari');
  const [calorieGoal, setCalorieGoal] = useState<number>(user.calorieGoal || 2000);
  const [isSavedToast, setIsSavedToast] = useState(false);

  const handleSaveProfile = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedName = userName.trim() || 'Mari';
    const validGoal = Math.max(500, Math.min(8000, calorieGoal || 2000));

    const updatedUser: UserProfile = {
      ...user,
      name: trimmedName,
      calorieGoal: validGoal,
    };

    onUpdateProfile(updatedUser);
    setIsSavedToast(true);
    setTimeout(() => setIsSavedToast(false), 3000);
  };

  const handleAdjustCalories = (delta: number) => {
    setCalorieGoal((prev) => Math.max(500, Math.min(8000, prev + delta)));
  };

  return (
    <div className="space-y-5 pb-28 lg:pb-16 max-w-xl mx-auto px-2 sm:px-0 animate-fadeIn">
      {/* Toast Notification */}
      {isSavedToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-[#6D28D9] via-[#8B5CF6] to-[#EC4899] text-white text-xs font-bold flex items-center gap-3 shadow-2xl shadow-[#EC4899]/40 border border-white/20 animate-in fade-in slide-in-from-top-4 duration-300">
          <Sparkles className="w-4 h-4 text-pink-200 animate-spin" />
          <span>Perfil da Mari atualizado com sucesso! 💜🌸</span>
          <Check className="w-4 h-4 text-emerald-200 ml-1" />
        </div>
      )}

      {/* Hero Welcome Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#18121F] via-[#120D1A] to-[#09070D] border border-[#33263F] p-6 text-center shadow-xl">
        <div className="absolute -top-12 -left-12 w-40 h-40 bg-[#8B5CF6]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -right-12 w-40 h-40 bg-[#EC4899]/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center">
          <div className="w-16 h-16 rounded-full p-1 bg-gradient-to-tr from-[#6D28D9] via-[#EC4899] to-[#A78BFA] shadow-lg shadow-[#8B5CF6]/30 mb-3 flex items-center justify-center">
            <div className="w-full h-full rounded-full bg-[#100C16] flex items-center justify-center text-2xl font-bold text-[#F472B6]">
              M
            </div>
          </div>

          <h1 className="font-heading text-xl sm:text-2xl font-bold text-[#F8F5FC]">
            Perfil da Mari 🌸
          </h1>
          <p className="text-xs text-[#B8AFC4] mt-1">
            Espaço pessoal da Mari amore: meta diária de calorias e acompanhamento
          </p>
        </div>
      </div>

      {/* Formulário com EXCLUSIVAMENTE duas opções editáveis */}
      <form onSubmit={handleSaveProfile} className="space-y-4">
        {/* OPÇÃO 1: NOME DA USUÁRIA */}
        <div className="rounded-3xl bg-[#140E1B] border border-[#322046] p-5 sm:p-6 space-y-3 shadow-lg">
          <div className="flex items-center gap-2.5 pb-2 border-b border-[#2D1B3E]">
            <div className="p-2 rounded-xl bg-[#8B5CF6]/15 text-[#A78BFA] border border-[#8B5CF6]/30">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#A78BFA]">
                Nome no Aplicativo
              </h2>
              <p className="text-[11px] text-[#B8AFC4]">
                Nome exibido nas saudações e no diário
              </p>
            </div>
          </div>

          <div className="pt-1">
            <input
              type="text"
              required
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Mari"
              className="w-full px-4 py-3 rounded-2xl bg-[#1A1224] border border-[#322046] focus:border-[#8B5CF6] text-sm font-bold text-[#FAF8FC] placeholder-[#7B6E8F] focus:outline-none transition-colors"
            />
          </div>
        </div>

        {/* OPÇÃO 2: META DIÁRIA DE CALORIAS */}
        <div className="rounded-3xl bg-[#140E1B] border border-[#322046] p-5 sm:p-6 space-y-4 shadow-lg">
          <div className="flex items-center gap-2.5 pb-2 border-b border-[#2D1B3E]">
            <div className="p-2 rounded-xl bg-pink-500/15 text-[#EC4899] border border-pink-500/30">
              <Flame className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#EC4899]">
                2. Meta Diária de Calorias
              </h2>
              <p className="text-[11px] text-[#B8AFC4]">
                Quantidade de calorias que você deseja consumir por dia
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center py-2 space-y-3">
            <div className="flex items-center justify-center gap-2 sm:gap-4 w-full">
              <button
                type="button"
                onClick={() => handleAdjustCalories(-50)}
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#1A1224] border border-[#322046] hover:border-pink-500/60 text-[#B8AFC4] hover:text-[#EC4899] active:scale-90 flex items-center justify-center transition-all cursor-pointer shadow-md shrink-0"
                title="Diminuir 50 kcal"
              >
                <Minus className="w-5 h-5" />
              </button>

              <div className="flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-[#181022] border border-[#322046] min-w-[160px] sm:min-w-[190px] shadow-inner">
                <input
                  type="number"
                  min="500"
                  max="8000"
                  value={calorieGoal}
                  onChange={(e) => setCalorieGoal(parseInt(e.target.value) || 0)}
                  className="w-24 text-center bg-transparent text-2xl sm:text-3xl font-black text-[#FAF8FC] font-mono-numbers focus:outline-none"
                />
                <span className="text-xs font-bold text-[#EC4899] uppercase tracking-wider">
                  kcal
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleAdjustCalories(50)}
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#1A1224] border border-[#322046] hover:border-[#8B5CF6]/70 text-[#B8AFC4] hover:text-[#A78BFA] active:scale-90 flex items-center justify-center transition-all cursor-pointer shadow-md shrink-0"
                title="Aumentar 50 kcal"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {/* Atalhos Rápidos */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => handleAdjustCalories(-100)}
                className="px-2.5 py-1 rounded-xl bg-[#1A1224] border border-[#322046] text-[10px] font-semibold text-[#B8AFC4] hover:text-[#FAF8FC] hover:border-[#A78BFA] transition-colors cursor-pointer"
              >
                -100 kcal
              </button>
              <button
                type="button"
                onClick={() => handleAdjustCalories(-25)}
                className="px-2.5 py-1 rounded-xl bg-[#1A1224] border border-[#322046] text-[10px] font-semibold text-[#B8AFC4] hover:text-[#FAF8FC] hover:border-[#A78BFA] transition-colors cursor-pointer"
              >
                -25 kcal
              </button>
              <button
                type="button"
                onClick={() => handleAdjustCalories(25)}
                className="px-2.5 py-1 rounded-xl bg-[#1A1224] border border-[#322046] text-[10px] font-semibold text-[#B8AFC4] hover:text-[#FAF8FC] hover:border-[#A78BFA] transition-colors cursor-pointer"
              >
                +25 kcal
              </button>
              <button
                type="button"
                onClick={() => handleAdjustCalories(100)}
                className="px-2.5 py-1 rounded-xl bg-[#1A1224] border border-[#322046] text-[10px] font-semibold text-[#B8AFC4] hover:text-[#FAF8FC] hover:border-[#A78BFA] transition-colors cursor-pointer"
              >
                +100 kcal
              </button>
            </div>
          </div>
        </div>

        {/* Botão de Salvar Alterações */}
        <div className="pt-2">
          <button
            type="submit"
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-[#6D28D9] via-[#8B5CF6] to-[#EC4899] hover:from-[#7C3AED] hover:via-[#9333EA] hover:to-[#F472B6] text-white text-xs sm:text-sm font-bold shadow-xl shadow-[#8B5CF6]/25 transition-all duration-300 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
          >
            <Heart className="w-4 h-4 fill-white" />
            <span>Salvar Alterações do Perfil</span>
          </button>
        </div>
      </form>
    </div>
  );
};
