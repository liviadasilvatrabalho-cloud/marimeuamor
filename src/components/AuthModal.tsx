import React, { useEffect, useMemo, useState } from 'react';
import { Lock, Heart, ShieldCheck, X, Check, User, Sparkles } from 'lucide-react';
import { AuthProfile } from '../services/auth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  profiles: AuthProfile[];
  currentProfile?: AuthProfile | null;
  isLoggedIn: boolean;
  loading?: boolean;
  error?: string | null;
  onLogin: (profileId: string, pin: string, setupCode?: string) => Promise<void> | void;
  onLogout: () => Promise<void> | void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  profiles,
  currentProfile,
  isLoggedIn,
  loading = false,
  error,
  onLogin,
  onLogout,
}) => {
  const [selectedId, setSelectedId] = useState<string>('');
  const [pin, setPin] = useState('');
  const [setupCode, setSetupCode] = useState('');

  const selected = useMemo(
    () => profiles.find((p) => p.id === selectedId) || profiles[0],
    [profiles, selectedId]
  );

  useEffect(() => {
    if (!selectedId && profiles.length) setSelectedId(profiles[0].id);
  }, [profiles, selectedId]);

  if (!isOpen) return null;

  const needsSetup = Boolean(selected?.needs_pin_setup);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || pin.length < 4) return;
    await onLogin(selected.id, pin, needsSetup ? setupCode : undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-md bg-[#18121F] border border-[#33263F] rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-[#B8AFC4] hover:text-[#F8F5FC] cursor-pointer"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-[#6D28D9] via-[#8B5CF6] to-[#EC4899] p-0.5 mx-auto flex items-center justify-center shadow-lg shadow-[#8B5CF6]/30">
            <div className="w-full h-full rounded-full bg-[#100C16] flex items-center justify-center">
              <Heart className="w-6 h-6 text-[#EC4899]" />
            </div>
          </div>
          <h2 className="font-heading text-xl font-bold text-[#F8F5FC]">
            Mari amore 💜
          </h2>
          <p className="text-xs text-[#B8AFC4]">
            {isLoggedIn ? 'Sessão ativa no espaço compartilhado' : 'Entre com seu perfil'}
          </p>
        </div>

        {isLoggedIn && currentProfile ? (
          <div className="p-5 rounded-2xl bg-[#100C16] border border-[#33263F] text-center space-y-4">
            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              <span>Sessão segura</span>
            </div>
            <div>
              <p className="text-sm font-bold text-[#F8F5FC]">{currentProfile.name}</p>
              <p className="text-xs text-[#B8AFC4]">{currentProfile.email}</p>
              <p className="text-[10px] uppercase tracking-wider text-[#A78BFA] mt-1">
                {currentProfile.role === 'admin' ? 'Administradora' : 'Usuária'}
              </p>
            </div>
            <button
              onClick={() => onLogout()}
              className="w-full py-2.5 rounded-xl bg-[#18121F] hover:bg-[#22192C] text-xs font-semibold text-rose-300 border border-rose-500/30 transition-colors"
            >
              Encerrar sessão
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs text-[#B8AFC4]">Quem está cozinhando?</label>
              <div className="grid grid-cols-2 gap-2">
                {profiles.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => setSelectedId(profile.id)}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      selected?.id === profile.id
                        ? 'border-[#8B5CF6] bg-[#8B5CF6]/15 shadow-md shadow-[#8B5CF6]/20'
                        : 'border-[#33263F] bg-[#100C16] hover:border-[#6D28D9]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-[#A78BFA]" />
                      <span className="text-sm font-bold text-[#F8F5FC]">{profile.name}</span>
                    </div>
                    <span className="text-[10px] text-[#B8AFC4]">
                      {profile.role === 'admin' ? 'Administradora' : 'Usuária'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[#B8AFC4]">
                {needsSetup ? 'Crie seu PIN (mínimo 4 caracteres)' : 'PIN pessoal'}
              </label>
              <div className="relative">
                <input
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#100C16] border border-[#33263F] text-sm text-[#F8F5FC]"
                  placeholder="••••"
                  minLength={4}
                  required
                  autoFocus
                />
                <Lock className="w-4 h-4 text-[#B8AFC4] absolute left-3 top-3" />
              </div>
            </div>

            {needsSetup && (
              <div className="space-y-1">
                <label className="text-xs text-[#B8AFC4]">
                  Código de configuração (se definido no servidor)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={setupCode}
                    onChange={(e) => setSetupCode(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#100C16] border border-[#33263F] text-sm text-[#F8F5FC]"
                    placeholder="Opcional"
                  />
                  <Sparkles className="w-4 h-4 text-[#B8AFC4] absolute left-3 top-3" />
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs text-center">
                {error}
              </div>
            )}

            {needsSetup && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[11px] leading-relaxed">
                Primeiro acesso deste perfil: o PIN que você criar agora será usado nas próximas
                entradas. Guarde-o com carinho.
              </div>
            )}

            <button
              type="submit"
              disabled={loading || pin.length < 4}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#8B5CF6] to-[#EC4899] text-white text-xs font-bold shadow-lg shadow-[#8B5CF6]/30 transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {needsSetup ? 'Criar PIN e entrar' : 'Entrar'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
