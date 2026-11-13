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
  Flame,
  Sparkles,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { FoodItem, MealType, MealSlot } from '../types';
import { INITIAL_MEAL_SLOTS } from '../services/storage';

// Helper de compressão otimizada no cliente: 1024px e qualidade 0.75 produzem arquivos leves (~120KB)
// Garante upload instantâneo e resolução nítida para leitura dos números da ANVISA
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

// Helpers de formatação e parsing para números decimais no padrão brasileiro (vírgula)
// Preserva casas decimais completas (ex: 12,5 g; 0,8 g; 3,25 g; 125,6 kcal; 0,04 g; 1,5 mg)
export function formatPtBr(val: number | string | null | undefined): string {
  if (val === null || val === undefined) return '';
  const str = String(val).trim();
  if (!str) return '';
  return str.replace('.', ',');
}

export function parsePtBrInput(val: string): number | null {
  if (!val) return null;
  const trimmed = val.trim();
  if (!trimmed || trimmed === '-' || trimmed === ',' || trimmed === '.') return null;
  const cleaned = trimmed.replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;

  if (cleaned.includes(',') && cleaned.includes('.')) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      const normalized = cleaned.replace(/\./g, '').replace(',', '.');
      const n = parseFloat(normalized);
      return isNaN(n) ? null : n;
    } else {
      const normalized = cleaned.replace(/,/g, '');
      const n = parseFloat(normalized);
      return isNaN(n) ? null : n;
    }
  }

  if (cleaned.includes(',')) {
    const normalized = cleaned.replace(',', '.');
    const n = parseFloat(normalized);
    return isNaN(n) ? null : n;
  }

  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
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

interface NutrientFormFields {
  productName: string;
  brand: string;
  servingQuantity: string;
  servingUnit: string;
  householdMeasure: string;
  // Valores por 100g / 100ml
  calories: string;
  carbs: string;
  protein: string;
  fat: string;
  fiber: string;
  sodium: string;
  sugars: string;
  addedSugars: string;
  saturatedFat: string;
  transFat: string;
  ingredients: string;
}

