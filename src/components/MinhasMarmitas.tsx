import React, { useState, useRef } from 'react';
import {
  Utensils,
  Plus,
  Trash2,
  Calendar,
  Check,
  Edit2,
  Camera,
  Upload,
  ChefHat,
  Sparkles,
  ChevronRight,
  X,
} from 'lucide-react';
import { Marmita, MarmitaItem, MealType, PrepState, MealSlot } from '../types';
import { INITIAL_MEAL_SLOTS } from '../services/storage';
import { TACO_TBCA_DATABASE, calculateNutritionalValues } from '../data/nutritionDatabase';

interface MinhasMarmitasProps {
  marmitas: Marmita[];
  mealSlots?: MealSlot[];
  onSaveMarmita: (marmita: Marmita) => void;
  onDeleteMarmita: (id: string) => void;
  onLogMarmitaToMeal: (marmita: Marmita, mealType: MealType) => void;
  onAddToWeeklyPlan: (marmita: Marmita, day: string, mealType: MealType) => void;
}

export const MinhasMarmitas: React.FC<MinhasMarmitasProps> = ({
  marmitas,
  mealSlots,
  onSaveMarmita,
  onDeleteMarmita,
  onLogMarmitaToMeal,
  onAddToWeeklyPlan,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMarmita, setEditingMarmita] = useState<Marmita | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [prepNotes, setPrepNotes] = useState('');
  const [items, setItems] = useState<MarmitaItem[]>([]);

  // Item addition state
  const [selectedDbFoodId, setSelectedDbFoodId] = useState(TACO_TBCA_DATABASE[0].id);
  const [itemWeight, setItemWeight] = useState<number>(100);

  // Consume today modal state
  const [consumeModalMarmita, setConsumeModalMarmita] = useState<Marmita | null>(null);
  const [selectedMealType, setSelectedMealType] = useState<MealType>('almoco');

  const slots = mealSlots && mealSlots.length ? mealSlots : INITIAL_MEAL_SLOTS;
  const [showToast, setShowToast] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const openNewMarmitaModal = () => {
    setEditingMarmita(null);
    setName('');
    setDescription('');
    setPhotoUrl('/src/assets/images/marmita_prep_dish_1794179957885.jpg');
    setPrepNotes('');
    setItems([
      {
        id: `item-${Date.now()}-1`,
        foodName: 'Peito de frango grelhado',
        prepState: 'grelhado',
        weightGrams: 130,
        calories: 207,
        protein: 41.6,
        carbs: 0,
        fat: 3.3,
        fiber: 0,
      },
      {
        id: `item-${Date.now()}-2`,
        foodName: 'Arroz integral cozido',
        prepState: 'cozido',
        weightGrams: 100,
        calories: 124,
        protein: 2.6,
        carbs: 25.8,
        fat: 1.0,
        fiber: 2.7,
      },
    ]);
    setIsModalOpen(true);
  };

  const openEditModal = (m: Marmita) => {
    setEditingMarmita(m);
    setName(m.name);
    setDescription(m.description);
    setPhotoUrl(m.photoUrl || '');
    setPrepNotes(m.prepNotes || '');
    setItems([...m.items]);
    setIsModalOpen(true);
  };

  const handleAddItemToMarmita = () => {
    const dbFood = TACO_TBCA_DATABASE.find((f) => f.id === selectedDbFoodId) || TACO_TBCA_DATABASE[0];
    const calc = calculateNutritionalValues(dbFood, itemWeight);

    const newItem: MarmitaItem = {
      id: `m-item-${Date.now()}`,
      foodName: dbFood.name,
      prepState: dbFood.prepState,
      weightGrams: itemWeight,
      calories: calc.calories,
      protein: calc.protein,
      carbs: calc.carbs,
      fat: calc.fat,
      fiber: calc.fiber,
    };

    setItems((prev) => [...prev, newItem]);
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setPhotoUrl(ev.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  // Sum totals automatically
  const totalCalories = items.reduce((acc, it) => acc + it.calories, 0);
  const totalProtein = Number(items.reduce((acc, it) => acc + it.protein, 0).toFixed(1));
  const totalCarbs = Number(items.reduce((acc, it) => acc + it.carbs, 0).toFixed(1));
  const totalFat = Number(items.reduce((acc, it) => acc + it.fat, 0).toFixed(1));
  const totalFiber = Number(items.reduce((acc, it) => acc + it.fiber, 0).toFixed(1));

  const handleSave = () => {
    if (!name.trim()) return;

    const marmitaToSave: Marmita = {
      id: editingMarmita ? editingMarmita.id : `marmita-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      photoUrl: photoUrl || undefined,
      prepNotes: prepNotes.trim(),
      items: items,
      totalCalories,
      totalProtein,
      totalCarbs,
      totalFat,
      totalFiber,
      createdAt: editingMarmita ? editingMarmita.createdAt : new Date().toISOString(),
    };

    onSaveMarmita(marmitaToSave);
    setIsModalOpen(false);
  };

  const handleConfirmConsume = () => {
    if (consumeModalMarmita) {
      onLogMarmitaToMeal(consumeModalMarmita, selectedMealType);
      setConsumeModalMarmita(null);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    }
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-12">
      {/* Header Banner */}
      <div className="rounded-3xl bg-gradient-to-br from-[#18121F] via-[#100C16] to-[#09070D] border border-[#33263F] p-4 sm:p-6 lg:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#8B5CF6] uppercase tracking-wider mb-1">
            <Utensils className="w-4 h-4" />
            <span>Meal Prep & Marmitas</span>
          </div>
          <h1 className="font-heading text-xl sm:text-2xl lg:text-3xl font-bold text-[#F8F5FC]">
            Minhas Marmitas 💜
          </h1>
          <p className="text-xs sm:text-sm text-[#B8AFC4] mt-1 max-w-xl">
            Organize suas marmitas com ingredientes pesados individualmente e soma matemática automática de calorias e macros.
          </p>
        </div>

        <button
          onClick={openNewMarmitaModal}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] hover:from-[#7C3AED] hover:to-[#A78BFA] text-white text-xs font-bold shadow-lg shadow-[#8B5CF6]/30 transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Criar Nova Marmita</span>
        </button>
      </div>

      {showToast && (
        <div className="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs text-center flex items-center justify-center gap-2">
          <Check className="w-4 h-4" />
          <span>Marmita registrada no seu dia com sucesso! 💜</span>
        </div>
      )}

      {/* Marmitas Grid */}
      {marmitas.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-[#18121F] border border-[#33263F] space-y-3">
          <Utensils className="w-12 h-12 text-[#A78BFA] mx-auto opacity-60" />
          <h3 className="text-base font-semibold text-[#F8F5FC]">
            Nenhuma marmita cadastrada ainda
          </h3>
          <p className="text-xs text-[#B8AFC4] max-w-md mx-auto">
            Cadastre sua primeira combinação de refeição planejada para facilitar sua rotina da semana.
          </p>
          <button
            onClick={openNewMarmitaModal}
            className="px-4 py-2 rounded-xl bg-[#8B5CF6] text-white text-xs font-bold"
          >
            Cadastrar Minha Primeira Marmita
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {marmitas.map((m) => (
            <div
              key={m.id}
              className="rounded-2xl bg-[#18121F] border border-[#33263F] overflow-hidden flex flex-col justify-between transition-all hover:border-[#8B5CF6]/50 shadow-md"
            >
              <div>
                {/* Photo Header */}
                <div className="relative h-44 w-full bg-[#100C16] overflow-hidden">
                  <img
                    src={m.photoUrl || '/src/assets/images/marmita_prep_dish_1794179957885.jpg'}
                    alt={m.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#18121F] via-transparent to-black/30" />
                  <div className="absolute top-3 right-3 flex items-center gap-1.5">
                    <button
                      onClick={() => openEditModal(m)}
                      className="p-2 rounded-xl bg-black/60 backdrop-blur-md text-[#F8F5FC] hover:text-[#A78BFA] border border-[#33263F] transition-colors"
                      title="Editar Marmita"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDeleteMarmita(m.id)}
                      className="p-2 rounded-xl bg-black/60 backdrop-blur-md text-[#F8F5FC] hover:text-rose-400 border border-[#33263F] transition-colors"
                      title="Excluir Marmita"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="absolute bottom-3 left-3 right-3 flex items-baseline justify-between text-white font-mono-numbers">
                    <span className="text-xl font-bold text-[#F8F5FC]">
                      {m.totalCalories} <span className="text-xs text-[#B8AFC4]">kcal</span>
                    </span>
                    <span className="text-xs text-[#A78BFA]">
                      {m.items.length} ingredientes
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 space-y-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#F8F5FC]">{m.name}</h3>
                    {m.description && (
                      <p className="text-xs text-[#B8AFC4] mt-1 leading-relaxed">
                        {m.description}
                      </p>
                    )}
                  </div>

                  {/* Macros Strip */}
                  <div className="grid grid-cols-4 gap-1.5 p-2 rounded-xl bg-[#100C16] border border-[#33263F] text-center font-mono-numbers">
                    <div>
                      <span className="text-[9px] text-[#B8AFC4] block">Prot</span>
                      <span className="text-xs font-bold text-[#8B5CF6]">{m.totalProtein}g</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-[#B8AFC4] block">Carb</span>
                      <span className="text-xs font-bold text-[#EC4899]">{m.totalCarbs}g</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-[#B8AFC4] block">Gord</span>
                      <span className="text-xs font-bold text-[#F472B6]">{m.totalFat}g</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-[#B8AFC4] block">Fibras</span>
                      <span className="text-xs font-bold text-[#38BDF8]">{m.totalFiber}g</span>
                    </div>
                  </div>

                  {/* Ingredients Breakdown */}
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-semibold text-[#B8AFC4] tracking-wider block">
                      Ingredientes Pesados:
                    </span>
                    <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                      {m.items.map((it) => (
                        <div
                          key={it.id}
                          className="flex items-center justify-between text-xs text-[#B8AFC4]"
                        >
                          <span className="truncate max-w-[170px]">{it.foodName}</span>
                          <span className="font-mono-numbers text-[#F8F5FC] font-medium">
                            {it.weightGrams}g ({it.calories} kcal)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {m.prepNotes && (
                    <div className="p-2.5 rounded-xl bg-[#100C16] text-[11px] text-[#B8AFC4] italic">
                      " {m.prepNotes} "
                    </div>
                  )}
                </div>
              </div>

              {/* Action Button */}
              <div className="p-4 pt-0">
                <button
                  onClick={() => setConsumeModalMarmita(m)}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] hover:from-[#7C3AED] hover:to-[#A78BFA] text-white text-xs font-semibold shadow-md shadow-[#8B5CF6]/20 flex items-center justify-center gap-1.5 transition-transform active:scale-98 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Consumir Hoje no Meu Dia</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CREATE / EDIT MARMITA MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-[#18121F] border-t sm:border border-[#33263F] rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 pb-safe shadow-2xl my-0 sm:my-8 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#33263F]">
              <h2 className="text-base font-bold text-[#F8F5FC]">
                {editingMarmita ? 'Editar Marmita' : 'Nova Marmita Planejada 💜'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-[#B8AFC4] hover:text-[#F8F5FC]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 max-h-[75vh] overflow-y-auto pr-1">
              {/* Name & Description */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#B8AFC4]">Nome da Marmita:</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Marmita de Frango Grelhado, Purê de Mandioca e Brócolis"
                  className="w-full px-3 py-2 rounded-xl bg-[#100C16] border border-[#33263F] text-xs text-[#F8F5FC] focus:outline-none focus:border-[#8B5CF6]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[#B8AFC4]">Descrição breve:</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Porção rica em proteínas com legumes frescos"
                  className="w-full px-3 py-2 rounded-xl bg-[#100C16] border border-[#33263F] text-xs text-[#F8F5FC]"
                />
              </div>

              {/* Photo Input */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#B8AFC4]">Fotografia da Marmita:</label>
                <div className="flex items-center gap-3">
                  {photoUrl && (
                    <img
                      src={photoUrl}
                      alt="Prévia"
                      className="w-14 h-14 object-cover rounded-xl border border-[#33263F]"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#100C16] border border-[#33263F] text-xs text-[#A78BFA] hover:text-[#F8F5FC]"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Upload ou Foto</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </div>
              </div>

              {/* INGREDIENTS LIST & ADDER */}
              <div className="p-4 rounded-2xl bg-[#100C16] border border-[#33263F] space-y-3">
                <h4 className="text-xs font-bold text-[#F8F5FC] uppercase tracking-wider">
                  Ingredientes & Pesos Individuais
                </h4>

                {/* Add new ingredient row */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                  <div className="sm:col-span-7 space-y-1">
                    <label className="text-[11px] text-[#B8AFC4]">Selecionar Alimento (TACO):</label>
                    <select
                      value={selectedDbFoodId}
                      onChange={(e) => setSelectedDbFoodId(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#18121F] border border-[#33263F] text-xs text-[#F8F5FC]"
                    >
                      {TACO_TBCA_DATABASE.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.prepState})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-3 space-y-1">
                    <label className="text-[11px] text-[#B8AFC4]">Peso (g):</label>
                    <input
                      type="number"
                      min="1"
                      max="1500"
                      value={itemWeight}
                      onChange={(e) => setItemWeight(Math.max(1, parseFloat(e.target.value) || 0))}
                      className="w-full px-2 py-1.5 rounded-lg bg-[#18121F] border border-[#33263F] text-xs font-mono-numbers text-center text-[#F8F5FC]"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddItemToMarmita}
                      className="w-full py-1.5 rounded-lg bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-xs font-semibold"
                    >
                      Adicionar
                    </button>
                  </div>
                </div>

                {/* Added items list */}
                <div className="space-y-1.5 pt-2">
                  {items.map((it) => (
                    <div
                      key={it.id}
                      className="p-2.5 rounded-xl bg-[#18121F] border border-[#33263F] flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-semibold text-[#F8F5FC]">{it.foodName}</span>
                        <span className="text-[#B8AFC4] ml-2 font-mono-numbers">
                          {it.weightGrams}g · {it.calories} kcal · P: {it.protein}g · C: {it.carbs}g · G: {it.fat}g
                        </span>
                      </div>
                      <button
                        onClick={() => handleRemoveItem(it.id)}
                        className="p-1 text-[#B8AFC4] hover:text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Auto Calculated Sum */}
                <div className="p-3 rounded-xl bg-[#18121F] border border-[#8B5CF6]/40 flex items-center justify-between font-mono-numbers">
                  <span className="text-xs text-[#B8AFC4]">Total da Marmita:</span>
                  <div className="text-right">
                    <span className="text-sm font-bold text-[#EC4899]">{totalCalories} kcal</span>
                    <span className="text-xs text-[#A78BFA] block">
                      P: {totalProtein}g · C: {totalCarbs}g · G: {totalFat}g · Fibra: {totalFiber}g
                    </span>
                  </div>
                </div>
              </div>

              {/* Prep Notes */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#B8AFC4]">Modo de Preparo e Dicas:</label>
                <textarea
                  rows={2}
                  value={prepNotes}
                  onChange={(e) => setPrepNotes(e.target.value)}
                  placeholder="Ex: Grelhar o frango com alho e limão. Deixar o brócolis apenas 4 min no vapor..."
                  className="w-full px-3 py-2 rounded-xl bg-[#100C16] border border-[#33263F] text-xs text-[#F8F5FC]"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-[#33263F] flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#100C16] border border-[#33263F] text-xs text-[#B8AFC4]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!name.trim() || items.length === 0}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#EC4899] text-white text-xs font-bold shadow-md disabled:opacity-50"
              >
                Salvar Marmita
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONSUME TODAY MODAL */}
      {consumeModalMarmita && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-md bg-[#18121F] border-t sm:border border-[#33263F] rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 pb-safe shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <h3 className="text-base font-bold text-[#F8F5FC]">
              Consumir Marmita no Meu Dia 💜
            </h3>
            <p className="text-xs text-[#B8AFC4]">
              Você selecionou: <strong>{consumeModalMarmita.name}</strong> ({consumeModalMarmita.totalCalories} kcal).
            </p>

            <div className="space-y-1.5">
              <label className="text-xs text-[#B8AFC4]">Em qual refeição de hoje?</label>
              <div className="grid grid-cols-2 gap-2">
                {slots.map((slot) => (
                  <button
                    key={slot.id}
                    onClick={() => setSelectedMealType(slot.id)}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold text-center transition-colors ${
                      selectedMealType === slot.id
                        ? 'bg-[#8B5CF6] text-white shadow-md shadow-[#8B5CF6]/30'
                        : 'bg-[#100C16] text-[#B8AFC4] border border-[#33263F]'
                    }`}
                  >
                    {slot.icon} {slot.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setConsumeModalMarmita(null)}
                className="px-4 py-2 rounded-xl bg-[#100C16] text-xs text-[#B8AFC4]"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmConsume}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#EC4899] text-white text-xs font-bold"
              >
                Confirmar Registro
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
