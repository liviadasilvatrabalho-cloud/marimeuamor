import React, { useState, useMemo } from 'react';
import {
  Apple,
  Search,
  Plus,
  Trash2,
  Edit3,
  Eye,
  Check,
  X,
  AlertCircle,
  Scale,
  Calendar,
  Flame,
  ArrowUpDown,
  Utensils,
  Sparkles,
  Camera,
  FileText,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { FoodItem, MealType, MealSlot, AppState, PrepState } from '../types';
import { INITIAL_MEAL_SLOTS } from '../services/storage';
import { formatPtBr, parsePtBrInput } from './NutritionLabelModal';

interface MeusAlimentosProps {
  appState: AppState;
  onSaveCustomFood: (food: FoodItem) => void;
  onDeleteCustomFood: (foodId: string) => void;
  onAddMealItem: (item: FoodItem, targetType: MealType, date?: string, isPlanned?: boolean) => void;
  onOpenPhotoScannerModal?: () => void;
}

export const MeusAlimentos: React.FC<MeusAlimentosProps> = ({
  appState,
  onSaveCustomFood,
  onDeleteCustomFood,
  onAddMealItem,
  onOpenPhotoScannerModal,
}) => {
  const { customFoods = [], mealSlots, user, todayLogs = [], historyLogs = [] } = appState;
  const slots = mealSlots && mealSlots.length ? mealSlots : INITIAL_MEAL_SLOTS;

  // Search and Sort states
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'az'>('recent');

  // Modal states
  const [selectedFoodForDetails, setSelectedFoodForDetails] = useState<FoodItem | null>(null);
  const [editingFood, setEditingFood] = useState<FoodItem | null>(null);
  const [isCreatingFood, setIsCreatingFood] = useState(false);
  const [foodToDelete, setFoodToDelete] = useState<FoodItem | null>(null);

  // Consume / Add to Meal Dialog
  const [consumingFood, setConsumingFood] = useState<FoodItem | null>(null);
  const [consumeGrams, setConsumeGrams] = useState<number>(100);
  const [consumeMealType, setConsumeMealType] = useState<MealType>('almoco');
  const [consumeDate, setConsumeDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [consumeAsPlanned, setConsumeAsPlanned] = useState<boolean>(false);

  // Form state for creating/editing food
  const [formFields, setFormFields] = useState({
    name: '',
    brand: '',
    portionGrams: '100',
    portionUnit: 'g',
    householdMeasure: '',
    calories: '',
    carbs: '',
    protein: '',
    fat: '',
    saturatedFat: '',
    transFat: '',
    fiber: '',
    sodium: '',
    sugars: '',
  });
  const [formError, setFormError] = useState<string | null>(null);

  // Filter and sort foods
  const filteredFoods = useMemo(() => {
    let list = [...customFoods];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          (f.brand && f.brand.toLowerCase().includes(q))
      );
    }

    if (sortBy === 'az') {
      list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
    } else {
      // By most recent
      list.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
    }

    return list;
  }, [customFoods, searchTerm, sortBy]);

  // Check if a food is used in future planned meals
  const checkFoodUsageInFuturePlans = (food: FoodItem) => {
    const today = new Date().toISOString().split('T')[0];
    const allLogs = [...todayLogs, ...historyLogs];
    const futurePlanned = allLogs.filter(
      (m) => m.isPlanned && m.date >= today && m.foods.some((f) => f.id === food.id || f.name.toLowerCase() === food.name.toLowerCase())
    );
    return futurePlanned;
  };

  const handleOpenEdit = (food: FoodItem) => {
    setEditingFood(food);
    const p100 = food.per100g || {};
    setFormFields({
      name: food.name,
      brand: food.brand || '',
      portionGrams: formatPtBr(food.portionGrams || 100),
      portionUnit: 'g',
      householdMeasure: food.householdMeasure || '',
      calories: formatPtBr(p100.calories ?? food.calories),
      carbs: formatPtBr(p100.carbs ?? food.carbs),
      protein: formatPtBr(p100.protein ?? food.protein),
      fat: formatPtBr(p100.fat ?? food.fat),
      saturatedFat: formatPtBr(p100.saturatedFat ?? food.saturatedFat),
      transFat: formatPtBr(p100.transFat ?? food.transFat),
      fiber: formatPtBr(p100.fiber ?? food.fiber),
      sodium: formatPtBr(p100.sodium ?? food.sodium),
      sugars: formatPtBr(p100.sugars ?? food.sugars),
    });
    setFormError(null);
  };

  const handleOpenCreate = () => {
    setIsCreatingFood(true);
    setFormFields({
      name: '',
      brand: '',
      portionGrams: '100',
      portionUnit: 'g',
      householdMeasure: '',
      calories: '',
      carbs: '',
      protein: '',
      fat: '',
      saturatedFat: '',
      transFat: '',
      fiber: '',
      sodium: '',
      sugars: '',
    });
    setFormError(null);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = formFields.name.trim();
    if (!trimmedName) {
      setFormError('O nome do alimento é obrigatório.');
      return;
    }

    const portionGrams = parsePtBrInput(formFields.portionGrams) || 100;
    const calories100 = parsePtBrInput(formFields.calories) ?? 0;
    const carbs100 = parsePtBrInput(formFields.carbs) ?? 0;
    const protein100 = parsePtBrInput(formFields.protein) ?? 0;
    const fat100 = parsePtBrInput(formFields.fat) ?? 0;
    const satFat100 = parsePtBrInput(formFields.saturatedFat);
    const transFat100 = parsePtBrInput(formFields.transFat);
    const fiber100 = parsePtBrInput(formFields.fiber) ?? 0;
    const sodium100 = parsePtBrInput(formFields.sodium);
    const sugars100 = parsePtBrInput(formFields.sugars);

    const p100 = {
      calories: calories100,
      carbs: carbs100,
      protein: protein100,
      fat: fat100,
      fiber: fiber100,
      saturatedFat: satFat100 ?? undefined,
      transFat: transFat100 ?? undefined,
      sodium: sodium100 ?? undefined,
      sugars: sugars100 ?? undefined,
    };

    const ratio = portionGrams / 100;

    const foodItem: FoodItem = {
      id: editingFood ? editingFood.id : `food-${Date.now()}`,
      name: trimmedName,
      brand: formFields.brand.trim() || undefined,
      barcode: editingFood?.barcode,
      prepState: editingFood?.prepState || 'cru',
      portionGrams,
      calories: Number(((calories100 * ratio)).toFixed(1)),
      protein: Number(((protein100 * ratio)).toFixed(2)),
      carbs: Number(((carbs100 * ratio)).toFixed(2)),
      fat: Number(((fat100 * ratio)).toFixed(2)),
      fiber: Number(((fiber100 * ratio)).toFixed(2)),
      saturatedFat: satFat100 != null ? Number(((satFat100 * ratio)).toFixed(2)) : undefined,
      transFat: transFat100 != null ? Number(((transFat100 * ratio)).toFixed(2)) : undefined,
      sodium: sodium100 != null ? Number(((sodium100 * ratio)).toFixed(1)) : undefined,
      sugars: sugars100 != null ? Number(((sugars100 * ratio)).toFixed(2)) : undefined,
      per100g: p100,
      householdMeasure: formFields.householdMeasure.trim() || undefined,
      source: editingFood?.source || 'Manual',
      verified: true,
      createdAt: editingFood?.createdAt || new Date().toISOString(),
    };

    onSaveCustomFood(foodItem);

    // Save to server Postgres
    try {
      await fetch('/api/nutrition/save-food', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: foodItem.name,
          brand: foodItem.brand,
          servingSize: foodItem.householdMeasure || `${foodItem.portionGrams}g`,
          servingGrams: foodItem.portionGrams,
          householdMeasure: foodItem.householdMeasure,
          per100g: p100,
          perPortion: {
            calories: foodItem.calories,
            protein: foodItem.protein,
            carbs: foodItem.carbs,
            fat: foodItem.fat,
            fiber: foodItem.fiber,
            sodium: foodItem.sodium,
            sugars: foodItem.sugars,
            saturatedFat: foodItem.saturatedFat,
            transFat: foodItem.transFat,
          },
          source: 'Meus Alimentos',
          verificationStatus: 'user_confirmed',
        }),
      });
    } catch (err) {
      console.warn('Erro ao salvar no servidor Postgres:', err);
    }

    setEditingFood(null);
    setIsCreatingFood(false);
  };

  const handleConfirmDelete = () => {
    if (!foodToDelete) return;
    onDeleteCustomFood(foodToDelete.id);
    setFoodToDelete(null);
  };

  const handleOpenConsume = (food: FoodItem) => {
    setConsumingFood(food);
    setConsumeGrams(food.portionGrams || 100);
    setConsumeMealType('almoco');
    setConsumeDate(new Date().toISOString().split('T')[0]);
    setConsumeAsPlanned(false);
  };

  const handleConfirmConsume = () => {
    if (!consumingFood) return;

    const grams = Math.max(1, consumeGrams || 100);
    const p100 = consumingFood.per100g || {
      calories: ((consumingFood.calories || 0) / (consumingFood.portionGrams || 100)) * 100,
      protein: ((consumingFood.protein || 0) / (consumingFood.portionGrams || 100)) * 100,
      carbs: ((consumingFood.carbs || 0) / (consumingFood.portionGrams || 100)) * 100,
      fat: ((consumingFood.fat || 0) / (consumingFood.portionGrams || 100)) * 100,
      fiber: ((consumingFood.fiber || 0) / (consumingFood.portionGrams || 100)) * 100,
    };

    const ratio = grams / 100;

    const itemToAdd: FoodItem = {
      ...consumingFood,
      id: `meal-item-${Date.now()}`,
      portionGrams: grams,
      calories: Number(((p100.calories || 0) * ratio).toFixed(1)),
      protein: Number(((p100.protein || 0) * ratio).toFixed(2)),
      carbs: Number(((p100.carbs || 0) * ratio).toFixed(2)),
      fat: Number(((p100.fat || 0) * ratio).toFixed(2)),
      fiber: Number(((p100.fiber || 0) * ratio).toFixed(2)),
    };

    onAddMealItem(itemToAdd, consumeMealType, consumeDate, consumeAsPlanned);
    setConsumingFood(null);
  };

  const consumedTotals = useMemo(() => {
    if (!consumingFood) return { calories: '0', protein: '0', carbs: '0', fat: '0', fiber: '0' };
    const p100 = consumingFood.per100g || {
      calories: ((consumingFood.calories || 0) / (consumingFood.portionGrams || 100)) * 100,
      protein: ((consumingFood.protein || 0) / (consumingFood.portionGrams || 100)) * 100,
      carbs: ((consumingFood.carbs || 0) / (consumingFood.portionGrams || 100)) * 100,
      fat: ((consumingFood.fat || 0) / (consumingFood.portionGrams || 100)) * 100,
      fiber: ((consumingFood.fiber || 0) / (consumingFood.portionGrams || 100)) * 100,
    };
    const ratio = Math.max(1, consumeGrams || 1) / 100;
    return {
      calories: formatPtBr(Number(((p100.calories || 0) * ratio).toFixed(1))),
      protein: formatPtBr(Number(((p100.protein || 0) * ratio).toFixed(2))),
      carbs: formatPtBr(Number(((p100.carbs || 0) * ratio).toFixed(2))),
      fat: formatPtBr(Number(((p100.fat || 0) * ratio).toFixed(2))),
      fiber: formatPtBr(Number(((p100.fiber || 0) * ratio).toFixed(2))),
    };
  }, [consumingFood, consumeGrams]);

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4 sm:space-y-6 pb-28 lg:pb-12 animate-fadeIn">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#18121F] via-[#100C16] to-[#09070D] border border-[#33263F] p-4 sm:p-6 shadow-xl">
        <div className="absolute top-0 right-1/4 -mt-16 w-60 h-60 bg-[#8B5CF6]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#100C16] border border-[#33263F] text-[11px] font-semibold text-[#A78BFA]">
              <Apple className="w-3.5 h-3.5 text-[#EC4899]" />
              <span>Biblioteca Nutricional</span>
            </div>
            <h1 className="font-heading text-xl sm:text-2xl font-bold text-[#F8F5FC]">
              Meus Alimentos
            </h1>
            <p className="text-xs text-[#B8AFC4]">
              {customFoods.length} alimento(s) cadastrado(s) permanentemente para reutilizar em qualquer refeição
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {onOpenPhotoScannerModal && (
              <button
                type="button"
                onClick={onOpenPhotoScannerModal}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-[#1C1327] border border-[#33263F] hover:border-[#8B5CF6] text-xs font-semibold text-[#FAF8FC] hover:bg-[#251934] transition-all cursor-pointer shadow-sm"
              >
                <Camera className="w-3.5 h-3.5 text-[#A78BFA]" />
                <span className="truncate">Fotografar Tabela</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleOpenCreate}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] hover:from-[#7C3AED] hover:to-[#A78BFA] text-white text-xs font-bold shadow-lg shadow-[#8B5CF6]/25 transition-all cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Cadastrar Alimento</span>
            </button>
          </div>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-2.5 p-2 rounded-2xl bg-[#140E1B] border border-[#322046]/70 shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-[#B5A8C8] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar alimento por nome ou marca..."
            className="w-full pl-9 pr-8 py-2 rounded-xl bg-[#1A1224] border border-[#322046] text-xs text-[#FAF8FC] placeholder-[#7B6E8F] focus:outline-none focus:border-[#8B5CF6]"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#B5A8C8] hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1A1224] border border-[#322046] text-xs text-[#B5A8C8]">
            <ArrowUpDown className="w-3.5 h-3.5 text-[#A78BFA]" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-xs font-medium text-[#FAF8FC] focus:outline-none cursor-pointer"
            >
              <option value="recent" className="bg-[#1A1224] text-white">Mais Recentes</option>
              <option value="az" className="bg-[#1A1224] text-white">Ordem Alfabética (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Foods Grid / List */}
      {filteredFoods.length === 0 ? (
        <div className="p-8 sm:p-12 rounded-3xl bg-[#140E1B] border border-[#322046]/70 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-[#1F142B] border border-[#322046] flex items-center justify-center mx-auto text-[#A78BFA]">
            <Apple className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#FAF8FC]">
              {searchTerm ? 'Nenhum alimento encontrado para essa busca' : 'Nenhum alimento cadastrado ainda'}
            </h3>
            <p className="text-xs text-[#B5A8C8] mt-1 max-w-sm mx-auto">
              {searchTerm
                ? 'Tente buscar com outro termo ou cadastre um novo alimento.'
                : 'Cadastre seus alimentos por foto da tabela ou manualmente para reutilizá-los em segundos nas suas refeições.'}
            </p>
          </div>
          {!searchTerm && (
            <button
              type="button"
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#8B5CF6] text-white text-xs font-bold hover:bg-[#7C3AED] transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Cadastrar Primeiro Alimento</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredFoods.map((food) => {
            const p100 = food.per100g || {};
            const kcal = p100.calories ?? food.calories ?? 0;
            const protein = p100.protein ?? food.protein ?? 0;
            const carbs = p100.carbs ?? food.carbs ?? 0;
            const fat = p100.fat ?? food.fat ?? 0;

            return (
              <div
                key={food.id}
                className="group p-4 rounded-2xl bg-[#140E1B] hover:bg-[#1A1224] border border-[#322046]/80 hover:border-[#8B5CF6]/50 shadow-md transition-all flex flex-col justify-between space-y-3"
              >
                {/* Header do Card */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-[#FAF8FC] truncate group-hover:text-[#A78BFA] transition-colors">
                      {food.name}
                    </h3>
                    <p className="text-[11px] text-[#B5A8C8] truncate">
                      {food.brand ? `${food.brand} · ` : ''}Porção ref.: {formatPtBr(food.portionGrams || 100)}g
                      {food.householdMeasure ? ` (${food.householdMeasure})` : ''}
                    </p>
                  </div>

                  {/* Calorias Destaque */}
                  <div className="text-right shrink-0">
                    <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-pink-500/15 border border-pink-500/30 text-[#EC4899] font-bold text-xs font-mono-numbers">
                      <Flame className="w-3.5 h-3.5" />
                      <span>{formatPtBr(kcal)} kcal</span>
                    </div>
                    <span className="text-[9px] text-[#7B6E8F] block mt-0.5">por 100g</span>
                  </div>
                </div>

                {/* Macronutrientes Chips */}
                <div className="grid grid-cols-4 gap-1.5 text-center font-mono-numbers text-[10px]">
                  <div className="p-1.5 rounded-lg bg-[#1F142B] border border-violet-500/20">
                    <span className="text-[#B5A8C8] block text-[9px]">Carbos</span>
                    <span className="font-bold text-[#A78BFA]">{formatPtBr(carbs)}g</span>
                  </div>
                  <div className="p-1.5 rounded-lg bg-[#1F142B] border border-purple-500/20">
                    <span className="text-[#B5A8C8] block text-[9px]">Proteína</span>
                    <span className="font-bold text-[#C084FC]">{formatPtBr(protein)}g</span>
                  </div>
                  <div className="p-1.5 rounded-lg bg-[#1F142B] border border-rose-500/20">
                    <span className="text-[#B5A8C8] block text-[9px]">Gordura</span>
                    <span className="font-bold text-[#F472B6]">{formatPtBr(fat)}g</span>
                  </div>
                  <div className="p-1.5 rounded-lg bg-[#1F142B] border border-emerald-500/20">
                    <span className="text-[#B5A8C8] block text-[9px]">Fibras</span>
                    <span className="font-bold text-emerald-400">{formatPtBr(food.fiber ?? p100.fiber ?? 0)}g</span>
                  </div>
                </div>

                {/* Ações do Card */}
                <div className="pt-2 border-t border-[#2D1B3E] flex items-center justify-between gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleOpenConsume(food)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] text-white text-xs font-bold shadow-md shadow-[#8B5CF6]/20 hover:opacity-95 active:scale-95 transition-all cursor-pointer"
                  >
                    <Utensils className="w-3.5 h-3.5" />
                    <span>Adicionar à Refeição</span>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedFoodForDetails(food)}
                      className="p-1.5 rounded-lg bg-[#1F142B] border border-[#322046] text-[#B5A8C8] hover:text-[#FAF8FC] hover:border-[#8B5CF6] transition-colors cursor-pointer"
                      title="Ver detalhes nutricionais"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(food)}
                      className="p-1.5 rounded-lg bg-[#1F142B] border border-[#322046] text-[#B5A8C8] hover:text-[#FAF8FC] hover:border-[#8B5CF6] transition-colors cursor-pointer"
                      title="Editar alimento"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setFoodToDelete(food)}
                      className="p-1.5 rounded-lg bg-[#1F142B] border border-[#322046] text-rose-400/80 hover:text-rose-300 hover:border-rose-500/50 hover:bg-rose-950/20 transition-colors cursor-pointer"
                      title="Excluir alimento"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: CONSUMIR / ADICIONAR ALIMENTO A UMA REFEIÇÃO         */}
      {/* ============================================================ */}
      {consumingFood && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
          <div className="w-full max-w-lg bg-[#140E1B] border-t sm:border border-[#322046] rounded-t-3xl sm:rounded-3xl p-5 space-y-4 shadow-2xl max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#2D1B3E]">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-[#8B5CF6]/20 text-[#A78BFA] border border-[#8B5CF6]/30">
                  <Utensils className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#FAF8FC]">
                    Usar Alimento em Refeição
                  </h3>
                  <p className="text-[11px] text-[#B5A8C8]">
                    {consumingFood.name} {consumingFood.brand ? `(${consumingFood.brand})` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConsumingFood(null)}
                className="p-1.5 rounded-lg text-[#B5A8C8] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Seleção de Data e Refeição */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-[#B5A8C8] block">Para qual data?</label>
                <input
                  type="date"
                  value={consumeDate}
                  onChange={(e) => setConsumeDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#1A1224] border border-[#322046] text-xs text-[#FAF8FC] focus:outline-none focus:border-[#8B5CF6]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-[#B5A8C8] block">Qual refeição?</label>
                <select
                  value={consumeMealType}
                  onChange={(e) => setConsumeMealType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#1A1224] border border-[#322046] text-xs text-[#FAF8FC] focus:outline-none focus:border-[#8B5CF6] cursor-pointer"
                >
                  {slots.map((s) => (
                    <option key={s.id} value={s.id} className="bg-[#1A1224]">
                      {s.icon} {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quantidade em Gramas com Slider e Input */}
            <div className="p-4 rounded-2xl bg-[#181022] border border-[#2D1B3E] space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#FAF8FC]">
                  Quantidade consumida:
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="1"
                    max="2000"
                    value={consumeGrams}
                    onChange={(e) => setConsumeGrams(Math.max(1, parseFloat(e.target.value) || 1))}
                    className="w-20 px-2.5 py-1 text-center font-bold text-xs bg-[#120B19] border border-[#8B5CF6]/50 rounded-lg text-[#FAF8FC] focus:outline-none"
                  />
                  <span className="text-xs text-[#B5A8C8]">g</span>
                </div>
              </div>

              <input
                type="range"
                min="10"
                max="500"
                step="5"
                value={consumeGrams}
                onChange={(e) => setConsumeGrams(Number(e.target.value))}
                className="w-full accent-[#EC4899] cursor-pointer"
              />

              {/* Totais Calculados Automaticamente */}
              <div className="grid grid-cols-4 gap-1.5 pt-2 text-center font-mono-numbers">
                <div className="p-2 rounded-xl bg-[#120B19] border border-pink-500/30">
                  <span className="text-[9px] text-[#B5A8C8] block">Calorias</span>
                  <span className="text-xs font-bold text-[#EC4899]">{consumedTotals.calories} kcal</span>
                </div>
                <div className="p-2 rounded-xl bg-[#120B19] border border-violet-500/30">
                  <span className="text-[9px] text-[#B5A8C8] block">Carbos</span>
                  <span className="text-xs font-bold text-[#A78BFA]">{consumedTotals.carbs}g</span>
                </div>
                <div className="p-2 rounded-xl bg-[#120B19] border border-purple-500/30">
                  <span className="text-[9px] text-[#B5A8C8] block">Proteína</span>
                  <span className="text-xs font-bold text-[#C084FC]">{consumedTotals.protein}g</span>
                </div>
                <div className="p-2 rounded-xl bg-[#120B19] border border-rose-500/30">
                  <span className="text-[9px] text-[#B5A8C8] block">Gordura</span>
                  <span className="text-xs font-bold text-[#F472B6]">{consumedTotals.fat}g</span>
                </div>
              </div>
            </div>

            {/* Checkbox: Consumir agora vs. Adicionar como Planejado */}
            <div className="p-3 rounded-xl bg-[#160E1F] border border-[#2D1B3E] flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-[#FAF8FC] block">
                  Tipo de registro
                </span>
                <span className="text-[11px] text-[#B5A8C8]">
                  {consumeAsPlanned ? 'Ficará como planejado (sem somar nas calorias reais)' : 'Conta no consumo real do dia selecionado'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setConsumeAsPlanned(!consumeAsPlanned)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  consumeAsPlanned
                    ? 'bg-[#8B5CF6] text-white shadow-md'
                    : 'bg-[#1F142B] text-[#B5A8C8] border border-[#322046]'
                }`}
              >
                {consumeAsPlanned ? 'Planejado' : 'Consumido'}
              </button>
            </div>

            {/* Ações */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConsumingFood(null)}
                className="px-4 py-2.5 rounded-xl bg-[#1A1224] border border-[#322046] text-xs font-medium text-[#B5A8C8] hover:text-white cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmConsume}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#8B5CF6] to-[#EC4899] text-white text-xs font-bold shadow-lg shadow-[#8B5CF6]/30 hover:opacity-95 transition-all cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Confirmar e Adicionar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: CRIAR OU EDITAR ALIMENTO                             */}
      {/* ============================================================ */}
      {(isCreatingFood || editingFood) && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
          <form
            onSubmit={handleSaveForm}
            className="w-full max-w-lg bg-[#140E1B] border-t sm:border border-[#322046] rounded-t-3xl sm:rounded-3xl p-5 space-y-4 shadow-2xl max-h-[92dvh] overflow-y-auto pb-safe"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#2D1B3E]">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-gradient-to-tr from-[#6D28D9] to-[#EC4899] text-white">
                  <Apple className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#FAF8FC]">
                    {editingFood ? 'Editar Alimento' : 'Novo Alimento'}
                  </h3>
                  <p className="text-[11px] text-[#B5A8C8]">
                    Defina os valores nutricionais por 100g (Normas ANVISA)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingFood(null);
                  setIsCreatingFood(false);
                }}
                className="p-1.5 rounded-lg text-[#B5A8C8] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/50 text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Identificação */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#FAF8FC] block">
                  Nome do Alimento *
                </label>
                <input
                  type="text"
                  required
                  value={formFields.name}
                  onChange={(e) => setFormFields({ ...formFields, name: e.target.value })}
                  placeholder="Ex: Arroz Branco Cozido"
                  className="w-full px-3 py-2 rounded-xl bg-[#1A1224] border border-[#322046] text-xs text-[#FAF8FC] focus:outline-none focus:border-[#8B5CF6]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-[#B5A8C8] block">Marca (opcional)</label>
                <input
                  type="text"
                  value={formFields.brand}
                  onChange={(e) => setFormFields({ ...formFields, brand: e.target.value })}
                  placeholder="Ex: Tio João, Nestlé, etc."
                  className="w-full px-3 py-2 rounded-xl bg-[#1A1224] border border-[#322046] text-xs text-[#FAF8FC] focus:outline-none focus:border-[#8B5CF6]"
                />
              </div>
            </div>

            {/* Porção de Referência e Medida Caseira */}
            <div className="grid grid-cols-2 gap-2.5 p-3 rounded-2xl bg-[#181022] border border-[#2D1B3E]">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-[#B5A8C8] block">
                  Porção Referência (g/ml)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formFields.portionGrams}
                  onChange={(e) => setFormFields({ ...formFields, portionGrams: e.target.value })}
                  placeholder="100"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#120B19] border border-[#322046] text-xs font-bold text-[#FAF8FC] focus:outline-none focus:border-[#8B5CF6]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-[#B5A8C8] block">Medida Caseira</label>
                <input
                  type="text"
                  value={formFields.householdMeasure}
                  onChange={(e) => setFormFields({ ...formFields, householdMeasure: e.target.value })}
                  placeholder="Ex: 2 colheres de sopa"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#120B19] border border-[#322046] text-xs text-[#FAF8FC] focus:outline-none focus:border-[#8B5CF6]"
                />
              </div>
            </div>

            {/* Calorias por 100g */}
            <div className="p-3 rounded-2xl bg-gradient-to-r from-[#20102B] via-[#2A1438] to-[#20102B] border border-pink-500/40 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-[#EC4899]" />
                <span className="text-xs font-bold text-[#FAF8FC]">Valor Energético por 100g</span>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={formFields.calories}
                  onChange={(e) => setFormFields({ ...formFields, calories: e.target.value })}
                  placeholder="0"
                  className="w-20 px-2.5 py-1 text-right font-bold text-sm text-[#EC4899] bg-[#140E1B] border border-pink-500/50 rounded-lg focus:outline-none"
                />
                <span className="text-xs font-bold text-pink-300">kcal</span>
              </div>
            </div>

            {/* Macros por 100g */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2.5 rounded-xl bg-[#181022] border border-violet-500/30 space-y-1">
                <span className="text-[10px] font-semibold text-[#A78BFA] block">Carboidratos</span>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formFields.carbs}
                    onChange={(e) => setFormFields({ ...formFields, carbs: e.target.value })}
                    placeholder="0"
                    className="w-full bg-transparent text-xs font-bold text-[#FAF8FC] focus:outline-none"
                  />
                  <span className="text-[10px] text-[#B5A8C8]">g</span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-[#181022] border border-purple-500/30 space-y-1">
                <span className="text-[10px] font-semibold text-[#C084FC] block">Proteínas</span>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formFields.protein}
                    onChange={(e) => setFormFields({ ...formFields, protein: e.target.value })}
                    placeholder="0"
                    className="w-full bg-transparent text-xs font-bold text-[#FAF8FC] focus:outline-none"
                  />
                  <span className="text-[10px] text-[#B5A8C8]">g</span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-[#181022] border border-rose-500/30 space-y-1">
                <span className="text-[10px] font-semibold text-[#F472B6] block">Gorduras Totais</span>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formFields.fat}
                    onChange={(e) => setFormFields({ ...formFields, fat: e.target.value })}
                    placeholder="0"
                    className="w-full bg-transparent text-xs font-bold text-[#FAF8FC] focus:outline-none"
                  />
                  <span className="text-[10px] text-[#B5A8C8]">g</span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-[#181022] border border-emerald-500/30 space-y-1">
                <span className="text-[10px] font-semibold text-emerald-400 block">Fibras</span>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formFields.fiber}
                    onChange={(e) => setFormFields({ ...formFields, fiber: e.target.value })}
                    placeholder="0"
                    className="w-full bg-transparent text-xs font-bold text-[#FAF8FC] focus:outline-none"
                  />
                  <span className="text-[10px] text-[#B5A8C8]">g</span>
                </div>
              </div>
            </div>

            {/* Nutrientes adicionais */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="p-2 rounded-xl bg-[#160E1F] border border-[#2D1B3E] space-y-0.5">
                <span className="text-[10px] text-[#B5A8C8] block">Sódio</span>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formFields.sodium}
                    onChange={(e) => setFormFields({ ...formFields, sodium: e.target.value })}
                    placeholder="-"
                    className="w-full bg-transparent text-xs text-[#FAF8FC] focus:outline-none"
                  />
                  <span className="text-[10px] text-[#7B6E8F]">mg</span>
                </div>
              </div>

              <div className="p-2 rounded-xl bg-[#160E1F] border border-[#2D1B3E] space-y-0.5">
                <span className="text-[10px] text-[#B5A8C8] block">Gorduras Sat.</span>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formFields.saturatedFat}
                    onChange={(e) => setFormFields({ ...formFields, saturatedFat: e.target.value })}
                    placeholder="-"
                    className="w-full bg-transparent text-xs text-[#FAF8FC] focus:outline-none"
                  />
                  <span className="text-[10px] text-[#7B6E8F]">g</span>
                </div>
              </div>

              <div className="p-2 rounded-xl bg-[#160E1F] border border-[#2D1B3E] space-y-0.5">
                <span className="text-[10px] text-[#B5A8C8] block">Açúcares</span>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formFields.sugars}
                    onChange={(e) => setFormFields({ ...formFields, sugars: e.target.value })}
                    placeholder="-"
                    className="w-full bg-transparent text-xs text-[#FAF8FC] focus:outline-none"
                  />
                  <span className="text-[10px] text-[#7B6E8F]">g</span>
                </div>
              </div>
            </div>

            {/* Ações */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#2D1B3E]">
              <button
                type="button"
                onClick={() => {
                  setEditingFood(null);
                  setIsCreatingFood(false);
                }}
                className="px-4 py-2.5 rounded-xl bg-[#1A1224] border border-[#322046] text-xs font-medium text-[#B5A8C8] hover:text-white cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#8B5CF6] to-[#EC4899] text-white text-xs font-bold shadow-lg shadow-[#8B5CF6]/30 hover:opacity-95 transition-all cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Salvar Alimento</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: VER DETALHES NUTRICIONAIS COMPLETOS                   */}
      {/* ============================================================ */}
      {selectedFoodForDetails && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-[#140E1B] border-t sm:border border-[#322046] rounded-t-3xl sm:rounded-3xl p-5 space-y-4 shadow-2xl max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#2D1B3E]">
              <div className="min-w-0 flex-1 pr-2">
                <h3 className="text-base font-bold text-[#FAF8FC] truncate">
                  {selectedFoodForDetails.name}
                </h3>
                {selectedFoodForDetails.brand && (
                  <p className="text-xs text-[#B5A8C8]">{selectedFoodForDetails.brand}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedFoodForDetails(null)}
                className="p-1.5 rounded-lg text-[#B5A8C8] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Informações de Cadastro */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#1A1224] border border-[#2D1B3E] text-xs">
              <span className="text-[#B5A8C8]">Origem dos dados:</span>
              <span className="font-semibold text-[#A78BFA] flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>{selectedFoodForDetails.source || 'Banco Local'}</span>
              </span>
            </div>

            {/* Tabela de Nutrientes */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-[#FAF8FC]">
                Valores por 100g / 100ml:
              </h4>

              {(() => {
                const p100 = selectedFoodForDetails.per100g || {};
                const rows = [
                  { label: 'Valor Energético', value: `${formatPtBr(p100.calories ?? selectedFoodForDetails.calories)} kcal`, color: 'text-[#EC4899] font-bold' },
                  { label: 'Carboidratos', value: `${formatPtBr(p100.carbs ?? selectedFoodForDetails.carbs)} g`, color: 'text-[#A78BFA]' },
                  { label: 'Açúcares Totais', value: p100.sugars != null ? `${formatPtBr(p100.sugars)} g` : '-', color: 'text-[#B5A8C8]' },
                  { label: 'Proteínas', value: `${formatPtBr(p100.protein ?? selectedFoodForDetails.protein)} g`, color: 'text-[#C084FC] font-semibold' },
                  { label: 'Gorduras Totais', value: `${formatPtBr(p100.fat ?? selectedFoodForDetails.fat)} g`, color: 'text-[#F472B6]' },
                  { label: 'Gorduras Saturadas', value: p100.saturatedFat != null ? `${formatPtBr(p100.saturatedFat)} g` : '-', color: 'text-[#B5A8C8]' },
                  { label: 'Gorduras Trans', value: p100.transFat != null ? `${formatPtBr(p100.transFat)} g` : '-', color: 'text-[#B5A8C8]' },
                  { label: 'Fibra Alimentar', value: `${formatPtBr(p100.fiber ?? selectedFoodForDetails.fiber)} g`, color: 'text-emerald-400' },
                  { label: 'Sódio', value: p100.sodium != null ? `${formatPtBr(p100.sodium)} mg` : '-', color: 'text-[#B5A8C8]' },
                ];

                return (
                  <div className="divide-y divide-[#2D1B3E] rounded-2xl bg-[#181022] border border-[#2D1B3E] overflow-hidden text-xs">
                    {rows.map((r, i) => (
                      <div key={i} className="flex items-center justify-between px-3.5 py-2">
                        <span className="text-[#B5A8C8]">{r.label}</span>
                        <span className={`font-mono-numbers ${r.color}`}>{r.value}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            <div className="pt-2 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSelectedFoodForDetails(null)}
                className="w-full px-4 py-2.5 rounded-xl bg-[#1A1224] border border-[#322046] text-xs font-semibold text-[#FAF8FC] hover:bg-[#251934] transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: CONFIRMAÇÃO DE EXCLUSÃO DE ALIMENTO                   */}
      {/* ============================================================ */}
      {foodToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-[#140E1B] border border-rose-500/40 rounded-3xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#FAF8FC]">
                  Excluir Alimento Salvo?
                </h3>
                <p className="text-xs text-[#B5A8C8]">
                  {foodToDelete.name}
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#1A1224] border border-[#322046] text-xs space-y-2">
              <p className="text-[#FAF8FC] font-semibold">
                Tem certeza de que deseja excluir este alimento?
              </p>
              <p className="text-[11px] text-emerald-300">
                ✓ Seus registros e refeições anteriores continuarão 100% preservados com os valores nutricionais salvos na data em que foram consumidos.
              </p>

              {(() => {
                const futurePlans = checkFoodUsageInFuturePlans(foodToDelete);
                if (futurePlans.length > 0) {
                  return (
                    <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/50 text-amber-200 text-[11px] space-y-1 mt-2">
                      <div className="flex items-center gap-1.5 font-bold text-amber-300">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Atenção: alimento em planejamento futuro</span>
                      </div>
                      <p>
                        Este alimento está presente em {futurePlans.length} refeição(ões) planejada(s) futura(s). Os planos existentes manterão suas cópias nutricionais.
                      </p>
                    </div>
                  );
                }
                return null;
              })()}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setFoodToDelete(null)}
                className="px-4 py-2 rounded-xl bg-[#1A1224] border border-[#322046] text-xs font-medium text-[#B5A8C8] hover:text-white cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-all cursor-pointer"
              >
                Sim, Excluir Alimento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
