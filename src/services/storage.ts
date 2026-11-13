import { AppState, MealLog, Marmita, Recipe, WeeklyPlan, UserProfile, FoodItem, MealSlot } from '../types';

const MARI_PROFILE_ID = '33333333-3333-3333-3333-333333333333';

function profileHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...(extra || {}) };
  h['X-Profile-ID'] = MARI_PROFILE_ID;
  return h;
}

const LOCAL_STORAGE_KEY = 'mari_amore_v1';
const LEGACY_STORAGE_KEYS = [
  'our_little_kitchen_mari_v3',
  'our_little_kitchen_mari_v2',
  'our_little_kitchen_mari_v1',
  'our_little_kitchen_state',
];

export const INITIAL_USER_PROFILE: UserProfile = {
  name: 'Mari',
  email: 'mari@mariamore.app',
  calorieGoal: 2000,
  macros: {
    proteinGrams: 115,
    carbsGrams: 200,
    fatGrams: 50,
  },
  waterGoalMl: 2000,
  waterDrankMl: 0,
  currentWeightKg: 58.0,
  targetWeightKg: 57.0,
  heightCm: 164,
  dietPreference: 'Equilibrada & Saudável',
};

export const INITIAL_MARMITAS: Marmita[] = [];

export const INITIAL_RECIPES: Recipe[] = [];

export const INITIAL_MEAL_SLOTS: MealSlot[] = [
  { id: 'cafe', label: 'Café da Manhã', timeHint: '07:00 - 09:30', icon: '☕' },
  { id: 'lanche_manha', label: 'Lanche da Manhã', timeHint: '10:00 - 11:30', icon: '🍌' },
  { id: 'almoco', label: 'Almoço', timeHint: '12:00 - 14:00', icon: '🥗' },
  { id: 'lanche', label: 'Lanche da Tarde', timeHint: '16:00 - 17:30', icon: '🍎' },
  { id: 'jantar', label: 'Jantar', timeHint: '19:30 - 21:00', icon: '🍲' },
  { id: 'ceia', label: 'Ceia', timeHint: '22:00 - 23:00', icon: '🌙' },
];

export const INITIAL_WEEKLY_PLAN: WeeklyPlan = {
  segunda: [],
  terca: [],
  quarta: [],
  quinta: [],
  sexta: [],
  sabado: [],
  domingo: [],
};

// Start with zero meal records as requested by user
export function getInitialTodayLogs(): MealLog[] {
  return [];
}

function sanitizeUser(user: any): UserProfile {
  if (!user) return INITIAL_USER_PROFILE;
  const rawName = String(user.name || '').trim();
  const name = !rawName || rawName.toLowerCase().includes('l') || rawName.toLowerCase() === 'mariana' ? 'Mari' : rawName;
  return {
    ...INITIAL_USER_PROFILE,
    ...user,
    name,
    email: user.email || 'mari@mariamore.app',
  };
}

export const StorageService = {
  // Load state from local or server
  async loadState(): Promise<AppState> {
    // Limpa versões antigas do localStorage
    try {
      for (const k of LEGACY_STORAGE_KEYS) {
        localStorage.removeItem(k);
      }
    } catch {
      /* ignore */
    }

    // Try server first
    try {
      const res = await fetch('/api/storage', { credentials: 'same-origin', headers: profileHeaders() });
      if (res.ok) {
        const serverData = await res.json();
        if (serverData && serverData.user) {
          serverData.user = sanitizeUser(serverData.user);
          if (!serverData.todayLogs) {
            serverData.todayLogs = [];
          }
          if (!serverData.historyLogs) {
            serverData.historyLogs = [];
          }
          if (!serverData.customFoods) {
            serverData.customFoods = [];
          }
          if (!serverData.marmitas) {
            serverData.marmitas = [];
          }
          if (!serverData.recipes) {
            serverData.recipes = [];
          }
          if (!serverData.weeklyPlan || Object.keys(serverData.weeklyPlan).length === 0) {
            serverData.weeklyPlan = INITIAL_WEEKLY_PLAN;
          }
          if (!serverData.mealSlots || serverData.mealSlots.length === 0) {
            serverData.mealSlots = INITIAL_MEAL_SLOTS;
          }
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(serverData));
          return serverData;
        }
      }
    } catch (e) {
      console.warn('Servidor inacessível, recuperando dados locais:', e);
    }

    // Try localStorage
    try {
      const local = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (local) {
        const parsed = JSON.parse(local);
        if (parsed && parsed.user) {
          parsed.user = sanitizeUser(parsed.user);
          return parsed;
        }
      }
    } catch (e) {
      console.error('Erro ao ler localStorage:', e);
    }

    // Return complete fresh state with zero meal records and zero custom foods
    const defaultState: AppState = {
      user: INITIAL_USER_PROFILE,
      todayLogs: [],
      historyLogs: [],
      marmitas: [],
      recipes: [],
      weeklyPlan: INITIAL_WEEKLY_PLAN,
      mealSlots: INITIAL_MEAL_SLOTS,
      customFoods: [],
      lastUpdated: new Date().toISOString(),
    };

    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(defaultState));
    this.saveState(defaultState).catch(() => {});
    return defaultState;
  },

  // Busca o documento mais recente do servidor (usado pelo polling de sync)
  async fetchRemoteState(): Promise<AppState | null> {
    try {
      const res = await fetch('/api/storage', { credentials: 'same-origin', headers: profileHeaders() });
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.user) {
        data.user = sanitizeUser(data.user);
      }
      return data?.user ? (data as AppState) : null;
    } catch {
      return null;
    }
  },

  // Aplica um estado vindo de outro dispositivo sem reenviá-lo ao servidor
  applyRemoteState(state: AppState): void {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
  },

  // Limpa a cópia local ao sair, para que um visitante sem sessão não veja
  // dados compartilhados em cache no navegador.
  clearLocalState(): AppState {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    return {
      user: INITIAL_USER_PROFILE,
      todayLogs: [],
      historyLogs: [],
      marmitas: [],
      recipes: [],
      weeklyPlan: INITIAL_WEEKLY_PLAN,
      mealSlots: INITIAL_MEAL_SLOTS,
      customFoods: [],
      lastUpdated: new Date().toISOString(),
    };
  },

  // Save state to local and server in background
  async saveState(state: AppState): Promise<void> {
    try {
      state.lastUpdated = new Date().toISOString();
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));

      // Asynchronously persist to server
      fetch('/api/storage', {
        method: 'POST',
        credentials: 'same-origin',
        headers: profileHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(state),
      }).catch((err) => {
        console.warn('Erro assíncrono ao sincronizar no servidor:', err);
      });
    } catch (e) {
      console.error('Erro ao salvar estado:', e);
    }
  },
};
