import React, { useState } from 'react';
import {
  Heart,
  Sparkles,
  Flame,
  Check,
  Plus,
  Minus,
  Edit3,
} from 'lucide-react';
import { UserProfile, AppState } from '../types';

interface PerfilMarianaProps {
  user: UserProfile;
  appState: AppState;
  onUpdateProfile: (updated: UserProfile) => void;
  onExportData: () => void;
  onImportData: (data: AppState) => void;
}

export const PerfilMariana: React.FC<PerfilMarianaProps> = ({
  user,
  onUpdateProfile,
}) => {
  const [formData, setFormData] = useState<UserProfile>({ ...user });
  const [isSavedToast, setIsSavedToast] = useState(false);
  const [isDirectEdit, setIsDirectEdit] = useState(false);

  const handleSaveProfile = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onUpdateProfile(formData);
    setIsSavedToast(true);
    setTimeout(() => setIsSavedToast(false), 3000);
  };

  const handleAdjustCalories = (delta: number) => {
    setFormData((prev) => {
      const nextVal = Math.max(800, Math.min(4500, (prev.calorieGoal || 1850) + delta));
      return { ...prev, calorieGoal: nextVal };
    });
  };

  return (
    <div className="space-y-6 pb-28 lg:pb-16 max-w-2xl mx-auto px-2 sm:px-0">
      {/* Toast Notification */}
      {isSavedToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-[#6D28D9] via-[#8B5CF6] to-[#EC4899] text-white text-xs font-bold flex items-center gap-3 shadow-2xl shadow-[#EC4899]/40 border border-white/20 animate-in fade-in slide-in-from-top-4 duration-300">
          <Sparkles className="w-4 h-4 text-pink-200 animate-spin" />
          <span>Salvo com sucesso, Mari! 💜🌸</span>
          <Check className="w-4 h-4 text-emerald-200 ml-1" />
        </div>
      )}

      {/* Hero Profile Card - Delicate, Romantic & Warm */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#18121F] via-[#120D1A] to-[#09070D] border border-[#33263F] p-6 sm:p-8 shadow-xl text-center group hover:border-[#8B5CF6]/40 transition-all duration-300">
        {/* Ambient Decorative Glows */}
        <div className="absolute -top-16 -left-16 w-48 h-48 bg-[#8B5CF6]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-[#EC4899]/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center">
          {/* Avatar with Shimmering Gradient Ring & Romantic Badges */}
          <div className="relative mb-4">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full p-[3px] bg-gradient-to-tr from-[#6D28D9] via-[#EC4899] to-[#A78BFA] shadow-xl shadow-[#8B5CF6]/25">
              <div className="w-full h-full rounded-full overflow-hidden bg-[#100C16] border-2 border-[#18121F]">
                <img
                  src="/src/assets/images/mariana_avatar_rose_1794179957939.jpg"
                  alt="Mari"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
            </div>

            {/* Floral Badge (Top Left) */}
            <div className="absolute -top-1 -left-1 w-7 h-7 rounded-full bg-[#18121F] border border-[#A78BFA]/50 flex items-center justify-center text-xs shadow-md shadow-black/40">
              🌸
            </div>

            {/* Heart Badge (Bottom Right) */}
            <div className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-[#18121F] border border-[#EC4899] text-[#EC4899] shadow-md shadow-[#EC4899]/30">
              <Heart className="w-3.5 h-3.5 fill-[#EC4899]" />
            </div>
          </div>

          {/* Name & Subtitle */}
          <div className="inline-flex items-center gap-2">
            <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-[#F8F5FC] tracking-tight">
              Mari
            </h1>
            <span className="text-xl">🌸</span>
          </div>
        </div>
      </div>

      {/* Interactive Calorie Goal Card - Charming Stepper & Vibes */}
      <form onSubmit={handleSaveProfile} className="space-y-6">
        <div className="rounded-3xl bg-gradient-to-br from-[#18121F] to-[#120D1A] border border-[#33263F] p-6 sm:p-7 space-y-5 shadow-xl">
          {/* Section Title */}
          <div className="flex items-center justify-between pb-3 border-b border-[#33263F]/60">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-[#EC4899]/15 border border-[#EC4899]/30 text-[#EC4899]">
                <Flame className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#A78BFA]">
                  Minha Meta Calórica Diária
                </h2>
                <p className="text-[11px] text-[#B8AFC4]">
                  O seu guia suave para acompanhar as refeições
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsDirectEdit(!isDirectEdit)}
              className="px-2.5 py-1 rounded-xl bg-[#100C16] border border-[#33263F] text-[11px] text-[#B8AFC4] hover:text-[#F8F5FC] hover:border-[#8B5CF6] flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Digitar valor manualmente"
            >
              <Edit3 className="w-3 h-3 text-[#A78BFA]" />
              <span>{isDirectEdit ? 'Usar botões' : 'Editar número'}</span>
            </button>
          </div>

          {/* Stepper Controller */}
          <div className="py-2 flex flex-col items-center">
            {isDirectEdit ? (
              <div className="flex items-center justify-center gap-3 w-full max-w-xs">
                <input
                  type="number"
                  min="800"
                  max="4500"
                  value={formData.calorieGoal}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      calorieGoal: parseInt(e.target.value) || 0,
                    })
                  }
                  autoFocus
                  className="w-40 text-center py-2 px-3 rounded-2xl bg-[#100C16] border-2 border-[#8B5CF6] text-3xl font-extrabold text-[#F8F5FC] focus:outline-none shadow-inner [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-base font-bold text-[#EC4899]">kcal</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 sm:gap-6 w-full">
                {/* Minus 50 */}
                <button
                  type="button"
                  onClick={() => handleAdjustCalories(-50)}
                  className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#100C16] border border-[#33263F] hover:border-[#EC4899]/70 text-[#B8AFC4] hover:text-[#EC4899] hover:bg-[#EC4899]/10 active:scale-90 flex items-center justify-center transition-all cursor-pointer shadow-md shrink-0"
                  title="Diminuir 50 kcal"
                >
                  <Minus className="w-5 h-5" />
                </button>

                {/* Big Display */}
                <div className="text-center px-3 sm:px-4 py-2 rounded-2xl bg-[#100C16]/80 border border-[#33263F] min-w-[130px] sm:min-w-[170px] shadow-inner">
                  <div className="flex items-baseline justify-center gap-1.5">
                    <span className="text-2xl sm:text-4xl font-black text-[#F8F5FC] tracking-tight">
                      {formData.calorieGoal.toLocaleString('pt-BR')}
                    </span>
                    <span className="text-xs font-bold text-[#EC4899] uppercase tracking-wider">
                      kcal
                    </span>
                  </div>
                  <span className="text-[10px] text-[#A78BFA] font-medium">
                    meta por dia
                  </span>
                </div>

                {/* Plus 50 */}
                <button
                  type="button"
                  onClick={() => handleAdjustCalories(50)}
                  className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#100C16] border border-[#33263F] hover:border-[#8B5CF6]/70 text-[#B8AFC4] hover:text-[#8B5CF6] hover:bg-[#8B5CF6]/10 active:scale-90 flex items-center justify-center transition-all cursor-pointer shadow-md shrink-0"
                  title="Aumentar 50 kcal"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Quick Adjustment Pills */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 mt-3">
              <button
                type="button"
                onClick={() => handleAdjustCalories(-100)}
                className="px-2.5 py-1 rounded-xl bg-[#100C16] border border-[#33263F] text-[10px] font-semibold text-[#B8AFC4] hover:text-[#F8F5FC] hover:border-[#A78BFA] transition-colors cursor-pointer"
              >
                -100
              </button>
              <button
                type="button"
                onClick={() => handleAdjustCalories(-25)}
                className="px-2.5 py-1 rounded-xl bg-[#100C16] border border-[#33263F] text-[10px] font-semibold text-[#B8AFC4] hover:text-[#F8F5FC] hover:border-[#A78BFA] transition-colors cursor-pointer"
              >
                -25
              </button>
              <button
                type="button"
                onClick={() => handleAdjustCalories(25)}
                className="px-2.5 py-1 rounded-xl bg-[#100C16] border border-[#33263F] text-[10px] font-semibold text-[#B8AFC4] hover:text-[#F8F5FC] hover:border-[#A78BFA] transition-colors cursor-pointer"
              >
                +25
              </button>
              <button
                type="button"
                onClick={() => handleAdjustCalories(100)}
                className="px-2.5 py-1 rounded-xl bg-[#100C16] border border-[#33263F] text-[10px] font-semibold text-[#B8AFC4] hover:text-[#F8F5FC] hover:border-[#A78BFA] transition-colors cursor-pointer"
              >
                +100
              </button>
            </div>
          </div>
        </div>

        {/* Primary Save Action Button */}
        <div className="pt-2">
          <button
            type="submit"
            className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-[#6D28D9] via-[#8B5CF6] to-[#EC4899] hover:from-[#7C3AED] hover:via-[#9333EA] hover:to-[#F472B6] text-white text-sm font-bold shadow-xl shadow-[#EC4899]/25 hover:shadow-[#EC4899]/40 transition-all duration-300 active:scale-[0.98] flex items-center justify-center gap-2.5 cursor-pointer group"
          >
            <Heart className="w-4 h-4 fill-white group-hover:scale-125 transition-transform" />
            <span>Salvar Preferências</span>
          </button>
        </div>
      </form>
    </div>
  );
};
