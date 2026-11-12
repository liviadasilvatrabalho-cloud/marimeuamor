import React, { useState, useRef } from 'react';
import {
  BookOpen,
  Plus,
  Heart,
  Clock,
  Sparkles,
  ChefHat,
  Search,
  Trash2,
  Edit2,
  X,
  Upload,
  RefreshCw,
  Lightbulb,
  MessageSquare,
} from 'lucide-react';
import { Recipe, RecipeIngredient, MealType } from '../types';
import { AiChefChatModal } from './AiChefChatModal';

interface LivroReceitasProps {
  recipes: Recipe[];
  onSaveRecipe: (recipe: Recipe) => void;
  onDeleteRecipe: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onLogRecipeToMeal: (recipe: Recipe, mealType: MealType) => void;
}

export const LivroReceitas: React.FC<LivroReceitasProps> = ({
  recipes,
  onSaveRecipe,
  onDeleteRecipe,
  onToggleFavorite,
  onLogRecipeToMeal,
}) => {
  const [search, setSearch] = useState('');
  const [filterFavorites, setFilterFavorites] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);

  // AI Chat Assistant modal state (ChatGPT / Gemini style)
  const [isChefChatOpen, setIsChefChatOpen] = useState(false);

  // AI Assistant modal state (structured form generator)
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [aiMode, setAiMode] = useState<'create' | 'substitute'>('create');
  const [aiIngredients, setAiIngredients] = useState('');
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPhotoUrl, setFormPhotoUrl] = useState('');
  const [formPrepTime, setFormPrepTime] = useState(20);
  const [formServings, setFormServings] = useState(2);
  const [formCalories, setFormCalories] = useState(280);
  const [formProtein, setFormProtein] = useState(24);
  const [formCarbs, setFormCarbs] = useState(30);
  const [formFat, setFormFat] = useState(6);
  const [formFiber, setFormFiber] = useState(4);
  const [formIngredients, setFormIngredients] = useState<RecipeIngredient[]>([
    { name: 'Ovo de galinha', amount: '2 unidades' },
  ]);
  const [formInstructions, setFormInstructions] = useState<string[]>([
    'Misture os ingredientes em uma tigela...',
  ]);
  const [formTip, setFormTip] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filteredRecipes = recipes.filter((r) => {
    const matchesSearch = r.title.toLowerCase().includes(search.toLowerCase());
    const matchesFav = !filterFavorites || r.isFavorite;
    return matchesSearch && matchesFav;
  });

  const openNewRecipe = () => {
    setEditingRecipe(null);
    setFormTitle('');
    setFormDescription('');
    setFormPhotoUrl('/src/assets/images/hero_kitchen_cover_1794179944769.jpg');
    setFormPrepTime(20);
    setFormServings(2);
    setFormCalories(280);
    setFormProtein(24);
    setFormCarbs(30);
    setFormFat(6);
    setFormFiber(4);
    setFormIngredients([
      { name: 'Peito de frango cozido desfiado', amount: '150g' },
      { name: 'Iogurte natural desnatado', amount: '1 pote (170g)' },
    ]);
    setFormInstructions([
      'Em um recipiente, desfie o frango e misture o iogurte...',
      'Tempere a gosto com sal rosa, cebolinha e noz-moscada...',
    ]);
    setFormTip('Sirva geladinho com fatias de pão integral! 💜');
    setIsEditorOpen(true);
  };

  const openEditRecipe = (r: Recipe) => {
    setEditingRecipe(r);
    setFormTitle(r.title);
    setFormDescription(r.description || '');
    setFormPhotoUrl(r.photoUrl || '');
    setFormPrepTime(r.prepTimeMinutes);
    setFormServings(r.servings);
    setFormCalories(r.caloriesPerServing);
    setFormProtein(r.proteinPerServing);
    setFormCarbs(r.carbsPerServing);
    setFormFat(r.fatPerServing);
    setFormFiber(r.fiberPerServing);
    setFormIngredients([...r.ingredients]);
    setFormInstructions([...r.instructions]);
    setFormTip(r.carinhoTip || '');
    setIsEditorOpen(true);
  };

  const handleSaveRecipe = () => {
    if (!formTitle.trim()) return;

    const recipe: Recipe = {
      id: editingRecipe ? editingRecipe.id : `recipe-${Date.now()}`,
      title: formTitle.trim(),
      description: formDescription.trim(),
      photoUrl: formPhotoUrl || undefined,
      prepTimeMinutes: formPrepTime,
      servings: formServings,
      caloriesPerServing: formCalories,
      proteinPerServing: formProtein,
      carbsPerServing: formCarbs,
      fatPerServing: formFat,
      fiberPerServing: formFiber,
      isFavorite: editingRecipe ? editingRecipe.isFavorite : false,
      ingredients: formIngredients,
      instructions: formInstructions,
      carinhoTip: formTip.trim() || undefined,
      createdAt: editingRecipe ? editingRecipe.createdAt : new Date().toISOString(),
    };

    onSaveRecipe(recipe);
    setIsEditorOpen(false);
  };

  const callAiAssistant = async () => {
    setAiLoading(true);
    setAiResult(null);

    try {
      const res = await fetch('/api/gemini/recipe-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: aiMode,
          ingredients: aiIngredients,
          question: aiQuestion,
          recipeName: selectedRecipe?.title,
        }),
      });

      const data = await res.json();
      setAiResult(data);
    } catch (e) {
      console.error('Erro na IA de receitas:', e);
    } finally {
      setAiLoading(false);
    }
  };

  const applyAiRecipeToForm = (aiData: any) => {
    setFormTitle(aiData.title || 'Receita Criada por IA');
    setFormDescription(aiData.description || '');
    setFormPrepTime(aiData.prepTimeMinutes || 25);
    setFormServings(aiData.servings || 2);
    setFormCalories(aiData.caloriesPerServing || 300);
    setFormProtein(aiData.proteinPerServing || 25);
    setFormCarbs(aiData.carbsPerServing || 30);
    setFormFat(aiData.fatPerServing || 7);
    setFormFiber(aiData.fiberPerServing || 4);
    setFormIngredients(aiData.ingredients || []);
    setFormInstructions(aiData.steps || []);
    setFormTip(aiData.carinhoTip || '');
    setIsAiAssistantOpen(false);
    setIsEditorOpen(true);
  };

  const handleApplyRecipeFromChat = (suggested: any) => {
    setEditingRecipe(null);
    setFormTitle(suggested.title || '');
    setFormDescription(suggested.description || '');
    setFormPhotoUrl('/src/assets/images/hero_kitchen_cover_1794179944769.jpg');
    setFormPrepTime(suggested.prepTimeMinutes || 25);
    setFormServings(suggested.servings || 2);
    setFormCalories(suggested.caloriesPerServing || 300);
    setFormProtein(suggested.proteinPerServing || 25);
    setFormCarbs(suggested.carbsPerServing || 30);
    setFormFat(suggested.fatPerServing || 8);
    setFormFiber(suggested.fiberPerServing || 4);
    if (suggested.ingredients && suggested.ingredients.length > 0) {
      setFormIngredients(suggested.ingredients);
    }
    if (suggested.instructions && suggested.instructions.length > 0) {
      setFormInstructions(suggested.instructions);
    }
    setFormTip(suggested.carinhoTip || 'Criada com ajuda do Chef da Mari IA 💜');
    setIsEditorOpen(true);
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-12">
      {/* Banner */}
      <div className="rounded-3xl bg-gradient-to-br from-[#18121F] via-[#100C16] to-[#09070D] border border-[#33263F] p-4 sm:p-6 lg:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#EC4899] uppercase tracking-wider mb-1">
            <BookOpen className="w-4 h-4" />
            <span>Livro Pessoal de Receitas</span>
          </div>
          <h1 className="font-heading text-xl sm:text-2xl lg:text-3xl font-bold text-[#F8F5FC]">
            Receitas da Mari 💜
          </h1>
          <p className="text-xs sm:text-sm text-[#B8AFC4] mt-1 max-w-xl">
            Suas receitas saudáveis prediletas com cálculo exato de calorias por porção e assistente culinário inteligente.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 shrink-0 w-full sm:w-auto">
          {/* Main button: Conversar com o Chef IA estilo Gemini / ChatGPT */}
          <button
            onClick={() => setIsChefChatOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#6D28D9] via-[#8B5CF6] to-[#EC4899] text-white text-xs font-bold shadow-lg shadow-[#8B5CF6]/30 hover:opacity-95 transition-all cursor-pointer active:scale-95"
          >
            <Sparkles className="w-4 h-4 text-pink-200 animate-pulse" />
            <span>Chef IA (Chat) 💬</span>
          </button>

          <button
            onClick={openNewRecipe}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-[#18121F] hover:bg-[#22192C] text-[#F8F5FC] border border-[#33263F] hover:border-[#8B5CF6]/50 text-xs font-semibold cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4 text-[#A78BFA]" />
            <span>Nova Receita</span>
          </button>
        </div>
      </div>

      {/* AI Chef Interactive Chat Card Banner */}
      <div
        onClick={() => setIsChefChatOpen(true)}
        className="p-3.5 sm:p-4 rounded-3xl bg-gradient-to-r from-[#18121F] via-[#231730] to-[#18121F] border border-[#8B5CF6]/40 hover:border-[#EC4899]/70 flex items-center justify-between gap-3 cursor-pointer group transition-all shadow-md active:scale-[0.99]"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-tr from-[#6D28D9] via-[#8B5CF6] to-[#EC4899] p-0.5 flex items-center justify-center shadow-md shadow-[#8B5CF6]/30 shrink-0 group-hover:scale-105 transition-transform">
            <div className="w-full h-full rounded-2xl bg-[#100C16] flex items-center justify-center">
              <ChefHat className="w-5 h-5 text-[#EC4899]" />
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-xs sm:text-sm font-bold text-[#F8F5FC] group-hover:text-[#A78BFA] transition-colors">
                Chef da Mari · Assistente IA
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-[#EC4899]/20 text-[#EC4899] text-[9px] font-bold uppercase tracking-wider border border-[#EC4899]/30">
                Como ChatGPT / Gemini
              </span>
            </div>
            <p className="text-[11px] text-[#B8AFC4] mt-0.5 truncate">
              Converse, peça dicas de preparo, ideias de pratos com o que tem em casa e substituições!
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#100C16] border border-[#8B5CF6]/30 text-xs font-bold text-[#A78BFA] group-hover:border-[#EC4899]/50 group-hover:text-[#F8F5FC] shrink-0 transition-colors">
          <span className="hidden sm:inline">Abrir conversa</span>
          <span>→</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar receita por nome..."
            className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#18121F] border border-[#33263F] text-xs text-[#F8F5FC] focus:outline-none focus:border-[#8B5CF6]"
          />
          <Search className="w-4 h-4 text-[#B8AFC4] absolute left-3 top-3" />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterFavorites(!filterFavorites)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium border transition-colors ${
              filterFavorites
                ? 'bg-[#EC4899]/20 text-[#F472B6] border-[#EC4899]'
                : 'bg-[#18121F] text-[#B8AFC4] border-[#33263F]'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${filterFavorites ? 'fill-[#EC4899]' : ''}`} />
            <span>Apenas Favoritas ({recipes.filter((r) => r.isFavorite).length})</span>
          </button>
        </div>
      </div>

      {/* Recipes Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredRecipes.map((recipe) => (
          <div
            key={recipe.id}
            onClick={() => setSelectedRecipe(recipe)}
            className="rounded-2xl bg-[#18121F] border border-[#33263F] overflow-hidden flex flex-col justify-between transition-all hover:border-[#8B5CF6]/60 cursor-pointer group shadow-md"
          >
            <div>
              {/* Image banner */}
              <div className="relative h-44 w-full bg-[#100C16] overflow-hidden">
                <img
                  src={recipe.photoUrl || '/src/assets/images/hero_kitchen_cover_1794179944769.jpg'}
                  alt={recipe.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#18121F] via-transparent to-black/30" />

                {/* Heart Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(recipe.id);
                  }}
                  className="absolute top-3 right-3 p-2 rounded-xl bg-black/50 backdrop-blur-md text-white hover:text-[#EC4899] transition-colors"
                >
                  <Heart
                    className={`w-4 h-4 ${recipe.isFavorite ? 'fill-[#EC4899] text-[#EC4899]' : ''}`}
                  />
                </button>

                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-white text-xs">
                  <div className="flex items-center gap-1.5 font-medium">
                    <Clock className="w-3.5 h-3.5 text-[#A78BFA]" />
                    <span>{recipe.prepTimeMinutes} min</span>
                  </div>
                  <span className="font-mono-numbers font-bold text-sm text-[#F472B6]">
                    {recipe.caloriesPerServing} kcal/porção
                  </span>
                </div>
              </div>

              {/* Info */}
              <div className="p-4 space-y-2.5">
                <h3 className="text-sm font-bold text-[#F8F5FC] group-hover:text-[#A78BFA] transition-colors">
                  {recipe.title}
                </h3>
                {recipe.description && (
                  <p className="text-xs text-[#B8AFC4] line-clamp-2">
                    {recipe.description}
                  </p>
                )}

                {/* Macros per serving */}
                <div className="grid grid-cols-4 gap-1 p-2 rounded-xl bg-[#100C16] text-center font-mono-numbers text-[10px]">
                  <div>
                    <span className="text-[#B8AFC4] block">Prot</span>
                    <span className="font-bold text-[#8B5CF6]">{recipe.proteinPerServing}g</span>
                  </div>
                  <div>
                    <span className="text-[#B8AFC4] block">Carb</span>
                    <span className="font-bold text-[#EC4899]">{recipe.carbsPerServing}g</span>
                  </div>
                  <div>
                    <span className="text-[#B8AFC4] block">Gord</span>
                    <span className="font-bold text-[#F472B6]">{recipe.fatPerServing}g</span>
                  </div>
                  <div>
                    <span className="text-[#B8AFC4] block">Fibras</span>
                    <span className="font-bold text-[#38BDF8]">{recipe.fiberPerServing}g</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 pt-0 flex items-center justify-between text-xs text-[#A78BFA]">
              <span>Ver detalhes completos</span>
              <span>→</span>
            </div>
          </div>
        ))}
      </div>

      {/* RECIPE DETAIL MODAL */}
      {selectedRecipe && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-[#18121F] border-t sm:border border-[#33263F] rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 pb-safe shadow-2xl my-0 sm:my-8 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#33263F]">
              <div className="flex items-center gap-2 min-w-0">
                <ChefHat className="w-5 h-5 text-[#EC4899] shrink-0" />
                <h2 className="text-base font-bold text-[#F8F5FC] truncate">
                  {selectedRecipe.title}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    openEditRecipe(selectedRecipe);
                    setSelectedRecipe(null);
                  }}
                  className="p-2 rounded-xl bg-[#100C16] text-[#B8AFC4] hover:text-[#A78BFA]"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    onDeleteRecipe(selectedRecipe.id);
                    setSelectedRecipe(null);
                  }}
                  className="p-2 rounded-xl bg-[#100C16] text-[#B8AFC4] hover:text-rose-400"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setSelectedRecipe(null)}
                  className="p-2 rounded-xl text-[#B8AFC4] hover:text-[#F8F5FC]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {/* Photo & Key Metrics */}
              {selectedRecipe.photoUrl && (
                <img
                  src={selectedRecipe.photoUrl}
                  alt={selectedRecipe.title}
                  className="w-full h-48 object-cover rounded-2xl"
                />
              )}

              <div className="p-4 rounded-2xl bg-[#100C16] border border-[#33263F] flex items-center justify-between font-mono-numbers">
                <div>
                  <span className="text-xs text-[#B8AFC4]">Tempo & Rendimento:</span>
                  <div className="text-xs text-[#F8F5FC] font-bold mt-0.5">
                    {selectedRecipe.prepTimeMinutes} min · {selectedRecipe.servings} porções
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs text-[#B8AFC4]">Por porção:</span>
                  <div className="text-base font-bold text-[#EC4899]">
                    {selectedRecipe.caloriesPerServing} kcal
                  </div>
                  <span className="text-[10px] text-[#A78BFA]">
                    P:{selectedRecipe.proteinPerServing}g · C:{selectedRecipe.carbsPerServing}g · G:{selectedRecipe.fatPerServing}g
                  </span>
                </div>
              </div>

              {/* Ingredients list */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-[#F8F5FC] uppercase tracking-wider">
                  Ingredientes Necessários:
                </h4>
                <div className="space-y-1">
                  {selectedRecipe.ingredients.map((ing, i) => (
                    <div
                      key={i}
                      className="p-2.5 rounded-xl bg-[#100C16] text-xs flex items-center justify-between"
                    >
                      <span className="text-[#F8F5FC] font-medium">{ing.name}</span>
                      <span className="text-[#A78BFA] font-mono-numbers">{ing.amount}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Step by Step instructions */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-[#F8F5FC] uppercase tracking-wider">
                  Modo de Preparo:
                </h4>
                <div className="space-y-2">
                  {selectedRecipe.instructions.map((step, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-[#100C16] text-xs flex items-start gap-3"
                    >
                      <span className="w-5 h-5 rounded-full bg-[#8B5CF6]/20 text-[#A78BFA] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <p className="text-[#F8F5FC] leading-relaxed">{step}</p>
                    </div>
                  ))}
                </div>
              </div>

              {selectedRecipe.carinhoTip && (
                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-[#6D28D9]/20 to-[#EC4899]/20 border border-[#8B5CF6]/30 text-xs space-y-1">
                  <span className="font-bold text-[#A78BFA] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#EC4899]" />
                    Toque de Carinho da Mari:
                  </span>
                  <p className="text-[#F8F5FC] italic">{selectedRecipe.carinhoTip}</p>
                </div>
              )}
            </div>

            {/* Modal Bottom Actions */}
            <div className="pt-3 border-t border-[#33263F] flex items-center justify-between">
              <button
                onClick={() => {
                  setAiMode('substitute');
                  setAiQuestion(`Como fazer variações saudáveis para "${selectedRecipe.title}"?`);
                  setAiResult(null);
                  setIsAiAssistantOpen(true);
                }}
                className="text-xs text-[#A78BFA] hover:text-[#F8F5FC] flex items-center gap-1"
              >
                <Lightbulb className="w-3.5 h-3.5 text-[#EC4899]" />
                Dúvida sobre substituição de ingrediente?
              </button>

              <button
                onClick={() => {
                  onLogRecipeToMeal(selectedRecipe, 'almoco');
                  setSelectedRecipe(null);
                }}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] text-white text-xs font-bold"
              >
                Adicionar ao Meu Dia Hoje
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT RECIPE MODAL */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-[#18121F] border-t sm:border border-[#33263F] rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 pb-safe shadow-2xl my-0 sm:my-8 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#33263F]">
              <h3 className="text-base font-bold text-[#F8F5FC]">
                {editingRecipe ? 'Editar Receita' : 'Cadastrar Nova Receita'}
              </h3>
              <button
                onClick={() => setIsEditorOpen(false)}
                className="p-1.5 text-[#B8AFC4] hover:text-[#F8F5FC]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 max-h-[70vh] overflow-y-auto pr-1">
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#B8AFC4]">Título:</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Ex: Torta Rápida de Frango com Queijo e Chia"
                  className="w-full px-3 py-2 rounded-xl bg-[#100C16] border border-[#33263F] text-xs text-[#F8F5FC]"
                />
              </div>

              {/* Recipe Photo */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#B8AFC4]">Foto da Receita:</label>
                <div className="flex items-center gap-3">
                  {formPhotoUrl && (
                    <img
                      src={formPhotoUrl}
                      alt="Prévia da receita"
                      className="w-14 h-14 object-cover rounded-xl border border-[#33263F]"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#100C16] border border-[#33263F] text-xs text-[#A78BFA] hover:text-[#F8F5FC]"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Escolher Foto da Galeria</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          if (ev.target?.result) setFormPhotoUrl(ev.target.result as string);
                        };
                        reader.readAsDataURL(f);
                      }
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono-numbers">
                <div>
                  <label className="text-[10px] text-[#B8AFC4] block">Tempo (min)</label>
                  <input
                    type="number"
                    value={formPrepTime}
                    onChange={(e) => setFormPrepTime(parseInt(e.target.value) || 0)}
                    className="w-full px-2 py-1.5 rounded-lg bg-[#100C16] border border-[#33263F] text-xs text-[#F8F5FC]"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#B8AFC4] block">Porções</label>
                  <input
                    type="number"
                    value={formServings}
                    onChange={(e) => setFormServings(parseInt(e.target.value) || 1)}
                    className="w-full px-2 py-1.5 rounded-lg bg-[#100C16] border border-[#33263F] text-xs text-[#F8F5FC]"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#B8AFC4] block">Kcal/porção</label>
                  <input
                    type="number"
                    value={formCalories}
                    onChange={(e) => setFormCalories(parseInt(e.target.value) || 0)}
                    className="w-full px-2 py-1.5 rounded-lg bg-[#100C16] border border-[#33263F] text-xs text-[#EC4899]"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#B8AFC4] block">Proteína (g)</label>
                  <input
                    type="number"
                    value={formProtein}
                    onChange={(e) => setFormProtein(parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1.5 rounded-lg bg-[#100C16] border border-[#33263F] text-xs text-[#8B5CF6]"
                  />
                </div>
              </div>

              {/* Instructions textarea */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#B8AFC4]">
                  Passos do Modo de Preparo (um por linha):
                </label>
                <textarea
                  rows={4}
                  value={formInstructions.join('\n')}
                  onChange={(e) => setFormInstructions(e.target.value.split('\n'))}
                  className="w-full px-3 py-2 rounded-xl bg-[#100C16] border border-[#33263F] text-xs text-[#F8F5FC]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[#B8AFC4]">Toque de Carinho:</label>
                <input
                  type="text"
                  value={formTip}
                  onChange={(e) => setFormTip(e.target.value)}
                  placeholder="Dica especial ou afeto para finalizar o prato"
                  className="w-full px-3 py-2 rounded-xl bg-[#100C16] border border-[#33263F] text-xs text-[#F8F5FC]"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-[#33263F] flex justify-end gap-2">
              <button
                onClick={() => setIsEditorOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#100C16] text-xs text-[#B8AFC4]"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveRecipe}
                disabled={!formTitle.trim()}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#EC4899] text-white text-xs font-bold"
              >
                Salvar Receita
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI KITCHEN ASSISTANT MODAL */}
      {isAiAssistantOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-xl bg-[#18121F] border-t sm:border border-[#8B5CF6]/50 rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 pb-safe shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#33263F]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#EC4899]" />
                <h3 className="text-base font-bold text-[#F8F5FC]">
                  Assistente Culinário com Gemini 💜
                </h3>
              </div>
              <button
                onClick={() => setIsAiAssistantOpen(false)}
                className="p-1.5 text-[#B8AFC4] hover:text-[#F8F5FC]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setAiMode('create');
                  setAiResult(null);
                }}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-colors ${
                  aiMode === 'create'
                    ? 'bg-[#8B5CF6] text-white'
                    : 'bg-[#100C16] text-[#B8AFC4] border border-[#33263F]'
                }`}
              >
                Criar Receita por Ingredientes
              </button>
              <button
                onClick={() => {
                  setAiMode('substitute');
                  setAiResult(null);
                }}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-colors ${
                  aiMode === 'substitute'
                    ? 'bg-[#8B5CF6] text-white'
                    : 'bg-[#100C16] text-[#B8AFC4] border border-[#33263F]'
                }`}
              >
                Substituição Saudável
              </button>
            </div>

            {aiMode === 'create' ? (
              <div className="space-y-2">
                <label className="text-xs text-[#B8AFC4]">
                  O que você tem na sua cozinha ou geladeira?
                </label>
                <textarea
                  rows={3}
                  value={aiIngredients}
                  onChange={(e) => setAiIngredients(e.target.value)}
                  placeholder="Ex: Peito de frango, batata doce, ovos, abobrinha, azeite e orégano..."
                  className="w-full px-3 py-2 rounded-xl bg-[#100C16] border border-[#33263F] text-xs text-[#F8F5FC]"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs text-[#B8AFC4]">
                  Qual ingrediente você gostaria de substituir?
                </label>
                <input
                  type="text"
                  value={aiQuestion}
                  onChange={(e) => setAiQuestion(e.target.value)}
                  placeholder="Ex: Como substituir o creme de leite por algo mais proteico e leve?"
                  className="w-full px-3 py-2 rounded-xl bg-[#100C16] border border-[#33263F] text-xs text-[#F8F5FC]"
                />
              </div>
            )}

            <button
              onClick={callAiAssistant}
              disabled={aiLoading}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#EC4899] text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {aiLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Consultando Inteligência Artificial...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Gerar Sugestão Carinhosa</span>
                </>
              )}
            </button>

            {/* AI Result Card */}
            {aiResult && (
              <div className="p-4 rounded-2xl bg-[#100C16] border border-[#8B5CF6]/50 space-y-3">
                {aiMode === 'create' && aiResult.title ? (
                  <div>
                    <h4 className="text-sm font-bold text-[#F8F5FC]">{aiResult.title}</h4>
                    <p className="text-xs text-[#B8AFC4] mt-0.5">{aiResult.description}</p>
                    <div className="text-xs font-mono-numbers text-[#A78BFA] mt-1">
                      {aiResult.caloriesPerServing} kcal · P: {aiResult.proteinPerServing}g · C: {aiResult.carbsPerServing}g
                    </div>
                    <button
                      onClick={() => applyAiRecipeToForm(aiResult)}
                      className="mt-3 px-4 py-2 rounded-xl bg-[#8B5CF6] text-white text-xs font-bold"
                    >
                      Usar Esta Receita no Meu Livro
                    </button>
                  </div>
                ) : aiResult.suggestions ? (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-[#F8F5FC]">Substituições Sugeridas:</h4>
                    {aiResult.suggestions.map((s: any, idx: number) => (
                      <div key={idx} className="p-3 rounded-xl bg-[#18121F] text-xs space-y-1">
                        <span className="font-bold text-[#EC4899] block">{s.substituteName}</span>
                        <p className="text-[#B8AFC4]">{s.macroImpact}</p>
                        <p className="text-[11px] text-[#A78BFA] italic">Dica: {s.culinaryTip}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Chef Interactive Chat Modal (ChatGPT / Gemini style) */}
      <AiChefChatModal
        isOpen={isChefChatOpen}
        onClose={() => setIsChefChatOpen(false)}
        onApplyRecipeToForm={handleApplyRecipeFromChat}
      />
    </div>
  );
};