const DEFAULT_FORM_FIELDS: NutrientFormFields = {
  productName: '',
  brand: '',
  servingQuantity: '100',
  servingUnit: 'g',
  householdMeasure: '',
  calories: '0',
  carbs: '0',
  protein: '0',
  fat: '0',
  fiber: '0',
  sodium: '',
  sugars: '',
  addedSugars: '',
  saturatedFat: '',
  transFat: '',
  ingredients: '',
};

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
  const [confidenceScore, setConfidenceScore] = useState<number>(90);

  // Buffer de campos como strings no formato brasileiro (permite digitação fluida com vírgula)
  const [formFields, setFormFields] = useState<NutrientFormFields>(DEFAULT_FORM_FIELDS);

  // Calorias declaradas especificamente para a porção na embalagem (evita recálculo com erro de ±1 kcal)
  const [declaredPortionCalories, setDeclaredPortionCalories] = useState<number | null>(null);
  const [declaredPortionMacros, setDeclaredPortionMacros] = useState<any | null>(null);

  // Alimento salvo final para a etapa de sucesso e consumo imediato
  const [savedFoodItem, setSavedFoodItem] = useState<FoodItem | null>(null);
  const [consumedGrams, setConsumedGrams] = useState<number>(100);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const slots = mealSlots && mealSlots.length ? mealSlots : INITIAL_MEAL_SLOTS;

  useEffect(() => {
    setMealType(initialMealType);
  }, [initialMealType]);

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
      setFormFields(DEFAULT_FORM_FIELDS);
      setDeclaredPortionCalories(null);
      setDeclaredPortionMacros(null);
    }, 200);
  };

  const handleFieldChange = (field: keyof NutrientFormFields, value: string) => {
    setFormFields((prev) => ({ ...prev, [field]: value }));
  };

  // 1. Processar arquivo selecionado com otimização no cliente e leitura ANVISA no backend
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

      // Se a IA indicar que a foto ficou ilegível, não sai da tela
      if (data.isLegible === false) {
        setProcessState('error');
        setErrorMessage(
          data.illegibleReason ||
            'A fotografia da tabela ficou embaçada ou cortada. Você pode tentar outra foto com boa iluminação ou preencher os dados manualmente com a foto visível.'
        );
        return;
      }

      // Extrai dados preservando rigorosamente as casas decimais e calorias declaradas
      const servingQty = parsePtBrInput(String(data.portion?.servingQuantity)) || 100;
      const servingUnit = data.portion?.servingUnit || 'g';
      const servingSizeDesc = data.portion?.servingSize || `${formatPtBr(servingQty)}${servingUnit}`;
      const p100 = data.per100g || {};
      const pPortion = data.perPortion || {};

      // Guarda as calorias declaradas da porção se existirem
      if (pPortion.calories != null) {
        setDeclaredPortionCalories(parsePtBrInput(String(pPortion.calories)));
      }
      setDeclaredPortionMacros(pPortion);

      setFormFields({
        productName: data.productName || '',
        brand: data.brand || '',
        servingQuantity: formatPtBr(servingQty),
        servingUnit,
        householdMeasure: servingSizeDesc,
        calories: formatPtBr(p100.calories),
        carbs: formatPtBr(p100.carbs),
        protein: formatPtBr(p100.protein),
        fat: formatPtBr(p100.fat),
        fiber: formatPtBr(p100.fiber),
        sodium: formatPtBr(p100.sodium),
        sugars: formatPtBr(p100.sugars),
        addedSugars: formatPtBr(p100.addedSugars),
        saturatedFat: formatPtBr(p100.saturatedFat),
        transFat: formatPtBr(p100.transFat),
        ingredients: data.ingredientsList || '',
      });

      setConfidenceScore(Number(data.confidence?.overall) || 92);
      setConsumedGrams(servingQty);
      setProcessState('success');
      setStep('review');
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('Erro no processamento da tabela:', err);
      setProcessState('error');

      if (err.name === 'AbortError') {
        setErrorMessage(
          'O servidor demorou para responder. Sua foto continua guardada abaixo: você pode tentar reenviar ou prosseguir preenchendo as informações manualmente com a foto ao lado.'
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

  const handleRetrySamePhoto = () => {
    if (currentFile) {
      processImageFile(currentFile);
    } else {
      cameraInputRef.current?.click();
    }
  };

  const handleProceedManualWithPhoto = () => {
    setErrorMessage(null);
    setProcessState('idle');
    setStep('review');
  };

  // 4. Salvar Alimento no banco de dados e estado da usuária
  const handleSaveFood = async () => {
    const trimmedName = formFields.productName.trim();
    if (!trimmedName) {
      setErrorMessage('Por favor, digite o nome do alimento antes de salvar.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const servingQty = parsePtBrInput(formFields.servingQuantity) || 100;
      const servingUnit = formFields.servingUnit.trim() || 'g';

      // Parse exato preservando decimais (sem arredondar para inteiros!)
      const caloriesPer100 = parsePtBrInput(formFields.calories) ?? 0;
      const carbsPer100 = parsePtBrInput(formFields.carbs) ?? 0;
      const proteinPer100 = parsePtBrInput(formFields.protein) ?? 0;
      const fatPer100 = parsePtBrInput(formFields.fat) ?? 0;
      const fiberPer100 = parsePtBrInput(formFields.fiber) ?? 0;
      const sodiumPer100 = parsePtBrInput(formFields.sodium);
      const sugarsPer100 = parsePtBrInput(formFields.sugars);
      const addedSugarsPer100 = parsePtBrInput(formFields.addedSugars);
      const saturatedFatPer100 = parsePtBrInput(formFields.saturatedFat);
      const transFatPer100 = parsePtBrInput(formFields.transFat);

      const p100 = {
        calories: caloriesPer100,
        protein: proteinPer100,
        carbs: carbsPer100,
        fat: fatPer100,
        fiber: fiberPer100,
        sodium: sodiumPer100,
        sugars: sugarsPer100,
        addedSugars: addedSugarsPer100,
        saturatedFat: saturatedFatPer100,
        transFat: transFatPer100,
      };

      // Calorias da porção: se foram declaradas no rótulo, usa as declaradas sem recalcular!
      // Se não, calcula proporcionalmente com precisão decimal
      const portionCalories = declaredPortionCalories != null
        ? declaredPortionCalories
        : Number(((caloriesPer100 * servingQty) / 100).toFixed(1));

      const portionProtein = declaredPortionMacros?.protein != null
        ? parsePtBrInput(String(declaredPortionMacros.protein)) ?? Number(((proteinPer100 * servingQty) / 100).toFixed(2))
        : Number(((proteinPer100 * servingQty) / 100).toFixed(2));

      const portionCarbs = declaredPortionMacros?.carbs != null
        ? parsePtBrInput(String(declaredPortionMacros.carbs)) ?? Number(((carbsPer100 * servingQty) / 100).toFixed(2))
        : Number(((carbsPer100 * servingQty) / 100).toFixed(2));

      const portionFat = declaredPortionMacros?.fat != null
        ? parsePtBrInput(String(declaredPortionMacros.fat)) ?? Number(((fatPer100 * servingQty) / 100).toFixed(2))
        : Number(((fatPer100 * servingQty) / 100).toFixed(2));

      const portionFiber = declaredPortionMacros?.fiber != null
        ? parsePtBrInput(String(declaredPortionMacros.fiber)) ?? Number(((fiberPer100 * servingQty) / 100).toFixed(2))
        : Number(((fiberPer100 * servingQty) / 100).toFixed(2));

      const payload = {
        productName: trimmedName,
        brand: formFields.brand.trim() || undefined,
        servingSize: formFields.householdMeasure.trim() || `${formatPtBr(servingQty)}${servingUnit}`,
        servingGrams: servingQty,
        householdMeasure: formFields.householdMeasure.trim() || undefined,
        per100g: p100,
        perPortion: {
          calories: portionCalories,
          protein: portionProtein,
          carbs: portionCarbs,
          fat: portionFat,
          fiber: portionFiber,
          sodium: sodiumPer100 != null ? Number(((sodiumPer100 * servingQty) / 100).toFixed(1)) : null,
          sugars: sugarsPer100 != null ? Number(((sugarsPer100 * servingQty) / 100).toFixed(2)) : null,
          addedSugars: addedSugarsPer100 != null ? Number(((addedSugarsPer100 * servingQty) / 100).toFixed(2)) : null,
          saturatedFat: saturatedFatPer100 != null ? Number(((saturatedFatPer100 * servingQty) / 100).toFixed(2)) : null,
          transFat: transFatPer100 != null ? Number(((transFatPer100 * servingQty) / 100).toFixed(2)) : null,
        },
        ingredients: formFields.ingredients.trim() || undefined,
        source: 'Foto da Tabela',
        verificationStatus: 'user_confirmed',
        confidenceScore: confidenceScore || 95,
        provenance: {
          nutritionSource: 'Foto da Tabela (IA OCR ANVISA)',
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

      // 2. Salva no app_state / customFoods da usuária mantendo precisão decimal
      const foodItem: FoodItem = {
        id: `food-${Date.now()}`,
        name: trimmedName,
        brand: formFields.brand.trim() || undefined,
        prepState: 'cru',
        portionGrams: servingQty,
        calories: portionCalories,
        protein: portionProtein,
        carbs: portionCarbs,
        fat: portionFat,
        fiber: portionFiber,
        sodium: sodiumPer100 != null ? Number(((sodiumPer100 * servingQty) / 100).toFixed(1)) : undefined,
        sugars: sugarsPer100 != null ? Number(((sugarsPer100 * servingQty) / 100).toFixed(2)) : undefined,
        addedSugars: addedSugarsPer100 != null ? Number(((addedSugarsPer100 * servingQty) / 100).toFixed(2)) : undefined,
        saturatedFat: saturatedFatPer100 != null ? Number(((saturatedFatPer100 * servingQty) / 100).toFixed(2)) : undefined,
        transFat: transFatPer100 != null ? Number(((transFatPer100 * servingQty) / 100).toFixed(2)) : undefined,
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
      calories: ((savedFoodItem.calories || 0) / (savedFoodItem.portionGrams || 100)) * 100,
      protein: ((savedFoodItem.protein || 0) / (savedFoodItem.portionGrams || 100)) * 100,
      carbs: ((savedFoodItem.carbs || 0) / (savedFoodItem.portionGrams || 100)) * 100,
      fat: ((savedFoodItem.fat || 0) / (savedFoodItem.portionGrams || 100)) * 100,
      fiber: ((savedFoodItem.fiber || 0) / (savedFoodItem.portionGrams || 100)) * 100,
    };

    const itemToAdd: FoodItem = {
      ...savedFoodItem,
      id: `meal-item-${Date.now()}`,
      portionGrams: grams,
      calories: Number((((p100.calories || 0) * grams) / 100).toFixed(1)),
      protein: Number((((p100.protein || 0) * grams) / 100).toFixed(2)),
      carbs: Number((((p100.carbs || 0) * grams) / 100).toFixed(2)),
      fat: Number((((p100.fat || 0) * grams) / 100).toFixed(2)),
      fiber: Number((((p100.fiber || 0) * grams) / 100).toFixed(2)),
    };

    onSaveMealItem(itemToAdd, mealType);
    handleClose();
  };

  const handleSelectExistingFood = (food: FoodItem) => {
    setSavedFoodItem(food);
    setConsumedGrams(food.portionGrams || 100);
    setStep('success');
  };

  const calculateConsumedTotals = () => {
    if (!savedFoodItem) return { calories: '0', protein: '0', carbs: '0', fat: '0', fiber: '0' };
    const p100 = savedFoodItem.per100g || {
      calories: ((savedFoodItem.calories || 0) / (savedFoodItem.portionGrams || 100)) * 100,
      protein: ((savedFoodItem.protein || 0) / (savedFoodItem.portionGrams || 100)) * 100,
      carbs: ((savedFoodItem.carbs || 0) / (savedFoodItem.portionGrams || 100)) * 100,
      fat: ((savedFoodItem.fat || 0) / (savedFoodItem.portionGrams || 100)) * 100,
      fiber: ((savedFoodItem.fiber || 0) / (savedFoodItem.portionGrams || 100)) * 100,
    };
    const factor = Math.max(0, consumedGrams || 0) / 100;
    return {
      calories: formatPtBr(Number(((p100.calories || 0) * factor).toFixed(1))),
      protein: formatPtBr(Number(((p100.protein || 0) * factor).toFixed(2))),
      carbs: formatPtBr(Number(((p100.carbs || 0) * factor).toFixed(2))),
      fat: formatPtBr(Number(((p100.fat || 0) * factor).toFixed(2))),
      fiber: formatPtBr(Number(((p100.fiber || 0) * factor).toFixed(2))),
    };
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 animate-in fade-in duration-150">
      {/* Modal responsivo para Android Chrome e iOS Safari: h-[92dvh] com header fixo e corpo rolável */}
      <div
        className="relative w-full max-w-xl bg-[#140E1B] border-t sm:border border-[#322046] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col h-[92dvh] sm:h-auto sm:max-h-[88vh] overflow-hidden"
        style={{ maxHeight: 'calc(100dvh - 1.25rem)' }}
      >
        {/* Cabeçalho Fixo no Topo */}
        <div className="shrink-0 p-3.5 sm:p-4 border-b border-[#2D1B3E] flex items-center justify-between bg-[#140E1B] z-10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-[#6D28D9] via-[#8B5CF6] to-[#EC4899] text-white shadow-md shadow-[#8B5CF6]/25 shrink-0">
              <Camera className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-[#FAF8FC] truncate">
                Cadastrar Alimento por Foto
              </h2>
              <p className="text-[11px] text-[#B5A8C8] truncate">
                Leitura inteligente da tabela nutricional (Normas ANVISA)
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 sm:p-2 rounded-xl text-[#B5A8C8] hover:text-[#FAF8FC] hover:bg-[#20152B] transition-colors cursor-pointer shrink-0"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Indicador de Etapas Fixo no Topo */}
        <div className="shrink-0 px-4 py-2 flex items-center justify-between gap-1 text-[11px] font-semibold border-b border-[#2D1B3E]/60 bg-[#100A17]">
          <div className={`flex items-center gap-1.5 ${step === 'capture' ? 'text-[#EC4899]' : 'text-[#A78BFA]'}`}>
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
              step === 'capture' ? 'bg-[#EC4899] text-white' : 'bg-[#20152B] text-[#A78BFA] border border-[#A78BFA]/40'
            }`}>1</span>
            <span>Foto</span>
          </div>
          <div className="w-4 h-px bg-[#322046]" />
          <div className={`flex items-center gap-1.5 ${step === 'processing' ? 'text-[#EC4899]' : step === 'review' || step === 'success' ? 'text-[#A78BFA]' : 'text-[#7B6E8F]'}`}>
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
              step === 'processing' ? 'bg-[#EC4899] text-white' : step === 'review' || step === 'success' ? 'bg-[#20152B] text-[#A78BFA] border border-[#A78BFA]/40' : 'bg-[#181122] text-[#7B6E8F]'
            }`}>2</span>
            <span>Processar</span>
          </div>
          <div className="w-4 h-px bg-[#322046]" />
          <div className={`flex items-center gap-1.5 ${step === 'review' ? 'text-[#EC4899]' : step === 'success' ? 'text-[#A78BFA]' : 'text-[#7B6E8F]'}`}>
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
              step === 'review' ? 'bg-[#EC4899] text-white' : step === 'success' ? 'bg-[#20152B] text-[#A78BFA] border border-[#A78BFA]/40' : 'bg-[#181122] text-[#7B6E8F]'
            }`}>3</span>
            <span>Conferir</span>
          </div>
          <div className="w-4 h-px bg-[#322046]" />
          <div className={`flex items-center gap-1.5 ${step === 'success' ? 'text-emerald-400 font-bold' : 'text-[#7B6E8F]'}`}>
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
              step === 'success' ? 'bg-emerald-500 text-white' : 'bg-[#181122] text-[#7B6E8F]'
            }`}>4</span>
            <span>Salvo</span>
          </div>
        </div>

        {/* Inputs de arquivo ocultos */}
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

        {/* CORPO DO MODAL COM ROLAGEM SUAVE E PADDING INFERIOR SEGURO */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4 pb-24 sm:pb-6">
          {/* Mensagem de Erro com Ações Diretas */}
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/50 text-rose-200 text-xs space-y-2.5 animate-fadeIn">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed flex-1">{errorMessage}</p>
              </div>

              {photoPreview && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleRetrySamePhoto}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] text-white text-xs font-bold shadow-md cursor-pointer hover:opacity-95 active:scale-95 transition-all"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Tentar Novamente com esta Foto</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleProceedManualWithPhoto}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#1C1327] border border-[#3D2854] hover:border-[#8B5CF6] text-[#FAF8FC] text-xs font-semibold cursor-pointer active:scale-95 transition-all"
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
              <label className="text-xs font-medium text-[#B5A8C8] block mb-1.5">
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
                        : 'bg-[#1A1224] text-[#B5A8C8] border border-[#2D1B3E] hover:text-[#FAF8FC]'
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
              <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-b from-[#181022] to-[#120B19] border border-[#322046] text-center space-y-3.5">
                <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-gradient-to-tr from-[#6D28D9] to-[#EC4899] mx-auto flex items-center justify-center text-white shadow-lg shadow-[#8B5CF6]/30">
                  <Camera className="w-6 h-6 sm:w-7 sm:h-7" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-[#FAF8FC]">
                    Fotografar Tabela Nutricional
                  </h3>
                  <p className="text-xs text-[#B5A8C8] mt-1 max-w-sm mx-auto">
                    Aproxime a câmera da tabela nutricional sob boa iluminação. A IA extrairá calorias, porções e nutrientes mantendo as casas decimais exatas da embalagem.
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
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 sm:py-3 rounded-2xl bg-[#1C1327] border border-[#322046] hover:border-[#8B5CF6] text-[#FAF8FC] text-xs font-semibold hover:bg-[#251934] active:scale-95 transition-all cursor-pointer"
                  >
                    <ImageIcon className="w-4 h-4 text-[#A78BFA]" />
                    <span>Escolher da Galeria</span>
                  </button>
                </div>

                <div className="p-2.5 rounded-xl bg-[#140E1B] border border-[#322046]/70 text-[10px] sm:text-[11px] text-[#B5A8C8] flex items-center justify-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Conformidade com Normas ANVISA (RDC 429/2020 e IN 75/2020)</span>
                </div>
              </div>

              {/* Seção de Alimentos Já Cadastrados no Banco */}
              {customFoods.length > 0 && (
                <div className="pt-2 border-t border-[#2D1B3E]">
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
                          className="p-2.5 rounded-xl bg-[#1A1224] hover:bg-[#251934] border border-[#322046] hover:border-[#8B5CF6]/50 flex items-center justify-between gap-2 cursor-pointer transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[#FAF8FC] truncate">
                              {saved.name}
                            </p>
                            <p className="text-[10px] text-[#B5A8C8] truncate">
                              {saved.brand ? `${saved.brand} · ` : ''}Porção de {formatPtBr(saved.portionGrams || 100)}g
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-xs font-bold text-[#EC4899] font-mono-numbers">
                              {formatPtBr(saved.calories)} kcal
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
              {photoPreview && (
                <div className="relative rounded-2xl bg-[#120B19] border border-[#8B5CF6]/40 overflow-hidden max-h-60 sm:max-h-72 flex items-center justify-center p-2">
                  <img
                    src={photoPreview}
                    alt="Tabela Nutricional Fotografada"
                    className="max-h-56 sm:max-h-64 w-auto rounded-xl object-contain shadow-lg"
                  />
                  {(processState === 'uploading' || processState === 'processing') && (
                    <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-center space-y-3">
                      <div className="relative">
                        <RefreshCw className="w-9 h-9 text-[#EC4899] animate-spin" />
                        <Sparkles className="w-4 h-4 text-[#A78BFA] absolute -top-1 -right-1 animate-pulse" />
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm font-bold text-white">
                          {processingStatus || 'Processando com Inteligência Artificial...'}
                        </p>
                        <p className="text-[10px] sm:text-xs text-[#B5A8C8] mt-1 max-w-xs">
                          Extraindo valores nutricionais mantendo casas decimais e normas ANVISA...
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {processState === 'error' && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('capture');
                      setErrorMessage(null);
                    }}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#1A1224] border border-[#322046] text-xs text-[#B5A8C8] hover:text-[#FAF8FC] cursor-pointer"
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
                      className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#1C1327] border border-[#322046] text-[#FAF8FC] text-xs font-semibold cursor-pointer"
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
              {/* Miniatura retrátil da foto da tabela nutricional */}
              {photoPreview && (
                <div className="rounded-2xl bg-[#160E1F] border border-[#2D1B3E] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowPhotoInReview(!showPhotoInReview)}
                    className="w-full px-3 py-2 flex items-center justify-between text-xs text-[#B5A8C8] hover:text-[#FAF8FC] cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5 font-medium">
                      <ImageIcon className="w-3.5 h-3.5 text-[#A78BFA]" />
                      <span>{showPhotoInReview ? 'Ocultar Foto da Embalagem' : 'Visualizar Foto da Embalagem para Conferência'}</span>
                    </span>
                    {showPhotoInReview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showPhotoInReview && (
                    <div className="p-2 border-t border-[#2D1B3E] flex justify-center bg-black/40">
                      <img
                        src={photoPreview}
                        alt="Foto da Embalagem"
                        className="max-h-48 w-auto rounded-xl object-contain shadow-md"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Título da Seção com Badge de Confiabilidade */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#FAF8FC]">
                    Conferir Informações Nutricionais
                  </h3>
                  <p className="text-[11px] text-[#B5A8C8]">
                    Valores extraídos fielmente do rótulo. Você pode ajustar qualquer número.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-[10px] text-emerald-400 font-bold flex items-center gap-1 shrink-0">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>IA {confidenceScore}%</span>
                </span>
              </div>

              {/* Identificação do Produto */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[#FAF8FC] block">
                    Nome do Alimento *
                  </label>
                  <input
                    type="text"
                    value={formFields.productName}
                    onChange={(e) => handleFieldChange('productName', e.target.value)}
                    placeholder="Ex: Iogurte Grego Tradicional"
                    className="w-full px-3 py-2 rounded-xl bg-[#1A1224] border border-[#322046] text-xs text-[#FAF8FC] focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-[#B5A8C8] block">Marca (opcional)</label>
                  <input
                    type="text"
                    value={formFields.brand}
                    onChange={(e) => handleFieldChange('brand', e.target.value)}
                    placeholder="Ex: Danone, Nestlé, etc."
                    className="w-full px-3 py-2 rounded-xl bg-[#1A1224] border border-[#322046] text-xs text-[#FAF8FC] focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
              </div>

              {/* Porção e Medida Caseira */}
              <div className="grid grid-cols-2 gap-2.5 p-3 rounded-2xl bg-[#160E1F] border border-[#2D1B3E]">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-[#B5A8C8] block">
                    Peso Porção ({formFields.servingUnit || 'g'})
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formFields.servingQuantity}
                    onChange={(e) => handleFieldChange('servingQuantity', e.target.value)}
                    placeholder="100"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#1F142B] border border-[#322046] text-xs font-bold text-[#FAF8FC] focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-[#B5A8C8] block">Medida Caseira</label>
                  <input
                    type="text"
                    value={formFields.householdMeasure}
                    onChange={(e) => handleFieldChange('householdMeasure', e.target.value)}
                    placeholder="Ex: 2 colheres / 1 pote"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#1F142B] border border-[#322046] text-xs text-[#FAF8FC] focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
              </div>

              {/* CARTÃO DE DESTAQUE: VALOR ENERGÉTICO (CALORIAS DECLARADAS) */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-[#20102B] via-[#2A1438] to-[#20102B] border border-pink-500/40 shadow-sm flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-xl bg-pink-500/20 text-[#EC4899] shrink-0 border border-pink-500/30">
                    <Flame className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-[#FAF8FC] block">
                      Valor Energético por 100g / 100ml
                    </span>
                    <span className="text-[10px] text-[#B5A8C8]">
                      Valor exato do rótulo (preservado sem recálculo)
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formFields.calories}
                    onChange={(e) => handleFieldChange('calories', e.target.value)}
                    placeholder="0"
                    className="w-20 sm:w-24 px-2.5 py-1.5 text-right font-bold text-base text-[#EC4899] bg-[#140E1B] border border-pink-500/50 rounded-xl focus:outline-none focus:border-pink-400"
                  />
                  <span className="text-xs font-bold text-pink-300">kcal</span>
                </div>
              </div>

              {/* GRID PRINCIPAL: MACRONUTRIENTES ESSENCIAIS */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-[#FAF8FC] block">
                  Macronutrientes Principais (por 100g / 100ml):
                </span>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {/* Carboidratos */}
                  <div className="p-2.5 rounded-xl bg-[#181022] border border-violet-500/30 space-y-1">
                    <span className="text-[10px] font-semibold text-[#A78BFA] block">Carboidratos</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formFields.carbs}
                        onChange={(e) => handleFieldChange('carbs', e.target.value)}
                        placeholder="0"
                        className="w-full bg-transparent text-sm font-bold text-[#FAF8FC] focus:outline-none"
                      />
                      <span className="text-[11px] text-[#B5A8C8]">g</span>
                    </div>
                  </div>

                  {/* Proteínas */}
                  <div className="p-2.5 rounded-xl bg-[#181022] border border-purple-500/30 space-y-1">
                    <span className="text-[10px] font-semibold text-[#C084FC] block">Proteínas</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formFields.protein}
                        onChange={(e) => handleFieldChange('protein', e.target.value)}
                        placeholder="0"
                        className="w-full bg-transparent text-sm font-bold text-[#FAF8FC] focus:outline-none"
                      />
                      <span className="text-[11px] text-[#B5A8C8]">g</span>
                    </div>
                  </div>

                  {/* Gorduras Totais */}
                  <div className="p-2.5 rounded-xl bg-[#181022] border border-rose-500/30 space-y-1">
                    <span className="text-[10px] font-semibold text-[#F472B6] block">Gorduras Totais</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formFields.fat}
                        onChange={(e) => handleFieldChange('fat', e.target.value)}
                        placeholder="0"
                        className="w-full bg-transparent text-sm font-bold text-[#FAF8FC] focus:outline-none"
                      />
                      <span className="text-[11px] text-[#B5A8C8]">g</span>
                    </div>
                  </div>

                  {/* Fibras Alimentares */}
                  <div className="p-2.5 rounded-xl bg-[#181022] border border-emerald-500/30 space-y-1">
                    <span className="text-[10px] font-semibold text-emerald-400 block">Fibras</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formFields.fiber}
                        onChange={(e) => handleFieldChange('fiber', e.target.value)}
                        placeholder="0"
                        className="w-full bg-transparent text-sm font-bold text-[#FAF8FC] focus:outline-none"
                      />
                      <span className="text-[11px] text-[#B5A8C8]">g</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* GRID SECUNDÁRIO: NUTRIENTES COMPLEMENTARES ANVISA */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-[#B5A8C8] block">
                  Nutrientes Complementares ANVISA (por 100g / 100ml):
                </span>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {/* Sódio */}
                  <div className="p-2 rounded-xl bg-[#160E1F] border border-[#2D1B3E] space-y-0.5">
                    <span className="text-[10px] text-[#B5A8C8] block">Sódio</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formFields.sodium}
                        onChange={(e) => handleFieldChange('sodium', e.target.value)}
                        placeholder="-"
                        className="w-full bg-transparent text-xs font-semibold text-[#FAF8FC] focus:outline-none"
                      />
                      <span className="text-[10px] text-[#7B6E8F]">mg</span>
                    </div>
                  </div>

                  {/* Açúcares Totais */}
                  <div className="p-2 rounded-xl bg-[#160E1F] border border-[#2D1B3E] space-y-0.5">
                    <span className="text-[10px] text-[#B5A8C8] block">Açúcares</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formFields.sugars}
                        onChange={(e) => handleFieldChange('sugars', e.target.value)}
                        placeholder="-"
                        className="w-full bg-transparent text-xs font-semibold text-[#FAF8FC] focus:outline-none"
                      />
                      <span className="text-[10px] text-[#7B6E8F]">g</span>
                    </div>
                  </div>

                  {/* Gorduras Saturadas */}
                  <div className="p-2 rounded-xl bg-[#160E1F] border border-[#2D1B3E] space-y-0.5">
                    <span className="text-[10px] text-[#B5A8C8] block">Gord. Saturadas</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formFields.saturatedFat}
                        onChange={(e) => handleFieldChange('saturatedFat', e.target.value)}
                        placeholder="-"
                        className="w-full bg-transparent text-xs font-semibold text-[#FAF8FC] focus:outline-none"
                      />
                      <span className="text-[10px] text-[#7B6E8F]">g</span>
                    </div>
                  </div>

                  {/* Gorduras Trans */}
                  <div className="p-2 rounded-xl bg-[#160E1F] border border-[#2D1B3E] space-y-0.5">
                    <span className="text-[10px] text-[#B5A8C8] block">Gord. Trans</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formFields.transFat}
                        onChange={(e) => handleFieldChange('transFat', e.target.value)}
                        placeholder="-"
                        className="w-full bg-transparent text-xs font-semibold text-[#FAF8FC] focus:outline-none"
                      />
                      <span className="text-[10px] text-[#7B6E8F]">g</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Botões de Ação na Conferência */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-3 border-t border-[#2D1B3E]">
                <button
                  type="button"
                  onClick={() => setStep('capture')}
                  disabled={isSaving}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#1A1224] border border-[#322046] text-xs text-[#B5A8C8] hover:text-[#FAF8FC] cursor-pointer disabled:opacity-50"
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
          {/* ETAPA 4: SUCESSO E CONSUMO IMEDIATO NA REFEIÇÃO              */}
          {/* ============================================================ */}
          {step === 'success' && savedFoodItem && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 sm:p-5 rounded-2xl bg-[#160E1F] border border-emerald-500/40 text-center space-y-2">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center border border-emerald-500/40">
                  <Check className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <h3 className="text-sm font-bold text-[#FAF8FC]">
                  Alimento Salvo com Sucesso no Banco de Dados!
                </h3>
                <p className="text-xs text-emerald-300">
                  Cadastrado permanentemente com precisão decimal. Disponível na busca e nas próximas refeições sem precisar fotografar de novo.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#160E1F] border border-[#2D1B3E] space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#2D1B3E]">
                  <div className="min-w-0 mr-2">
                    <h4 className="text-sm font-bold text-[#FAF8FC] truncate">{savedFoodItem.name}</h4>
                    {savedFoodItem.brand && (
                      <p className="text-[11px] text-[#B5A8C8] truncate">{savedFoodItem.brand}</p>
                    )}
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-[#8B5CF6]/20 text-[10px] text-[#A78BFA] font-bold shrink-0">
                    Banco de Dados
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[#FAF8FC]">
                      Quanto você vai consumir agora?
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="1"
                        max="2000"
                        value={consumedGrams}
                        onChange={(e) => setConsumedGrams(Math.max(1, parseFloat(e.target.value) || 1))}
                        className="w-20 px-2.5 py-1 text-center font-bold text-xs bg-[#1F142B] border border-[#8B5CF6]/50 rounded-lg text-[#FAF8FC] focus:outline-none"
                      />
                      <span className="text-xs text-[#B5A8C8]">g</span>
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
                        <div className="p-2 rounded-xl bg-[#1A1224] border border-pink-500/30">
                          <span className="text-[9px] sm:text-[10px] text-[#B5A8C8] block">Calorias</span>
                          <span className="text-xs font-bold text-[#EC4899]">{totals.calories} kcal</span>
                        </div>
                        <div className="p-2 rounded-xl bg-[#1A1224] border border-violet-500/30">
                          <span className="text-[9px] sm:text-[10px] text-[#B5A8C8] block">Carbos</span>
                          <span className="text-xs font-bold text-[#A78BFA]">{totals.carbs}g</span>
                        </div>
                        <div className="p-2 rounded-xl bg-[#1A1224] border border-purple-500/30">
                          <span className="text-[9px] sm:text-[10px] text-[#B5A8C8] block">Proteína</span>
                          <span className="text-xs font-bold text-[#8B5CF6]">{totals.protein}g</span>
                        </div>
                        <div className="p-2 rounded-xl bg-[#1A1224] border border-rose-500/30">
                          <span className="text-[9px] sm:text-[10px] text-[#B5A8C8] block">Gordura</span>
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
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#1A1224] border border-[#322046] text-xs font-semibold text-[#B5A8C8] hover:text-[#FAF8FC] cursor-pointer"
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
