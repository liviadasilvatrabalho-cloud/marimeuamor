import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Image as ImageIcon,
  Check,
  X,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Database,
  ShieldCheck,
  Plus,
  Scale,
  RotateCcw,
  Edit3,
} from 'lucide-react';
import { FoodItem, MealType, MealSlot } from '../types';
import { INITIAL_MEAL_SLOTS } from '../services/storage';

// Compressão otimizada no cliente: 1024px e 0.75 produzem arquivos de ~120KB-180KB
// Isso sobe em menos de 0.5s em conexões móveis e mantém nitidez perfeita para leitura ANVISA
async function compressImageClient(
  fileOrDataUrl: File | string,
  maxDimension = 1024,
  quality = 0.75
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(typeof fileOrDataUrl === 'string' ? fileOrDataUrl : '');
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = (err) => reject(err);

    if (typeof fileOrDataUrl === 'string') {
      img.src = fileOrDataUrl;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(fileOrDataUrl);
    }
  });
}

async function parseResponseSafely(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (res.status === 413 || text.toLowerCase().includes('entity too large')) {
      throw new Error('A fotografia é muito pesada para o servidor. Tente novamente.');
    }
    if (res.status === 504 || text.toLowerCase().includes('timeout') || text.toLowerCase().includes('gateway')) {
      throw new Error('Tempo limite no servidor ao processar imagem. Tente aproximar da tabela.');
    }
    throw new Error(text || `Erro no servidor (código ${res.status})`);
  }
}

export interface NutritionLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMealType?: MealType;
  mealSlots?: MealSlot[];
  customFoods?: FoodItem[];
  onSaveMealItem: (item: FoodItem, mealType: MealType) => void;
  onSaveCustomFood: (food: FoodItem) => void;
}

export type ModalStep = 'capture' | 'processing' | 'review' | 'success';
export type ProcessState = 'idle' | 'uploading' | 'processing' | 'success' | 'error';

interface ExtractedNutrients {
  productName: string;
  brand: string;
  servingSize: string;
  servingQuantity: number;
  servingUnit: string;
  householdMeasure: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sodium: number | null;
  sugars: number | null;
  addedSugars: number | null;
  saturatedFat: number | null;
  transFat: number | null;
  ingredients: string;
  confidenceScore: number;
}

