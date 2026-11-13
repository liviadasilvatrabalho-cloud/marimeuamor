import React, { useState } from 'react';
import {
  Calendar,
  Camera,
  Scale,
  Calculator,
  CalendarDays,
  History,
  User,
  Barcode,
  Sparkles,
  Menu,
  X,
  Plus,
  LayoutGrid,
} from 'lucide-react';
import { UserProfile } from '../types';

export type TabId =
  | 'meu-dia'
  | 'scanner'
  | 'barcode'
  | 'sem-balanca'
  | 'calculadora'
  | 'planejamento'
  | 'historico'
  | 'perfil';

interface NavigationProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  user: UserProfile;
  onOpenQuickScan: () => void;
  onOpenRegistrarGramas?: () => void;
  onOpenAuth?: () => void;
  isLoggedIn?: boolean;
}

export const Header: React.FC<NavigationProps & { onOpenMobileMenu?: () => void }> = ({
  activeTab,
  onSelectTab,
  user,
  onOpenQuickScan,
  onOpenRegistrarGramas,
  onOpenAuth,
  isLoggedIn = false,
  onOpenMobileMenu,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-[#09070D]/95 backdrop-blur-md border-b border-[#33263F] px-3 sm:px-6 py-2.5 sm:py-3 transition-colors">
      <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-x-2 sm:gap-x-4 gap-y-0">
        {/* Zone 1: Single text wordmark */}
        <button
          onClick={() => onSelectTab('meu-dia')}
          className="flex items-center gap-2 sm:gap-2.5 text-left group focus:outline-none cursor-pointer min-w-0"
        >
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-tr from-[#6D28D9] via-[#8B5CF6] to-[#EC4899] p-0.5 flex items-center justify-center shadow-lg shadow-[#8B5CF6]/20 shrink-0">
            <div className="w-full h-full rounded-full bg-[#100C16] flex items-center justify-center">
              <span className="text-[11px] sm:text-xs font-bold text-[#A78BFA]">OLK</span>
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1 sm:gap-1.5">
              <span className="font-heading text-sm sm:text-lg font-bold tracking-tight text-[#F8F5FC] group-hover:text-[#A78BFA] transition-colors truncate">
                Our Little Kitchen
              </span>
              <span className="text-xs text-[#EC4899] shrink-0">💜</span>
            </div>
          </div>
        </button>

        {/* Zone 2: Navigation Links for Desktop — segunda linha, rolagem horizontal se não couber */}
        <nav className="hidden lg:flex w-full order-3 items-center justify-center gap-1 xl:gap-1.5 mt-2.5 pt-2.5 border-t border-[#33263F]/60 overflow-x-auto no-scrollbar">
          <button
            onClick={() => onSelectTab('meu-dia')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'meu-dia'
                ? 'bg-[#18121F] text-[#A78BFA] border border-[#8B5CF6]/50'
                : 'text-[#B8AFC4] hover:text-[#F8F5FC] hover:bg-[#18121F]/60'
            }`}
          >
            Meu Dia
          </button>
          <button
            onClick={() => onSelectTab('scanner')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'scanner'
                ? 'bg-[#18121F] text-[#A78BFA] border border-[#8B5CF6]/50'
                : 'text-[#B8AFC4] hover:text-[#F8F5FC] hover:bg-[#18121F]/60'
            }`}
          >
            <Camera className="w-3.5 h-3.5 text-[#EC4899]" />
            Scanner IA
          </button>
          <button
            onClick={() => onSelectTab('barcode')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'barcode'
                ? 'bg-[#18121F] text-[#A78BFA] border border-[#8B5CF6]/50'
                : 'text-[#B8AFC4] hover:text-[#F8F5FC] hover:bg-[#18121F]/60'
            }`}
          >
            <Barcode className="w-3.5 h-3.5 text-[#A78BFA]" />
            Código de Barras
          </button>
          <button
            onClick={() => onSelectTab('sem-balanca')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'sem-balanca'
                ? 'bg-[#18121F] text-[#A78BFA] border border-[#8B5CF6]/50'
                : 'text-[#B8AFC4] hover:text-[#F8F5FC] hover:bg-[#18121F]/60'
            }`}
          >
            Sem Balança
          </button>
          <button
            onClick={() => onSelectTab('calculadora')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'calculadora'
                ? 'bg-[#18121F] text-[#A78BFA] border border-[#8B5CF6]/50'
                : 'text-[#B8AFC4] hover:text-[#F8F5FC] hover:bg-[#18121F]/60'
            }`}
          >
            Calculadora
          </button>
          <button
            onClick={() => onSelectTab('planejamento')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'planejamento'
                ? 'bg-[#18121F] text-[#A78BFA] border border-[#8B5CF6]/50'
                : 'text-[#B8AFC4] hover:text-[#F8F5FC] hover:bg-[#18121F]/60'
            }`}
          >
            Planejamento
          </button>
          <button
            onClick={() => onSelectTab('historico')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'historico'
                ? 'bg-[#18121F] text-[#A78BFA] border border-[#8B5CF6]/50'
                : 'text-[#B8AFC4] hover:text-[#F8F5FC] hover:bg-[#18121F]/60'
            }`}
          >
            Histórico
          </button>
        </nav>

        {/* Zone 3: Actions & Profile */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 order-2">
          <button
            onClick={onOpenQuickScan}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] hover:from-[#7C3AED] hover:to-[#A78BFA] text-white text-xs font-semibold shadow-md shadow-[#8B5CF6]/25 transition-all active:scale-[0.98] cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5 text-white" />
            <span className="hidden md:inline">Fotografar Refeição</span>
            <span className="md:hidden">Foto</span>
          </button>

          {onOpenAuth && (
            <button
              onClick={onOpenAuth}
              className={`flex items-center gap-1.5 p-2 sm:px-2.5 sm:py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                isLoggedIn
                  ? 'bg-[#18121F] text-emerald-300 border-emerald-500/30 hover:border-emerald-400/60'
                  : 'bg-[#18121F] text-amber-200 border-amber-500/40 hover:border-amber-400'
              }`}
              title={isLoggedIn ? 'Sessão ativa' : 'Entrar'}
            >
              <User className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isLoggedIn ? 'Conta' : 'Entrar'}</span>
            </button>
          )}

          <button
            onClick={() => onSelectTab('perfil')}
            className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center border transition-all cursor-pointer shrink-0 ${
              activeTab === 'perfil'
                ? 'border-[#EC4899] ring-2 ring-[#EC4899]/30 bg-[#18121F]'
                : 'border-[#33263F] bg-[#18121F] hover:border-[#8B5CF6]'
            }`}
            title={`Perfil de ${user.name || 'Mari'}`}
          >
            <span className="text-xs font-bold text-[#F472B6]">
              {(user.name || 'Mari').charAt(0).toUpperCase()}
            </span>
          </button>

          {/* Mobile Menu Drawer Toggle Button */}
          {onOpenMobileMenu && (
            <button
              onClick={onOpenMobileMenu}
              className="lg:hidden w-8 h-8 rounded-xl bg-[#18121F] border border-[#33263F] hover:border-[#8B5CF6] text-[#B8AFC4] hover:text-[#F8F5FC] flex items-center justify-center transition-colors cursor-pointer shrink-0"
              aria-label="Abrir menu de navegação"
              title="Menu de seções"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export const MobileTabBar: React.FC<
  NavigationProps & { onOpenMenu: () => void }
> = ({
  activeTab,
  onSelectTab,
  user,
  onOpenQuickScan,
  onOpenMenu,
}) => {
  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#100C16]/95 backdrop-blur-lg border-t border-[#33263F] px-1 py-1 pb-safe shadow-2xl">
      <div className="grid grid-cols-2 items-center justify-around max-w-md mx-auto">
        {/* Tab 1: Meu Dia */}
        <button
          onClick={() => onSelectTab('meu-dia')}
          className={`flex flex-col items-center justify-center py-1 transition-colors min-h-[46px] cursor-pointer ${
            activeTab === 'meu-dia' ? 'text-[#A78BFA]' : 'text-[#B8AFC4] hover:text-[#F8F5FC]'
          }`}
        >
          <Calendar className="w-4 h-4 sm:w-5 sm:h-5" />
          <span className="text-[10px] font-medium tracking-tight mt-0.5">Meu Dia</span>
        </button>

        {/* Center Floating Action: Fotografar com IA */}
        <div className="flex items-center justify-center -mt-4">
          <button
            onClick={onOpenQuickScan}
            aria-label="Fotografar prato com IA"
            className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#6D28D9] via-[#8B5CF6] to-[#EC4899] text-white flex items-center justify-center shadow-lg shadow-[#8B5CF6]/40 active:scale-95 transition-transform cursor-pointer border-2 border-[#100C16]"
          >
            <Camera className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
};

export const MobileMenuDrawer: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  user: UserProfile;
  onOpenRegistrarGramas?: () => void;
  onOpenQuickScan?: () => void;
}> = ({
  isOpen,
  onClose,
  activeTab,
  onSelectTab,
  user,
  onOpenRegistrarGramas,
  onOpenQuickScan,
}) => {
  if (!isOpen) return null;

  const menuSections: {
    id: TabId;
    label: string;
    description: string;
    icon: React.ReactNode;
    color: string;
  }[] = [
    {
      id: 'meu-dia',
      label: 'Meu Dia',
      description: 'Metas diárias, calorias e refeições de hoje',
      icon: <Calendar className="w-4 h-4 text-[#A78BFA]" />,
      color: 'border-[#8B5CF6]/40',
    },
    {
      id: 'sem-balanca',
      label: 'Sem Balança',
      description: 'Conversões caseiras precisas pela TACO',
      icon: <Scale className="w-4 h-4 text-[#EC4899]" />,
      color: 'border-[#EC4899]/40',
    },
    {
      id: 'scanner',
      label: 'Scanner IA',
      description: 'Identificar refeição por foto com Gemini',
      icon: <Camera className="w-4 h-4 text-[#EC4899]" />,
      color: 'border-[#EC4899]/40',
    },
    {
      id: 'barcode',
      label: 'Código de Barras',
      description: 'Escanear embalagens e tabela nutricional',
      icon: <Barcode className="w-4 h-4 text-[#A78BFA]" />,
      color: 'border-[#8B5CF6]/40',
    },
    {
      id: 'calculadora',
      label: 'Calculadora TACO',
      description: 'Cálculo proporcional por grama exata',
      icon: <Calculator className="w-4 h-4 text-[#8B5CF6]" />,
      color: 'border-[#8B5CF6]/40',
    },
    {
      id: 'planejamento',
      label: 'Planejamento 7 Dias',
      description: 'Cardápio semanal e lista de compras automática',
      icon: <CalendarDays className="w-4 h-4 text-[#8B5CF6]" />,
      color: 'border-[#8B5CF6]/40',
    },
    {
      id: 'historico',
      label: 'Histórico Nutricional',
      description: 'Médias diárias e consistência ao longo do tempo',
      icon: <History className="w-4 h-4 text-[#A78BFA]" />,
      color: 'border-[#A78BFA]/40',
    },
    {
      id: 'perfil',
      label: `Perfil da ${user.name || 'Mari'} 🌸`,
      description: 'Meta calórica diária e preferências',
      icon: <User className="w-4 h-4 text-[#EC4899]" />,
      color: 'border-[#EC4899]/40',
    },
  ];

  const handleSelect = (tab: TabId) => {
    onSelectTab(tab);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end justify-center p-0 animate-in fade-in duration-200">
      {/* Backdrop click to dismiss */}
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-[#18121F] border-t border-[#33263F] rounded-t-3xl p-4 sm:p-5 shadow-2xl max-h-[85vh] overflow-y-auto no-scrollbar pb-safe space-y-4">
        {/* Drag handle / Close header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#33263F]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-[#6D28D9] to-[#EC4899] flex items-center justify-center text-white text-xs font-bold">
              OLK
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#F8F5FC]">
                Todas as Seções 💜
              </h2>
              <p className="text-[10px] text-[#B8AFC4]">
                Navegação rápida do aplicativo da Mari
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#B8AFC4] hover:text-[#F8F5FC] hover:bg-[#22192C] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick action shortcuts */}
        <div className="grid grid-cols-2 gap-2">
          {onOpenRegistrarGramas && (
            <button
              onClick={() => {
                onClose();
                onOpenRegistrarGramas();
              }}
              className="flex items-center justify-center gap-1.5 p-2.5 rounded-2xl bg-[#100C16] border border-[#8B5CF6]/40 hover:border-[#8B5CF6] text-[#A78BFA] text-xs font-semibold cursor-pointer active:scale-95 transition-all"
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Colocar em Gramas</span>
            </button>
          )}

          {onOpenQuickScan && (
            <button
              onClick={() => {
                onClose();
                onOpenQuickScan();
              }}
              className="flex items-center justify-center gap-1.5 p-2.5 rounded-2xl bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] text-white text-xs font-semibold cursor-pointer active:scale-95 transition-all shadow-md shadow-[#8B5CF6]/20"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Fotografar Prato</span>
            </button>
          )}
        </div>

        {/* Menu list */}
        <div className="grid grid-cols-1 gap-2 pt-1">
          {menuSections.map((sec) => {
            const isCurrent = activeTab === sec.id;
            return (
              <button
                key={sec.id}
                onClick={() => handleSelect(sec.id)}
                className={`p-3 rounded-2xl text-left border flex items-center gap-3 transition-all cursor-pointer active:scale-[0.99] ${
                  isCurrent
                    ? 'bg-[#22192C] border-[#EC4899] text-[#F8F5FC] shadow-md shadow-[#EC4899]/15'
                    : 'bg-[#100C16] border-[#33263F] text-[#B8AFC4] hover:text-[#F8F5FC] hover:border-[#8B5CF6]/50'
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-[#18121F] border border-[#33263F] flex items-center justify-center shrink-0">
                  {sec.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold ${isCurrent ? 'text-[#F8F5FC]' : 'text-[#F8F5FC]'}`}>
                      {sec.label}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] font-bold text-[#EC4899] bg-[#EC4899]/10 px-2 py-0.5 rounded-full border border-[#EC4899]/30">
                        Ativo
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#B8AFC4] mt-0.5 truncate">
                    {sec.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="text-center pt-2 pb-1">
          <p className="text-[10px] text-[#B8AFC4]/60">
            Our Little Kitchen · Feito com carinho para a Mari 💜🌸
          </p>
        </div>
      </div>
    </div>
  );
};
