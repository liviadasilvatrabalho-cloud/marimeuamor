import React, { useState, useEffect } from 'react';
import { AppState, MealLog, FoodItem, WeeklyPlan, UserProfile, MealType } from './types';
import { StorageService, INITIAL_USER_PROFILE } from './services/storage';
import { Header, MobileTabBar, MobileMenuDrawer, TabId } from './components/Navigation';
import { MeuDia } from './components/MeuDia';
import { FoodScannerModal } from './components/FoodScannerModal';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import { SemBalanca } from './components/SemBalanca';
import { CalculadoraNutricional } from './components/CalculadoraNutricional';
import { PlanejamentoSemanal } from './components/PlanejamentoSemanal';
import { HistoricoNutricional } from './components/HistoricoNutricional';
import { PerfilMariana } from './components/PerfilMariana';
import { RegistrarGramasModal } from './components/RegistrarGramasModal';

export default function App() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('meu-dia');
  const [isRegistrarGramasOpen, setIsRegistrarGramasOpen] = useState(false);
  const [isPhotoScannerOpen, setIsPhotoScannerOpen] = useState(false);
  const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedMealTypeForAction, setSelectedMealTypeForAction] = useState<MealType>('almoco');

  // Modo usuário único (só a Mari): carrega o estado direto, sem tela de login.
  useEffect(() => {
    (async () => {
      const state = await StorageService.loadState();
      setAppState(state);
    })();
  }, []);
  useEffect(() => {
    if (!appState) return;
    let cancelled = false;

    const pull = async () => {
      try {
        const res = await fetch('/api/sync/status', { credentials: 'same-origin', headers: import.meta.env?.DEV ? { 'X-Profile-ID': '33333333-3333-3333-3333-333333333333' } : {} });
        if (!res.ok) return;
        const status = await res.json();
        if (!status?.lastUpdated) return;
        const local = appState.lastUpdated ? new Date(appState.lastUpdated).getTime() : 0;
        const remote = new Date(status.lastUpdated).getTime();
        if (remote > local + 1000) {
          const fresh = await StorageService.fetchRemoteState();
          if (fresh && !cancelled) {
            StorageService.applyRemoteState(fresh);
            setAppState((prev) =>
              prev
                ? {
                    ...fresh,
                    user: prev.user,
                  }
                : fresh
            );
          }
        }
      } catch {
        // offline: mantém o estado local
      }
    };

    const interval = window.setInterval(pull, 6000);
    const onFocus = () => pull();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [appState?.lastUpdated]);

  // Sync state changes with persistence
  const updateStateAndPersist = (updater: (prev: AppState) => AppState) => {
    setAppState((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      StorageService.saveState(next);
      return next;
    });
  };

  if (!appState) {
    return (
      <div className="min-h-screen bg-[#09070D] flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-full border-2 border-[#8B5CF6] border-t-transparent animate-spin mx-auto" />
          <p className="text-xs font-semibold text-[#A78BFA] tracking-wide">
            Carregando Our Little Kitchen... 💜
          </p>
        </div>
      </div>
    );
  }

  // --- ACTIONS ---

  // Save complete meal from Photo Scanner
  const handleSaveMealFromScanner = (meal: MealLog) => {
    updateStateAndPersist((prev) => ({
      ...prev,
      todayLogs: [meal, ...prev.todayLogs],
    }));
  };

  // Add individual food item to a meal slot
  const handleAddMealItem = (item: FoodItem, targetType: MealType) => {
    updateStateAndPersist((prev) => {
      const today = new Date().toISOString().split('T')[0];
      const existingMeal = prev.todayLogs.find((l) => l.mealType === targetType && l.date === today);

      let newTodayLogs: MealLog[];
      if (existingMeal) {
        newTodayLogs = prev.todayLogs.map((l) => {
          if (l.id !== existingMeal.id) return l;
          const updatedFoods = [...l.foods, item];
          return {
            ...l,
            title: updatedFoods.map((f) => f.name).join(', '),
            foods: updatedFoods,
            totalCalories: updatedFoods.reduce((acc, f) => acc + f.calories, 0),
            totalProtein: Number(updatedFoods.reduce((acc, f) => acc + f.protein, 0).toFixed(1)),
            totalCarbs: Number(updatedFoods.reduce((acc, f) => acc + f.carbs, 0).toFixed(1)),
            totalFat: Number(updatedFoods.reduce((acc, f) => acc + f.fat, 0).toFixed(1)),
            totalFiber: Number(updatedFoods.reduce((acc, f) => acc + f.fiber, 0).toFixed(1)),
          };
        });
      } else {
        const newLog: MealLog = {
          id: `meal-${Date.now()}`,
          date: today,
          mealType: targetType,
          title: item.name,
          foods: [item],
          totalCalories: item.calories,
          totalProtein: item.protein,
          totalCarbs: item.carbs,
          totalFat: item.fat,
          totalFiber: item.fiber,
          createdAt: new Date().toISOString(),
        };
        newTodayLogs = [newLog, ...prev.todayLogs];
      }

      return {
        ...prev,
        todayLogs: newTodayLogs,
      };
    });
  };

  // Delete a specific food item from a meal
  const handleDeleteFoodItem = (mealId: string, foodId: string) => {
    updateStateAndPersist((prev) => {
      const targetMeal = prev.todayLogs.find((l) => l.id === mealId);
      if (!targetMeal) return prev;

      const remainingFoods = targetMeal.foods.filter((f) => f.id !== foodId);
      if (remainingFoods.length === 0) {
        return {
          ...prev,
          todayLogs: prev.todayLogs.filter((l) => l.id !== mealId),
        };
      }

      const updatedMeal: MealLog = {
        ...targetMeal,
        title: remainingFoods.map((f) => f.name).join(', '),
        foods: remainingFoods,
        totalCalories: remainingFoods.reduce((acc, f) => acc + f.calories, 0),
        totalProtein: Number(remainingFoods.reduce((acc, f) => acc + f.protein, 0).toFixed(1)),
        totalCarbs: Number(remainingFoods.reduce((acc, f) => acc + f.carbs, 0).toFixed(1)),
        totalFat: Number(remainingFoods.reduce((acc, f) => acc + f.fat, 0).toFixed(1)),
        totalFiber: Number(remainingFoods.reduce((acc, f) => acc + f.fiber, 0).toFixed(1)),
      };

      return {
        ...prev,
        todayLogs: prev.todayLogs.map((l) => (l.id === mealId ? updatedMeal : l)),
      };
    });
  };

  // Update grams and dynamically recalculate calories and macros for a food item in a meal
  const handleUpdateFoodItemGrams = (mealId: string, foodId: string, newGrams: number) => {
    updateStateAndPersist((prev) => {
      const targetMeal = prev.todayLogs.find((l) => l.id === mealId);
      if (!targetMeal) return prev;

      const updatedFoods = targetMeal.foods.map((f) => {
        if (f.id !== foodId) return f;
        const g = Math.max(1, newGrams);
        const p100 = f.per100g || {
          calories: Math.round(((f.calories || 0) / (f.portionGrams || 100)) * 100),
          protein: Number((((f.protein || 0) / (f.portionGrams || 100)) * 100).toFixed(1)),
          carbs: Number((((f.carbs || 0) / (f.portionGrams || 100)) * 100).toFixed(1)),
          fat: Number((((f.fat || 0) / (f.portionGrams || 100)) * 100).toFixed(1)),
          fiber: Number((((f.fiber || 0) / (f.portionGrams || 100)) * 100).toFixed(1)),
        };
        const ratio = g / 100;
        return {
          ...f,
          portionGrams: g,
          calories: Math.round((p100.calories || 0) * ratio),
          protein: Number(((p100.protein || 0) * ratio).toFixed(1)),
          carbs: Number(((p100.carbs || 0) * ratio).toFixed(1)),
          fat: Number(((p100.fat || 0) * ratio).toFixed(1)),
          fiber: Number(((p100.fiber || 0) * ratio).toFixed(1)),
          per100g: p100,
        };
      });

      const updatedMeal: MealLog = {
        ...targetMeal,
        foods: updatedFoods,
        totalCalories: updatedFoods.reduce((acc, f) => acc + f.calories, 0),
        totalProtein: Number(updatedFoods.reduce((acc, f) => acc + f.protein, 0).toFixed(1)),
        totalCarbs: Number(updatedFoods.reduce((acc, f) => acc + f.carbs, 0).toFixed(1)),
        totalFat: Number(updatedFoods.reduce((acc, f) => acc + f.fat, 0).toFixed(1)),
        totalFiber: Number(updatedFoods.reduce((acc, f) => acc + f.fiber, 0).toFixed(1)),
      };

      return {
        ...prev,
        todayLogs: prev.todayLogs.map((l) => (l.id === mealId ? updatedMeal : l)),
      };
    });
  };

  // Save food to user's database without duplicates
  const handleSaveCustomFood = (food: FoodItem) => {
    updateStateAndPersist((prev) => {
      const existingList = Array.isArray(prev.customFoods) ? prev.customFoods : [];
      const filtered = existingList.filter(
        (f) =>
          !(
            (food.barcode && f.barcode && f.barcode === food.barcode) ||
            (food.id && f.id === food.id) ||
            f.name.toLowerCase().trim() === food.name.toLowerCase().trim()
          )
      );
      return {
        ...prev,
        customFoods: [food, ...filtered],
      };
    });
  };

  // Delete an entire meal
  const handleDeleteMeal = (mealId: string) => {
    updateStateAndPersist((prev) => ({
      ...prev,
      todayLogs: prev.todayLogs.filter((l) => l.id !== mealId),
    }));
  };

  // Delete history item
  const handleDeleteHistoryItem = (id: string) => {
    updateStateAndPersist((prev) => ({
      ...prev,
      todayLogs: prev.todayLogs.filter((l) => l.id !== id),
      historyLogs: prev.historyLogs.filter((l) => l.id !== id),
    }));
  };

  // Water tracking
  const handleUpdateWater = (amountMl: number) => {
    updateStateAndPersist((prev) => ({
      ...prev,
      user: {
        ...prev.user,
        waterDrankMl: Math.min(prev.user.waterGoalMl * 2, prev.user.waterDrankMl + amountMl),
      },
    }));
  };

  // Weekly plan update
  const handleUpdateWeeklyPlan = (newPlan: WeeklyPlan) => {
    updateStateAndPersist((prev) => ({
      ...prev,
      weeklyPlan: newPlan,
    }));
  };

  // User profile update
  const handleUpdateProfile = (updatedUser: UserProfile) => {
    updateStateAndPersist((prev) => ({
      ...prev,
      user: updatedUser,
    }));
  };

  // Export JSON backup
  const handleExportData = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(appState, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `our_little_kitchen_mariana_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="min-h-screen bg-[#09070D] text-[#F8F5FC] flex flex-col antialiased selection:bg-[#8B5CF6]/30">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        user={appState.user}
        onOpenQuickScan={() => {
          setSelectedMealTypeForAction('almoco');
          setIsPhotoScannerOpen(true);
        }}
        onOpenRegistrarGramas={() => {
          setSelectedMealTypeForAction('almoco');
          setIsRegistrarGramasOpen(true);
        }}
        onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
      />

      {/* Main Content Area - Centered max-w-4xl for elegant, balanced responsiveness */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-3 sm:px-6 py-3 sm:py-6 pb-28 lg:pb-8">
        {activeTab === 'meu-dia' && (
          <MeuDia
            appState={appState}
            onOpenRegistrarGramas={(mealType) => {
              setSelectedMealTypeForAction(mealType || 'almoco');
              setIsRegistrarGramasOpen(true);
            }}
            onOpenPhotoScanner={(mealType) => {
              setSelectedMealTypeForAction(mealType || 'almoco');
              setIsPhotoScannerOpen(true);
            }}
            onOpenBarcodeScanner={(mealType) => {
              setSelectedMealTypeForAction(mealType || 'almoco');
              setIsBarcodeScannerOpen(true);
            }}
            onOpenSemBalanca={(mealType) => {
              setSelectedMealTypeForAction(mealType || 'almoco');
              setActiveTab('sem-balanca');
            }}
            onOpenCalculadora={(mealType) => {
              setSelectedMealTypeForAction(mealType || 'almoco');
              setActiveTab('calculadora');
            }}
            onDeleteMeal={handleDeleteMeal}
            onDeleteFoodItem={handleDeleteFoodItem}
            onUpdateFoodItemGrams={handleUpdateFoodItemGrams}
            onUpdateMealSlots={(slots) => {
              updateStateAndPersist((prev) => ({ ...prev, mealSlots: slots }));
            }}
          />
        )}

        {activeTab === 'scanner' && (
          <div className="py-2">
            <FoodScannerModal
              isOpen={true}
              onClose={() => setActiveTab('meu-dia')}
              initialMealType={selectedMealTypeForAction}
              mealSlots={appState.mealSlots}
              onSaveMeal={handleSaveMealFromScanner}
            />
          </div>
        )}

        {activeTab === 'barcode' && (
          <div className="py-2">
            <BarcodeScannerModal
              isOpen={true}
              onClose={() => setActiveTab('meu-dia')}
              initialMealType={selectedMealTypeForAction}
              mealSlots={appState.mealSlots}
              customFoods={appState.customFoods}
              onSaveMealItem={handleAddMealItem}
              onSaveCustomFood={handleSaveCustomFood}
            />
          </div>
        )}

        {activeTab === 'sem-balanca' && (
          <SemBalanca
            onAddMealItem={(item, mealType) => {
              handleAddMealItem(item, mealType);
            }}
            initialMealType={selectedMealTypeForAction}
            mealSlots={appState.mealSlots}
          />
        )}

        {activeTab === 'calculadora' && (
          <CalculadoraNutricional
            onAddMealItem={(item, mealType) => {
              handleAddMealItem(item, mealType);
            }}
            initialMealType={selectedMealTypeForAction}
            mealSlots={appState.mealSlots}
          />
        )}

        {activeTab === 'planejamento' && (
          <PlanejamentoSemanal
            weeklyPlan={appState.weeklyPlan}
            marmitas={appState.marmitas}
            recipes={appState.recipes}
            onUpdateWeeklyPlan={handleUpdateWeeklyPlan}
          />
        )}

        {activeTab === 'historico' && (
          <HistoricoNutricional
            appState={appState}
            onDeleteHistoryItem={handleDeleteHistoryItem}
          />
        )}

        {activeTab === 'perfil' && (
          <PerfilMariana
            user={appState.user}
            appState={appState}
            onUpdateProfile={handleUpdateProfile}
            onExportData={handleExportData}
            onImportData={(data) => {
              setAppState(data);
              StorageService.saveState(data);
            }}
          />
        )}
      </main>

      {/* Floating Bottom Tab Bar for Mobile */}
      <MobileTabBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        user={appState.user}
        onOpenQuickScan={() => {
          setSelectedMealTypeForAction('almoco');
          setIsPhotoScannerOpen(true);
        }}
        onOpenMenu={() => setIsMobileMenuOpen(true)}
      />

      {/* Mobile Full Navigation Menu Sheet / Drawer */}
      <MobileMenuDrawer
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        user={appState.user}
        onOpenRegistrarGramas={() => {
          setSelectedMealTypeForAction('almoco');
          setIsRegistrarGramasOpen(true);
        }}
        onOpenQuickScan={() => {
          setSelectedMealTypeForAction('almoco');
          setIsPhotoScannerOpen(true);
        }}
      />

      {/* Registrar em Gramas Modal */}
      <RegistrarGramasModal
        isOpen={isRegistrarGramasOpen}
        onClose={() => setIsRegistrarGramasOpen(false)}
        initialMealType={selectedMealTypeForAction}
        mealSlots={appState.mealSlots}
        customFoods={appState.customFoods}
        onSaveMealItem={handleAddMealItem}
      />

      {/* Food Scanner Modal Triggered from Header / Quick Actions */}
      <FoodScannerModal
        isOpen={isPhotoScannerOpen}
        onClose={() => setIsPhotoScannerOpen(false)}
        initialMealType={selectedMealTypeForAction}
        mealSlots={appState.mealSlots}
        onSaveMeal={handleSaveMealFromScanner}
      />

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isBarcodeScannerOpen}
        onClose={() => setIsBarcodeScannerOpen(false)}
        initialMealType={selectedMealTypeForAction}
        mealSlots={appState.mealSlots}
        customFoods={appState.customFoods}
        onSaveMealItem={handleAddMealItem}
        onSaveCustomFood={handleSaveCustomFood}
      />
    </div>
  );
}