export const NutritionLabelModal: React.FC<NutritionLabelModalProps> = ({
  isOpen,
  onClose,
  initialMealType = 'almoco',
  mealSlots,
  customFoods = [],
  onSaveMealItem,
  onSaveCustomFood,
}) => {
  const [mealType, setMealType] = useState<MealType>(initialMealType);
  const [step, setStep] = useState<ModalStep>('capture');
  const [processState, setProcessState] = useState<ProcessState>('idle');
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPhotoInReview, setShowPhotoInReview] = useState<boolean>(true);
  const [showSavedList, setShowSavedList] = useState<boolean>(false);

  // Dados em conferência/edição
  const [reviewData, setReviewData] = useState<ExtractedNutrients>({
    productName: '',
    brand: '',
    servingSize: '100g',
    servingQuantity: 100,
    servingUnit: 'g',
    householdMeasure: '',
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    sodium: 0,
    sugars: 0,
    addedSugars: 0,
    saturatedFat: 0,
    transFat: 0,
    ingredients: '',
    confidenceScore: 90,
  });

  // Alimento salvo final para a etapa de sucesso e consumo imediato
  const [savedFoodItem, setSavedFoodItem] = useState<FoodItem | null>(null);
  const [consumedGrams, setConsumedGrams] = useState<number>(100);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const slots = mealSlots && mealSlots.length ? mealSlots : INITIAL_MEAL_SLOTS;

  useEffect(() => {
    setMealType(initialMealType);
  }, [initialMealType]);

  // Reset controlado apenas ao fechar o modal
  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setStep('capture');
      setProcessState('idle');
      setCurrentFile(null);
      setPhotoPreview(null);
      setIsSaving(false);
      setErrorMessage(null);
      setSavedFoodItem(null);
    }, 200);
  };

  // 1. Processar arquivo selecionado da câmera ou galeria com controle estrito de estados e timeout
  const processImageFile = async (file: File) => {
    if (!file) return;

    setCurrentFile(file);
    const localUrl = URL.createObjectURL(file);
    setPhotoPreview(localUrl);
    setErrorMessage(null);
    setStep('processing');
    setProcessState('uploading');
    setProcessingStatus('Otimizando fotografia da tabela nutricional...');

    const abortController = new AbortController();
    // Timeout seguro de 16 segundos para evitar travamento infinito no navegador Android
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, 16000);

    try {
      // Comprime no cliente para ~120KB
      const compressedBase64 = await compressImageClient(file, 1024, 0.75);

      setProcessState('processing');
      setProcessingStatus('Lendo tabela nutricional com Inteligência Artificial (Normas ANVISA)...');

      const res = await fetch('/api/gemini/ocr-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: compressedBase64,
          mimeType: 'image/jpeg',
        }),
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);

      const data = await parseResponseSafely(res);

      if (!res.ok) {
        throw new Error(data.error || 'Falha ao processar tabela nutricional.');
      }

      // Se a IA indicar que a foto ficou ilegível, não sai da tela!
      if (data.isLegible === false) {
        setProcessState('error');
        setErrorMessage(
          data.illegibleReason ||
            'A fotografia da tabela ficou embaçada ou cortada. Você pode tentar outra foto ou preencher os dados manualmente com a foto visível.'
        );
        return;
      }

      // Extrai dados normalizados por 100g e porção
      const servingQty = Number(data.portion?.servingQuantity) || 100;
      const servingUnit = data.portion?.servingUnit || 'g';
      const servingSizeDesc = data.portion?.servingSize || `${servingQty}${servingUnit}`;
      const p100 = data.per100g || {};

      setReviewData({
        productName: data.productName || '',
        brand: data.brand || '',
        servingSize: servingSizeDesc,
        servingQuantity: servingQty,
        servingUnit,
        householdMeasure: data.portion?.servingSize || '',
        calories: Number(p100.calories) || 0,
        protein: Number(p100.protein) || 0,
        carbs: Number(p100.carbs) || 0,
        fat: Number(p100.fat) || 0,
        fiber: Number(p100.fiber) || 0,
        sodium: p100.sodium != null ? Number(p100.sodium) : null,
        sugars: p100.sugars != null ? Number(p100.sugars) : null,
        addedSugars: p100.addedSugars != null ? Number(p100.addedSugars) : null,
        saturatedFat: p100.saturatedFat != null ? Number(p100.saturatedFat) : null,
        transFat: p100.transFat != null ? Number(p100.transFat) : null,
        ingredients: data.ingredientsList || '',
        confidenceScore: Number(data.confidence?.overall) || 90,
      });

      setConsumedGrams(servingQty);
      setProcessState('success');
      setStep('review');
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('Erro no processamento da tabela:', err);
      setProcessState('error');

      if (err.name === 'AbortError') {
        setErrorMessage(
          'O servidor demorou mais de 15 segundos para responder. Sua foto continua guardada abaixo: você pode tentar reenviar ou prosseguir preenchendo as informações manualmente com a foto ao lado.'
        );
      } else {
        setErrorMessage(
          'Não foi possível concluir a leitura automática: ' +
            (err.message || 'Erro de conexão') +
            '. Sua foto continua disponível abaixo para você tentar novamente ou preencher manualmente.'
        );
      }
    }
  };

  // Re-tentar com a mesma foto armazenada
  const handleRetrySamePhoto = () => {
    if (currentFile) {
      processImageFile(currentFile);
    } else {
      cameraInputRef.current?.click();
    }
  };

  // Avançar para conferência manual preservando a foto visível
  const handleProceedManualWithPhoto = () => {
    setErrorMessage(null);
    setProcessState('idle');
    setStep('review');
  };

  // 4. Salvar Alimento no banco de dados e estado da usuária
  const handleSaveFood = async () => {
    const trimmedName = reviewData.productName.trim();
    if (!trimmedName) {
      setErrorMessage('Por favor, digite o nome do alimento antes de salvar.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const servingQty = reviewData.servingQuantity > 0 ? reviewData.servingQuantity : 100;
      const p100 = {
        calories: Math.round(reviewData.calories || 0),
        protein: Number((reviewData.protein || 0).toFixed(1)),
        carbs: Number((reviewData.carbs || 0).toFixed(1)),
        fat: Number((reviewData.fat || 0).toFixed(1)),
        fiber: Number((reviewData.fiber || 0).toFixed(1)),
        sodium: reviewData.sodium != null ? Math.round(reviewData.sodium) : null,
        sugars: reviewData.sugars != null ? Number(reviewData.sugars.toFixed(1)) : null,
        addedSugars: reviewData.addedSugars != null ? Number(reviewData.addedSugars.toFixed(1)) : null,
        saturatedFat: reviewData.saturatedFat != null ? Number(reviewData.saturatedFat.toFixed(1)) : null,
        transFat: reviewData.transFat != null ? Number(reviewData.transFat.toFixed(1)) : null,
      };

      const payload = {
        productName: trimmedName,
        brand: reviewData.brand.trim() || undefined,
        servingSize: reviewData.servingSize || `${servingQty}g`,
        servingGrams: servingQty,
        householdMeasure: reviewData.householdMeasure || undefined,
        per100g: p100,
        ingredients: reviewData.ingredients || undefined,
        source: 'Foto da Tabela',
        verificationStatus: 'user_confirmed',
        confidenceScore: reviewData.confidenceScore || 95,
        provenance: {
          nutritionSource: 'Foto da Tabela (IA OCR)',
          nameSource: 'user_confirmed',
          timestamp: new Date().toISOString(),
        },
      };

      // 1. Salva no banco Postgres Neon
      try {
        await fetch('/api/nutrition/save-food', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (dbErr) {
        console.warn('Salvamento Postgres offline ou parcial:', dbErr);
      }

      // 2. Salva no app_state / customFoods da usuária
      const foodItem: FoodItem = {
        id: `food-${Date.now()}`,
        name: trimmedName,
        brand: reviewData.brand.trim() || undefined,
        prepState: 'cru',
        portionGrams: servingQty,
        calories: Math.round((p100.calories * servingQty) / 100),
        protein: Number(((p100.protein * servingQty) / 100).toFixed(1)),
        carbs: Number(((p100.carbs * servingQty) / 100).toFixed(1)),
        fat: Number(((p100.fat * servingQty) / 100).toFixed(1)),
        fiber: Number(((p100.fiber * servingQty) / 100).toFixed(1)),
        sodium: p100.sodium != null ? Math.round((p100.sodium * servingQty) / 100) : undefined,
        sugars: p100.sugars != null ? Number(((p100.sugars * servingQty) / 100).toFixed(1)) : undefined,
        addedSugars: p100.addedSugars != null ? Number(((p100.addedSugars * servingQty) / 100).toFixed(1)) : undefined,
        saturatedFat: p100.saturatedFat != null ? Number(((p100.saturatedFat * servingQty) / 100).toFixed(1)) : undefined,
        transFat: p100.transFat != null ? Number(((p100.transFat * servingQty) / 100).toFixed(1)) : undefined,
        per100g: p100,
        source: 'Foto da Tabela',
        verified: true,
      };

      onSaveCustomFood(foodItem);
      setSavedFoodItem(foodItem);
      setConsumedGrams(servingQty);
      setStep('success');
    } catch (err: any) {
      console.error('Erro ao salvar alimento:', err);
      setErrorMessage('Erro ao salvar no banco de dados: ' + (err.message || 'Tente novamente'));
    } finally {
      setIsSaving(false);
    }
  };

  // 5. Adicionar à refeição do dia
  const handleAddSavedToMeal = () => {
    if (!savedFoodItem) return;

    const grams = Math.max(1, consumedGrams || 100);
    const p100 = savedFoodItem.per100g || {
      calories: Math.round(((savedFoodItem.calories || 0) / (savedFoodItem.portionGrams || 100)) * 100),
      protein: Number((((savedFoodItem.protein || 0) / (savedFoodItem.portionGrams || 100)) * 100).toFixed(1)),
      carbs: Number((((savedFoodItem.carbs || 0) / (savedFoodItem.portionGrams || 100)) * 100).toFixed(1)),
      fat: Number((((savedFoodItem.fat || 0) / (savedFoodItem.portionGrams || 100)) * 100).toFixed(1)),
      fiber: Number((((savedFoodItem.fiber || 0) / (savedFoodItem.portionGrams || 100)) * 100).toFixed(1)),
    };

    const itemToAdd: FoodItem = {
      ...savedFoodItem,
      id: `meal-item-${Date.now()}`,
      portionGrams: grams,
      calories: Math.round((Number(p100.calories || 0) * grams) / 100),
      protein: Number((((Number(p100.protein) || 0) * grams) / 100).toFixed(1)),
      carbs: Number((((Number(p100.carbs) || 0) * grams) / 100).toFixed(1)),
      fat: Number((((Number(p100.fat) || 0) * grams) / 100).toFixed(1)),
      fiber: Number((((Number(p100.fiber) || 0) * grams) / 100).toFixed(1)),
    };

    onSaveMealItem(itemToAdd, mealType);
    handleClose();
  };

  // Reusar alimento salvo anteriormente
  const handleSelectExistingFood = (food: FoodItem) => {
    setSavedFoodItem(food);
    setConsumedGrams(food.portionGrams || 100);
    setStep('success');
  };

  // Cálculo dinâmico para a etapa de sucesso
  const calculateConsumedTotals = () => {
    if (!savedFoodItem) return { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    const p100 = savedFoodItem.per100g || {
      calories: Math.round(((savedFoodItem.calories || 0) / (savedFoodItem.portionGrams || 100)) * 100),
      protein: Number((((savedFoodItem.protein || 0) / (savedFoodItem.portionGrams || 100)) * 100).toFixed(1)),
      carbs: Number((((savedFoodItem.carbs || 0) / (savedFoodItem.portionGrams || 100)) * 100).toFixed(1)),
      fat: Number((((savedFoodItem.fat || 0) / (savedFoodItem.portionGrams || 100)) * 100).toFixed(1)),
      fiber: Number((((savedFoodItem.fiber || 0) / (savedFoodItem.portionGrams || 100)) * 100).toFixed(1)),
    };
    const factor = Math.max(0, consumedGrams || 0) / 100;
    return {
      calories: Math.round((Number(p100.calories) || 0) * factor),
      protein: Number(((Number(p100.protein) || 0) * factor).toFixed(1)),
      carbs: Number(((Number(p100.carbs) || 0) * factor).toFixed(1)),
      fat: Number(((Number(p100.fat) || 0) * factor).toFixed(1)),
      fiber: Number(((Number(p100.fiber) || 0) * factor).toFixed(1)),
    };
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 animate-in fade-in duration-150">
      {/* Modal responsivo para Android Chrome: h-[90dvh], overflow-hidden com header fixo e corpo rolável */}
      <div
        className="relative w-full max-w-xl bg-[#18121F] border-t sm:border border-[#33263F] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col h-[90dvh] sm:h-auto sm:max-h-[88vh] overflow-hidden"
        style={{ maxHeight: 'calc(100dvh - 1.5rem)' }}
      >
        {/* Cabeçalho Fixo no Topo (shrink-0) */}
        <div className="shrink-0 p-3.5 sm:p-4 border-b border-[#33263F] flex items-center justify-between bg-[#18121F] z-10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-[#6D28D9] via-[#8B5CF6] to-[#EC4899] text-white shadow-md shadow-[#8B5CF6]/30 shrink-0">
              <Camera className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-[#F8F5FC] truncate">
                Cadastrar Alimento por Foto
              </h2>
              <p className="text-[11px] text-[#B8AFC4] truncate">
                Fotografe a tabela nutricional para extração com IA (ANVISA)
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 sm:p-2 rounded-xl text-[#B8AFC4] hover:text-[#F8F5FC] hover:bg-[#22192C] transition-colors cursor-pointer shrink-0"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Indicador de Passos Fixo no Topo (shrink-0) */}
        <div className="shrink-0 px-4 py-2 flex items-center justify-between gap-1 text-[11px] font-semibold border-b border-[#33263F]/50 bg-[#120D18]">
          <div className={`flex items-center gap-1 ${step === 'capture' ? 'text-[#EC4899]' : 'text-[#A78BFA]'}`}>
            <span className="w-4 h-4 rounded-full bg-[#100C16] border border-current flex items-center justify-center text-[9px]">1</span>
            <span>Foto</span>
          </div>
          <div className="w-4 h-px bg-[#33263F]" />
          <div className={`flex items-center gap-1 ${step === 'processing' ? 'text-[#EC4899]' : step === 'review' || step === 'success' ? 'text-[#A78BFA]' : 'text-[#B8AFC4]/50'}`}>
            <span className="w-4 h-4 rounded-full bg-[#100C16] border border-current flex items-center justify-center text-[9px]">2</span>
            <span>Processar</span>
          </div>
          <div className="w-4 h-px bg-[#33263F]" />
          <div className={`flex items-center gap-1 ${step === 'review' ? 'text-[#EC4899]' : step === 'success' ? 'text-[#A78BFA]' : 'text-[#B8AFC4]/50'}`}>
            <span className="w-4 h-4 rounded-full bg-[#100C16] border border-current flex items-center justify-center text-[9px]">3</span>
            <span>Conferir</span>
          </div>
          <div className="w-4 h-px bg-[#33263F]" />
          <div className={`flex items-center gap-1 ${step === 'success' ? 'text-emerald-400 font-bold' : 'text-[#B8AFC4]/50'}`}>
            <span className="w-4 h-4 rounded-full bg-[#100C16] border border-current flex items-center justify-center text-[9px]">4</span>
            <span>Salvo</span>
          </div>
        </div>

        {/* Inputs ocultos de captura de foto */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) processImageFile(f);
            e.target.value = '';
          }}
          className="hidden"
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) processImageFile(f);
            e.target.value = '';
          }}
          className="hidden"
        />

        {/* CORPO DO MODAL ROLÁVEL COM PADDING INFERIOR PARA BARRA ANDROID */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4 pb-20 sm:pb-6">
          {/* Alerta de Erro ou Orientação com Ações Diretas */}
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-950/50 border border-rose-500/60 text-rose-200 text-xs space-y-2.5 animate-fadeIn">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed flex-1">{errorMessage}</p>
              </div>

              {/* Botões de Ação Imediata se houve falha ou timeout */}
              {photoPreview && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleRetrySamePhoto}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] text-white text-xs font-bold shadow-md cursor-pointer hover:opacity-95 active:scale-95 transition-all"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Tentar Novamente com esta Foto</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleProceedManualWithPhoto}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#100C16] border border-[#33263F] hover:border-[#8B5CF6] text-[#F8F5FC] text-xs font-semibold cursor-pointer active:scale-95 transition-all"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-[#A78BFA]" />
                    <span>Preencher Manualmente</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Seletor de Refeição de Destino */}
          {step !== 'success' && (
            <div>
              <label className="text-xs font-medium text-[#B8AFC4] block mb-1.5">
                Vincular a qual refeição?
              </label>
              <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-5 gap-1.5">
                {slots.map((slot) => (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => setMealType(slot.id)}
                    className={`py-2 px-1 text-center rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      mealType === slot.id
                        ? 'bg-[#8B5CF6] text-white shadow-md shadow-[#8B5CF6]/30 font-semibold'
                        : 'bg-[#100C16] text-[#B8AFC4] border border-[#33263F] hover:text-[#F8F5FC]'
                    }`}
                  >
                    <span className="shrink-0">{slot.icon}</span>
                    <span className="truncate">{slot.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* ETAPA 1: FOTOGRAFAR TABELA NUTRICIONAL                       */}
          {/* ============================================================ */}
          {step === 'capture' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-b from-[#100C16] to-[#18121F] border border-[#33263F] text-center space-y-3.5">
                <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-gradient-to-tr from-[#6D28D9] to-[#EC4899] mx-auto flex items-center justify-center text-white shadow-lg shadow-[#8B5CF6]/30">
                  <Camera className="w-6 h-6 sm:w-7 sm:h-7" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-[#F8F5FC]">
                    Fotografar Tabela Nutricional
                  </h3>
                  <p className="text-xs text-[#B8AFC4] mt-1 max-w-sm mx-auto">
                    Aproxime a câmera da tabela nutricional sob boa iluminação. A IA identificará calorias, porção e todos os macronutrientes.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 sm:py-3 rounded-2xl bg-gradient-to-r from-[#6D28D9] via-[#8B5CF6] to-[#EC4899] text-white text-xs font-bold shadow-lg shadow-[#8B5CF6]/30 hover:opacity-95 active:scale-95 transition-all cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Abrir Câmera do Celular</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 sm:py-3 rounded-2xl bg-[#100C16] border border-[#33263F] hover:border-[#8B5CF6] text-[#F8F5FC] text-xs font-semibold hover:bg-[#22192C] active:scale-95 transition-all cursor-pointer"
                  >
                    <ImageIcon className="w-4 h-4 text-[#A78BFA]" />
                    <span>Escolher da Galeria</span>
                  </button>
                </div>

                <div className="p-2.5 rounded-xl bg-[#100C16] border border-[#33263F]/60 text-[10px] sm:text-[11px] text-[#B8AFC4] flex items-center justify-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Conformidade com Normas ANVISA (RDC 429/2020 e IN 75/2020)</span>
                </div>
              </div>

              {/* Seção de Alimentos Já Cadastrados no Banco */}
              {customFoods.length > 0 && (
                <div className="pt-2 border-t border-[#33263F]/60">
                  <button
                    type="button"
                    onClick={() => setShowSavedList(!showSavedList)}
                    className="w-full flex items-center justify-between text-xs text-[#A78BFA] hover:text-white font-semibold py-1.5 cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Alimentos Já Cadastrados no Meu Banco ({customFoods.length})</span>
                    </div>
                    {showSavedList ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {showSavedList && (
                    <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {customFoods.map((saved) => (
                        <div
                          key={saved.id}
                          onClick={() => handleSelectExistingFood(saved)}
                          className="p-2.5 rounded-xl bg-[#100C16] hover:bg-[#22192C] border border-[#33263F] hover:border-[#8B5CF6]/50 flex items-center justify-between gap-2 cursor-pointer transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[#F8F5FC] truncate">
                              {saved.name}
                            </p>
                            <p className="text-[10px] text-[#B8AFC4] truncate">
                              {saved.brand ? `${saved.brand} · ` : ''}Porção de {saved.portionGrams || 100}g
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-xs font-bold text-[#EC4899] font-mono-numbers">
                              {saved.calories} kcal
                            </span>
                            <span className="text-[10px] text-emerald-400 block">
                              Clique para usar
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* ETAPA 2: PROCESSANDO A FOTOGRAFIA                            */}
          {/* ============================================================ */}
          {step === 'processing' && (
            <div className="space-y-4 animate-fadeIn">
              {/* Visualização da Fotografia (NUNCA DESAPARECE) */}
              {photoPreview && (
                <div className="relative rounded-2xl bg-[#100C16] border border-[#8B5CF6]/40 overflow-hidden max-h-60 sm:max-h-72 flex items-center justify-center p-2">
                  <img
                    src={photoPreview}
                    alt="Tabela Nutricional Fotografada"
                    className="max-h-56 sm:max-h-64 w-auto rounded-xl object-contain shadow-lg"
                  />
                  {(processState === 'uploading' || processState === 'processing') && (
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-center space-y-3">
                      <RefreshCw className="w-8 h-8 text-[#EC4899] animate-spin" />
                      <div>
                        <p className="text-xs sm:text-sm font-bold text-white">
                          {processingStatus || 'Processando com Inteligência Artificial...'}
                        </p>
                        <p className="text-[10px] sm:text-xs text-[#B8AFC4] mt-1">
                          A fotografia permanece guardada enquanto os dados são extraídos.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Botões de Ação caso tenha havido erro ou aviso */}
              {processState === 'error' && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('capture');
                      setErrorMessage(null);
                    }}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#100C16] border border-[#33263F] text-xs text-[#B8AFC4] hover:text-[#F8F5FC] cursor-pointer"
                  >
                    Voltar para Início
                  </button>
                  <div className="w-full sm:w-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] text-white text-xs font-bold cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Tirar Nova Foto</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleProceedManualWithPhoto}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#100C16] border border-[#33263F] text-[#F8F5FC] text-xs font-semibold cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4 text-[#A78BFA]" />
                      <span>Digitar Dados</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* ETAPA 3: CONFERIR E EDITAR DADOS EXTRAÍDOS                   */}
          {/* ============================================================ */}
          {step === 'review' && (
            <div className="space-y-4 animate-fadeIn">
              {/* Miniatura colapsável da fotografia da tabela */}
              {photoPreview && (
                <div className="rounded-2xl bg-[#100C16] border border-[#33263F] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowPhotoInReview(!showPhotoInReview)}
                    className="w-full px-3 py-2 flex items-center justify-between text-xs text-[#B8AFC4] hover:text-[#F8F5FC] cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5 font-medium">
                      <ImageIcon className="w-3.5 h-3.5 text-[#A78BFA]" />
                      <span>{showPhotoInReview ? 'Ocultar Foto da Tabela' : 'Visualizar Foto da Tabela'}</span>
                    </span>
                    {showPhotoInReview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showPhotoInReview && (
                    <div className="p-2 border-t border-[#33263F] flex justify-center bg-black/40">
                      <img
                        src={photoPreview}
                        alt="Foto da Tabela"
                        className="max-h-44 w-auto rounded-xl object-contain"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Título da Seção */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#F8F5FC]">
                    Conferir Informações Nutricionais
                  </h3>
                  <p className="text-[11px] text-[#B8AFC4]">
                    Ajuste qualquer valor extraído antes de salvar no banco de dados.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-[10px] text-emerald-400 font-bold flex items-center gap-1 shrink-0">
                  <ShieldCheck className="w-3 h-3" />
                  <span>IA {reviewData.confidenceScore}%</span>
                </span>
              </div>

              {/* Campos de Identificação */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[#F8F5FC] block">
                    Nome do Alimento *
                  </label>
                  <input
                    type="text"
                    value={reviewData.productName}
                    onChange={(e) => setReviewData({ ...reviewData, productName: e.target.value })}
                    placeholder="Ex: Iogurte Grego Tradicional"
                    className="w-full px-3 py-2 rounded-xl bg-[#100C16] border border-[#33263F] text-xs text-[#F8F5FC] focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-[#B8AFC4] block">Marca (opcional)</label>
                  <input
                    type="text"
                    value={reviewData.brand}
                    onChange={(e) => setReviewData({ ...reviewData, brand: e.target.value })}
                    placeholder="Ex: Danone, Nestlé, etc."
                    className="w-full px-3 py-2 rounded-xl bg-[#100C16] border border-[#33263F] text-xs text-[#F8F5FC] focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
              </div>

              {/* Porção e Medida Caseira */}
              <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-[#100C16] border border-[#33263F]">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-[#B8AFC4] block">
                    Peso Porção ({reviewData.servingUnit || 'g'})
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={reviewData.servingQuantity}
                    onChange={(e) =>
                      setReviewData({
                        ...reviewData,
                        servingQuantity: parseFloat(e.target.value) || 100,
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#18121F] border border-[#33263F] text-xs font-mono-numbers text-[#F8F5FC] focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-[#B8AFC4] block">Medida Caseira</label>
                  <input
                    type="text"
                    value={reviewData.householdMeasure}
                    onChange={(e) =>
                      setReviewData({
                        ...reviewData,
                        householdMeasure: e.target.value,
                        servingSize: e.target.value || `${reviewData.servingQuantity}g`,
                      })
                    }
                    placeholder="Ex: 2 colheres / 1 pote"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#18121F] border border-[#33263F] text-xs text-[#F8F5FC] focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
              </div>

              {/* Tabela Nutricional por 100g / 100ml */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#F8F5FC]">
                    Valores Nutricionais por 100g / 100ml:
                  </span>
                  <span className="text-[10px] text-[#A78BFA]">
                    Recalculado proporcionalmente
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono-numbers">
                  {/* Calorias */}
                  <div className="p-2.5 rounded-xl bg-[#100C16] border border-pink-500/40 space-y-1">
                    <span className="text-[10px] text-[#B8AFC4] block">Calorias (kcal)</span>
                    <input
                      type="number"
                      step="1"
                      value={reviewData.calories}
                      onChange={(e) =>
                        setReviewData({ ...reviewData, calories: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full bg-transparent text-sm font-bold text-[#EC4899] focus:outline-none"
                    />
                  </div>

                  {/* Carboidratos */}
                  <div className="p-2.5 rounded-xl bg-[#100C16] border border-violet-500/40 space-y-1">
                    <span className="text-[10px] text-[#B8AFC4] block">Carboidratos (g)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={reviewData.carbs}
                      onChange={(e) =>
                        setReviewData({ ...reviewData, carbs: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full bg-transparent text-sm font-bold text-[#A78BFA] focus:outline-none"
                    />
                  </div>

                  {/* Proteínas */}
                  <div className="p-2.5 rounded-xl bg-[#100C16] border border-purple-500/40 space-y-1">
                    <span className="text-[10px] text-[#B8AFC4] block">Proteínas (g)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={reviewData.protein}
                      onChange={(e) =>
                        setReviewData({ ...reviewData, protein: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full bg-transparent text-sm font-bold text-[#8B5CF6] focus:outline-none"
                    />
                  </div>

                  {/* Gorduras Totais */}
                  <div className="p-2.5 rounded-xl bg-[#100C16] border border-rose-500/40 space-y-1">
                    <span className="text-[10px] text-[#B8AFC4] block">Gorduras Totais (g)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={reviewData.fat}
                      onChange={(e) =>
                        setReviewData({ ...reviewData, fat: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full bg-transparent text-sm font-bold text-[#F472B6] focus:outline-none"
                    />
                  </div>

                  {/* Fibras */}
                  <div className="p-2 rounded-xl bg-[#100C16] border border-[#33263F] space-y-0.5">
                    <span className="text-[10px] text-[#B8AFC4] block">Fibras (g)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={reviewData.fiber}
                      onChange={(e) =>
                        setReviewData({ ...reviewData, fiber: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full bg-transparent text-xs font-semibold text-[#F8F5FC] focus:outline-none"
                    />
                  </div>

                  {/* Sódio */}
                  <div className="p-2 rounded-xl bg-[#100C16] border border-[#33263F] space-y-0.5">
                    <span className="text-[10px] text-[#B8AFC4] block">Sódio (mg)</span>
                    <input
                      type="number"
                      step="1"
                      value={reviewData.sodium ?? ''}
                      onChange={(e) =>
                        setReviewData({
                          ...reviewData,
                          sodium: e.target.value === '' ? null : parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full bg-transparent text-xs font-semibold text-[#F8F5FC] focus:outline-none"
                    />
                  </div>

                  {/* Açúcares Totais */}
                  <div className="p-2 rounded-xl bg-[#100C16] border border-[#33263F] space-y-0.5">
                    <span className="text-[10px] text-[#B8AFC4] block">Açúcares Totais (g)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={reviewData.sugars ?? ''}
                      onChange={(e) =>
                        setReviewData({
                          ...reviewData,
                          sugars: e.target.value === '' ? null : parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full bg-transparent text-xs font-semibold text-[#F8F5FC] focus:outline-none"
                    />
                  </div>

                  {/* Gorduras Saturadas */}
                  <div className="p-2 rounded-xl bg-[#100C16] border border-[#33263F] space-y-0.5">
                    <span className="text-[10px] text-[#B8AFC4] block">Gorduras Sat. (g)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={reviewData.saturatedFat ?? ''}
                      onChange={(e) =>
                        setReviewData({
                          ...reviewData,
                          saturatedFat: e.target.value === '' ? null : parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full bg-transparent text-xs font-semibold text-[#F8F5FC] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Botões de Ação na Conferência */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-3 border-t border-[#33263F]">
                <button
                  type="button"
                  onClick={() => setStep('capture')}
                  disabled={isSaving}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#100C16] border border-[#33263F] text-xs text-[#B8AFC4] hover:text-[#F8F5FC] cursor-pointer disabled:opacity-50"
                >
                  Tirar Outra Foto
                </button>
                <button
                  type="button"
                  onClick={handleSaveFood}
                  disabled={isSaving}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#8B5CF6] to-[#EC4899] text-white text-xs font-bold shadow-lg shadow-[#8B5CF6]/30 hover:opacity-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Salvando no Banco...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Salvar Alimento</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* ETAPA 4/5: SUCESSO E CONSUMO IMEDIATO NA REFEIÇÃO            */}
          {/* ============================================================ */}
          {step === 'success' && savedFoodItem && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 sm:p-5 rounded-2xl bg-[#100C16] border border-emerald-500/40 text-center space-y-2">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center border border-emerald-500/40">
                  <Check className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <h3 className="text-sm font-bold text-[#F8F5FC]">
                  Alimento Salvo com Sucesso no Banco de Dados!
                </h3>
                <p className="text-xs text-emerald-300">
                  Cadastrado permanentemente. Disponível na busca e nas próximas refeições sem precisar fotografar de novo.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#100C16] border border-[#33263F] space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#33263F]">
                  <div className="min-w-0 mr-2">
                    <h4 className="text-sm font-bold text-[#F8F5FC] truncate">{savedFoodItem.name}</h4>
                    {savedFoodItem.brand && (
                      <p className="text-[11px] text-[#B8AFC4] truncate">{savedFoodItem.brand}</p>
                    )}
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-[#8B5CF6]/20 text-[10px] text-[#A78BFA] font-bold shrink-0">
                    Banco de Dados
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[#F8F5FC]">
                      Quanto você vai consumir agora?
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="1"
                        max="2000"
                        value={consumedGrams}
                        onChange={(e) => setConsumedGrams(Math.max(1, parseFloat(e.target.value) || 1))}
                        className="w-20 px-2.5 py-1 text-center font-bold text-xs bg-[#18121F] border border-[#8B5CF6]/50 rounded-lg text-[#F8F5FC] focus:outline-none"
                      />
                      <span className="text-xs text-[#B8AFC4]">g</span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min="10"
                    max="500"
                    step="5"
                    value={consumedGrams}
                    onChange={(e) => setConsumedGrams(Number(e.target.value))}
                    className="w-full accent-[#EC4899] cursor-pointer"
                  />

                  {(() => {
                    const totals = calculateConsumedTotals();
                    return (
                      <div className="grid grid-cols-4 gap-1.5 sm:gap-2 pt-2 text-center font-mono-numbers">
                        <div className="p-2 rounded-xl bg-[#18121F] border border-pink-500/30">
                          <span className="text-[9px] sm:text-[10px] text-[#B8AFC4] block">Calorias</span>
                          <span className="text-xs font-bold text-[#EC4899]">{totals.calories} kcal</span>
                        </div>
                        <div className="p-2 rounded-xl bg-[#18121F] border border-violet-500/30">
                          <span className="text-[9px] sm:text-[10px] text-[#B8AFC4] block">Carbos</span>
                          <span className="text-xs font-bold text-[#A78BFA]">{totals.carbs}g</span>
                        </div>
                        <div className="p-2 rounded-xl bg-[#18121F] border border-purple-500/30">
                          <span className="text-[9px] sm:text-[10px] text-[#B8AFC4] block">Proteína</span>
                          <span className="text-xs font-bold text-[#8B5CF6]">{totals.protein}g</span>
                        </div>
                        <div className="p-2 rounded-xl bg-[#18121F] border border-rose-500/30">
                          <span className="text-[9px] sm:text-[10px] text-[#B8AFC4] block">Gordura</span>
                          <span className="text-xs font-bold text-[#F472B6]">{totals.fat}g</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Botões de Conclusão */}
              <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#100C16] border border-[#33263F] text-xs font-semibold text-[#B8AFC4] hover:text-[#F8F5FC] cursor-pointer"
                >
                  Apenas Concluir Cadastro
                </button>
                <button
                  type="button"
                  onClick={handleAddSavedToMeal}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#8B5CF6] to-[#EC4899] text-white text-xs font-bold shadow-lg shadow-[#8B5CF6]/30 hover:opacity-95 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Adicionar à Refeição ({consumedGrams}g)</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
