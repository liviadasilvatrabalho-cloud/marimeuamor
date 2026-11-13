import React, { useState, useEffect, useRef } from 'react';
import {
  Barcode,
  Camera,
  Search,
  X,
  Check,
  AlertCircle,
  Plus,
  RefreshCw,
  Sparkles,
  Upload,
  Database,
  ArrowRight,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Zap,
  ZapOff,
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { FoodItem, MealType, MealSlot } from '../types';
import { INITIAL_MEAL_SLOTS } from '../services/storage';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMealType?: MealType;
  mealSlots?: MealSlot[];
  customFoods?: FoodItem[];
  onSaveMealItem: (item: FoodItem, mealType: MealType) => void;
  onSaveCustomFood: (food: FoodItem) => void;
}

interface OpenFoodFactsResult {
  found: boolean;
  barcode: string;
  productName: string;
  brand: string;
  servingSize: string;
  servingGrams: number;
  per100g: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sodium?: number;
  };
  imageUrl?: string;
  source: string;
}

const COMMON_BRAZILIAN_BARCODES = [
  { name: 'Leite Moça Nestlé', code: '7891000100103' },
  { name: 'Aveia Quaker Flocos', code: '7891000244104' },
  { name: 'Café Melitta', code: '7891021000109' },
  { name: 'Iogurte Danone', code: '7891025114109' },
  { name: 'Arroz Tio João', code: '7896006700010' },
];

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  initialMealType = 'almoco',
  mealSlots,
  customFoods = [],
  onSaveMealItem,
  onSaveCustomFood,
}) => {
  const [mealType, setMealType] = useState<MealType>(initialMealType);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [manualCode, setManualCode] = useState<string>('');
  const [scannedCode, setScannedCode] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusInfo, setStatusInfo] = useState<string | null>(null);
  const [successSavedToast, setSuccessSavedToast] = useState<string | null>(null);

  // Found or active product state
  const [product, setProduct] = useState<OpenFoodFactsResult | null>(null);
  const [consumedGrams, setConsumedGrams] = useState<number>(100);

  const slots = mealSlots && mealSlots.length ? mealSlots : INITIAL_MEAL_SLOTS;

  // Label OCR State fallback
  const [isOcrLoading, setIsOcrLoading] = useState<boolean>(false);
  const labelInputRef = useRef<HTMLInputElement | null>(null);

  // Barcode Photo upload refs (Camera and Gallery)
  const barcodeCameraInputRef = useRef<HTMLInputElement | null>(null);
  const barcodeGalleryInputRef = useRef<HTMLInputElement | null>(null);

  // AI Name estimation state
  const [showAiEstimateForm, setShowAiEstimateForm] = useState<boolean>(false);
  const [aiFoodName, setAiFoodName] = useState<string>('');
  const [aiBrand, setAiBrand] = useState<string>('');
  const [isAiEstimating, setIsAiEstimating] = useState<boolean>(false);

  // Manual fallback state
  const [isManualEntry, setIsManualEntry] = useState<boolean>(false);
  const [manualForm, setManualForm] = useState({
    name: '',
    brand: '',
    barcode: '',
    servingGrams: 100,
    calories: 150,
    protein: 10,
    carbs: 20,
    fat: 5,
    fiber: 2,
  });

  // Saved foods list toggle
  const [showSavedList, setShowSavedList] = useState<boolean>(false);

  // Flashlight / Torch state
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    setMealType(initialMealType);
  }, [initialMealType]);

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      resetState();
    }
  }, [isOpen]);

  const resetState = () => {
    setProduct(null);
    setManualCode('');
    setScannedCode('');
    setIsLoading(false);
    setErrorMsg(null);
    setStatusInfo(null);
    setIsOcrLoading(false);
    setIsManualEntry(false);
    setShowAiEstimateForm(false);
    setAiFoodName('');
    setAiBrand('');
    setSuccessSavedToast(null);
    setIsTorchOn(false);
    setHasTorch(false);
  };

  const toggleTorch = async () => {
    if (scannerRef.current) {
      try {
        await (scannerRef.current as any).applyVideoConstraints({
          advanced: [{ torch: !isTorchOn }],
        });
        setIsTorchOn(!isTorchOn);
      } catch (err) {
        console.warn('Não foi possível alternar a lanterna:', err);
      }
    }
  };

  const startBarcodeScanner = async () => {
    setErrorMsg(null);
    setStatusInfo('Calibrando câmera de alta precisão...');
    setIsScanning(true);
    setIsTorchOn(false);

    try {
      // Suporte completo a formatos de código de barras de alimentos
      const formatsToSupport = [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.QR_CODE,
      ];

      // Habilita BarcodeDetector nativo por hardware do navegador quando disponível
      const scanner = new Html5Qrcode('barcode-scanner-viewport', {
        formatsToSupport,
        verbose: false,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true,
        },
      });
      scannerRef.current = scanner;

      // Configuração de câmera de alta resolução e foco contínuo
      let cameraConfig: any = {
        facingMode: { ideal: 'environment' },
        width: { min: 640, ideal: 1920 },
        height: { min: 480, ideal: 1080 },
        focusMode: 'continuous',
      };

      try {
        const cameras = await Html5Qrcode.getCameras();
        if (cameras && cameras.length > 0) {
          const backCam = cameras.find((c) =>
            c.label.toLowerCase().includes('back') ||
            c.label.toLowerCase().includes('traseira') ||
            c.label.toLowerCase().includes('environment') ||
            c.label.toLowerCase().includes('rear')
          );
          if (backCam) {
            cameraConfig = { deviceId: { exact: backCam.id } };
          }
        }
      } catch (camErr) {
        // Fallback to environment
      }

      await scanner.start(
        cameraConfig,
        {
          fps: 25,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const width = Math.floor(Math.min(viewfinderWidth * 0.94, 380));
            const height = Math.floor(Math.min(viewfinderHeight * 0.65, 220));
            return { width, height };
          },
          aspectRatio: 1.333333,
          disableFlip: false,
        },
        async (decodedText) => {
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate(80); } catch {}
          }
          await stopScanner();
          const clean = decodedText.trim();
          setScannedCode(clean);
          setManualCode(clean);
          setStatusInfo(`Código detectado: ${clean}`);
          fetchBarcodeData(clean);
        },
        () => {
          // Frame error (silencioso)
        }
      );

      // Checa suporte a lanterna
      try {
        const capabilities = (scanner as any).getRunningTrackCapabilities?.();
        if (capabilities && 'torch' in capabilities) {
          setHasTorch(true);
        }
      } catch {}

      setStatusInfo('Aponte para o código de barras (mantenha a ~15cm)');
    } catch (err: any) {
      console.warn('Erro ao inicializar câmera do scanner:', err);
      setIsScanning(false);
      setStatusInfo(null);
      setErrorMsg(
        'A câmera em tempo real não pôde ser iniciada. No celular isso geralmente ocorre porque o site não está em HTTPS (a câmera exige conexão segura). Use "Tirar Foto" ou "Galeria" abaixo, ou digite o número do código manualmente.'
      );
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (e) {
        // Ignored
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  };

  const fetchBarcodeData = async (code: string) => {
    const clean = code.trim();
    if (!clean) return;

    setScannedCode(clean);
    setIsLoading(true);
    setErrorMsg(null);
    setStatusInfo(`Buscando ${clean} nas bases de alimentos...`);
    setProduct(null);

    // 1. Verificar primeiro na lista local em memória customFoods
    const foundCustom = customFoods.find((f) => f.barcode === clean);
    if (foundCustom) {
      const serving = foundCustom.portionGrams || 100;
      const p100 = foundCustom.per100g || {
        calories: Math.round(((foundCustom.calories || 0) / serving) * 100),
        protein: Number((((foundCustom.protein || 0) / serving) * 100).toFixed(1)),
        carbs: Number((((foundCustom.carbs || 0) / serving) * 100).toFixed(1)),
        fat: Number((((foundCustom.fat || 0) / serving) * 100).toFixed(1)),
        fiber: Number((((foundCustom.fiber || 0) / serving) * 100).toFixed(1)),
      };
      setProduct({
        found: true,
        barcode: clean,
        productName: foundCustom.name,
        brand: foundCustom.brand || '',
        servingSize: `${serving}g`,
        servingGrams: serving,
        per100g: {
          calories: p100.calories || 0,
          protein: p100.protein || 0,
          carbs: p100.carbs || 0,
          fat: p100.fat || 0,
          fiber: p100.fiber || 0,
        },
        source: 'Seu Banco de Dados',
      });
      setConsumedGrams(serving);
      setStatusInfo(null);
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/barcode/${clean}`);
      const data = await res.json();

      if (!res.ok || !data.found) {
        setErrorMsg(
          data.message ||
            `Produto com código "${clean}" não consta na base pública Open Food Facts.`
        );
        return;
      }

      setProduct(data);
      setConsumedGrams(data.servingGrams || 100);
      setStatusInfo(null);
    } catch (err: any) {
      console.error('Erro na consulta:', err);
      setErrorMsg('Falha de conexão com a base de dados.');
    } finally {
      setIsLoading(false);
    }
  };

  // Process barcode from image file
  const handleBarcodeImageFile = async (file: File) => {
    if (!file) return;

    setIsLoading(true);
    setErrorMsg(null);
    setStatusInfo('Identificando código de barras na fotografia...');

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;

      // 1. Tentar decodificação local
      try {
        const formatsToSupport = [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
        ];
        const fileScanner = new Html5Qrcode('barcode-file-scan-temp', {
          formatsToSupport,
          verbose: false,
        });

        const decoded = await fileScanner.scanFile(file, true);
        fileScanner.clear();

        if (decoded) {
          const clean = decoded.trim();
          setScannedCode(clean);
          setManualCode(clean);
          setStatusInfo(`Código identificado: ${clean}`);
          await fetchBarcodeData(clean);
          return;
        }
      } catch (scanErr) {
        // Fallback Gemini
      }

      // 2. Multimodal Gemini Vision Reader
      try {
        setStatusInfo('Decodificando números do código de barras com IA...');
        const res = await fetch('/api/gemini/read-barcode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: base64,
            mimeType: file.type || 'image/jpeg',
          }),
        });

        const aiData = await res.json();
        if (!res.ok) {
          setErrorMsg(aiData.error || 'Serviço de leitura por foto indisponível no momento.');
          return;
        }
        if (aiData && aiData.found && aiData.barcode) {
          const clean = aiData.barcode.trim();
          setScannedCode(clean);
          setManualCode(clean);
          setStatusInfo(`Código identificado pela IA: ${clean}`);
          await fetchBarcodeData(clean);
        } else {
          setErrorMsg(
            aiData.reason ||
              'Não foi possível identificar as barras na foto. Tente tirar uma foto mais nítida ou digite os números abaixo.'
          );
        }
      } catch (err: any) {
        setErrorMsg('Erro ao analisar foto do código de barras: ' + err.message);
      } finally {
        setIsLoading(false);
      }
    };

    reader.readAsDataURL(file);
  };

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      fetchBarcodeData(manualCode.trim());
    }
  };

  // OCR de rótulo com Gemini para produtos não encontrados
  const handleLabelImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsOcrLoading(true);
    setErrorMsg(null);
    setStatusInfo('Lendo tabela nutricional do rótulo com IA...');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const base64 = event.target?.result as string;
        const res = await fetch('/api/gemini/ocr-label', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: base64,
            mimeType: file.type || 'image/jpeg',
          }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Erro ao ler rótulo');
        }

        const ocrData = await res.json();
        const servingGrams = Number(ocrData.servingGrams) || 100;
        const ratio = 100 / servingGrams;

        const effectiveBarcode = scannedCode || manualCode || `AUTO-${Date.now()}`;

        const converted: OpenFoodFactsResult = {
          found: true,
          barcode: effectiveBarcode,
          productName: ocrData.productName || 'Produto Escaneado',
          brand: ocrData.brand || '',
          servingSize: ocrData.servingSize || `${servingGrams}g`,
          servingGrams: servingGrams,
          per100g: {
            calories: Math.round((Number(ocrData.calories) || 0) * ratio),
            protein: Number(((Number(ocrData.protein) || 0) * ratio).toFixed(1)),
            carbs: Number(((Number(ocrData.carbs) || 0) * ratio).toFixed(1)),
            fat: Number(((Number(ocrData.fat) || 0) * ratio).toFixed(1)),
            fiber: Number(((Number(ocrData.fiber) || 0) * ratio).toFixed(1)),
            sodium: Number(((Number(ocrData.sodium) || 0) * ratio).toFixed(1)),
          },
          source: 'Rótulo OCR (Salvo no Banco)',
        };

        setProduct(converted);
        setConsumedGrams(servingGrams);
        setStatusInfo(null);
        setErrorMsg(null);
      } catch (err: any) {
        console.error('Erro no OCR:', err);
        setErrorMsg('Não foi possível extrair a tabela nutricional do rótulo: ' + err.message);
      } finally {
        setIsOcrLoading(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Estimativa de nutrição com IA pelo nome do produto
  const handleEstimateWithAi = async () => {
    const name = aiFoodName.trim();
    if (!name) return;

    setIsAiEstimating(true);
    setErrorMsg(null);
    setStatusInfo(`Consultando tabelas TACO/TBCA por IA para "${name}"...`);

    try {
      const effectiveBarcode = scannedCode || manualCode || '';
      const res = await fetch('/api/gemini/estimate-food-nutrition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          foodName: name,
          brand: aiBrand.trim(),
          barcode: effectiveBarcode,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao estimar valores nutricionais');
      }

      const data = await res.json();
      setProduct({
        ...data,
        barcode: effectiveBarcode || data.barcode || `AUTO-${Date.now()}`,
      });
      setConsumedGrams(data.servingGrams || 100);
      setStatusInfo(null);
      setShowAiEstimateForm(false);
      setErrorMsg(null);
    } catch (err: any) {
      console.error('Erro na estimativa IA:', err);
      setErrorMsg('Falha na estimativa por IA: ' + err.message);
    } finally {
      setIsAiEstimating(false);
    }
  };

  // Cálculos dinâmicos em tempo real conforme grams consumidos mudam
  const calculateMacrosForConsumed = () => {
    if (!product) return { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    const ratio = Math.max(0, consumedGrams || 0) / 100;
    return {
      calories: Math.round(product.per100g.calories * ratio),
      protein: Number((product.per100g.protein * ratio).toFixed(1)),
      carbs: Number((product.per100g.carbs * ratio).toFixed(1)),
      fat: Number((product.per100g.fat * ratio).toFixed(1)),
      fiber: Number((product.per100g.fiber * ratio).toFixed(1)),
    };
  };

  const currentMacros = calculateMacrosForConsumed();

  // Ajustes rápidos de gramas (+10g, -10g, etc.)
  const adjustGrams = (delta: number) => {
    setConsumedGrams((prev) => Math.max(1, Math.min(2500, (prev || 0) + delta)));
  };

  // Salvar alimento na refeição e guardar no banco de dados para reuso
  const handleConfirmAdd = () => {
    if (!product) return;

    const effectiveBarcode = product.barcode || scannedCode || manualCode || undefined;

    const foodItem: FoodItem = {
      id: `food-${Date.now()}`,
      name: product.productName || 'Alimento Registrado',
      brand: product.brand || undefined,
      barcode: effectiveBarcode,
      per100g: {
        calories: product.per100g?.calories,
        protein: product.per100g?.protein,
        carbs: product.per100g?.carbs,
        fat: product.per100g?.fat,
        fiber: product.per100g?.fiber,
        sodium: product.per100g?.sodium,
      },
      prepState: 'cru',
      portionGrams: Math.max(1, consumedGrams),
      calories: currentMacros.calories,
      protein: currentMacros.protein,
      carbs: currentMacros.carbs,
      fat: currentMacros.fat,
      fiber: currentMacros.fiber,
      source: (product.source as any) || 'Open Food Facts',
      verified: true,
    };

    // 1. Salva na refeição atual
    onSaveMealItem(foodItem, mealType);

    // 2. Salva no banco de dados para reuso sem precisar escanear de novo
    onSaveCustomFood(foodItem);

    onClose();
  };

  // Salvar cadastro manual
  const handleSaveManualForm = () => {
    const portion = Math.max(1, manualForm.servingGrams || 100);
    const ratio = 100 / portion;
    const effectiveBarcode =
      manualForm.barcode.trim() || scannedCode || manualCode || undefined;

    const per100g = {
      calories: Math.round(manualForm.calories * ratio),
      protein: Number((manualForm.protein * ratio).toFixed(1)),
      carbs: Number((manualForm.carbs * ratio).toFixed(1)),
      fat: Number((manualForm.fat * ratio).toFixed(1)),
      fiber: Number((manualForm.fiber * ratio).toFixed(1)),
    };

    const foodItem: FoodItem = {
      id: `manual-${Date.now()}`,
      name: manualForm.name.trim() || 'Alimento Personalizado',
      brand: manualForm.brand.trim() || undefined,
      barcode: effectiveBarcode,
      prepState: 'cru',
      portionGrams: portion,
      calories: manualForm.calories,
      protein: manualForm.protein,
      carbs: manualForm.carbs,
      fat: manualForm.fat,
      fiber: manualForm.fiber,
      per100g,
      source: 'Manual',
      verified: true,
    };

    onSaveMealItem(foodItem, mealType);
    onSaveCustomFood(foodItem);
    onClose();
  };

  // Carregar um alimento previamente salvo direto do banco local
  const handleSelectSavedFood = (item: FoodItem) => {
    const serving = item.portionGrams || 100;
    const p100 = item.per100g || {
      calories: Math.round(((item.calories || 0) / serving) * 100),
      protein: Number((((item.protein || 0) / serving) * 100).toFixed(1)),
      carbs: Number((((item.carbs || 0) / serving) * 100).toFixed(1)),
      fat: Number((((item.fat || 0) / serving) * 100).toFixed(1)),
      fiber: Number((((item.fiber || 0) / serving) * 100).toFixed(1)),
    };

    setProduct({
      found: true,
      barcode: item.barcode || '',
      productName: item.name,
      brand: item.brand || '',
      servingSize: `${serving}g`,
      servingGrams: serving,
      per100g: {
        calories: p100.calories || 0,
        protein: p100.protein || 0,
        carbs: p100.carbs || 0,
        fat: p100.fat || 0,
        fiber: p100.fiber || 0,
      },
      source: 'Seu Banco de Dados',
    });
    setConsumedGrams(serving);
    setErrorMsg(null);
    setStatusInfo(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="relative w-full max-w-xl bg-[#18121F] border-t sm:border border-[#33263F] rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 pb-safe shadow-2xl max-h-[94vh] overflow-y-auto overflow-x-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#33263F]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-[#6D28D9] to-[#8B5CF6] text-white">
              <Barcode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#F8F5FC]">
                Scanner de Código de Barras & Rótulos
              </h2>
              <p className="text-xs text-[#B8AFC4]">
                Reconhecimento instantâneo, OCR por foto e salvamento no banco
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#B8AFC4] hover:text-[#F8F5FC] hover:bg-[#22192C] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Temp off-screen element for barcode file decoding */}
        <div id="barcode-file-scan-temp" style={{ position: 'absolute', left: '-9999px', top: 0 }} />

        {/* Body */}
        <div className="py-4 space-y-4">
          {/* Meal selector */}
          <div>
            <label className="text-xs font-medium text-[#B8AFC4] block mb-1.5">
              Adicionar em qual refeição?
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

          {!product && !isManualEntry && (
            <>
              {/* Camera Scanner Viewport */}
              <div className="relative rounded-2xl bg-[#100C16] border border-[#33263F] overflow-hidden min-h-[200px] flex flex-col items-center justify-center p-4">
                <div id="barcode-scanner-viewport" className="w-full max-w-sm rounded-xl overflow-hidden relative" />

                {/* Laser scan reticle animation when camera is scanning */}
                {isScanning && (
                  <div className="pointer-events-none absolute inset-x-8 inset-y-10 flex flex-col justify-between border-2 border-[#8B5CF6]/50 rounded-2xl overflow-hidden shadow-[0_0_25px_rgba(139,92,246,0.25)]">
                    <div className="flex justify-between p-2">
                      <div className="w-5 h-5 border-t-2 border-l-2 border-[#EC4899] rounded-tl-md" />
                      <div className="w-5 h-5 border-t-2 border-r-2 border-[#EC4899] rounded-tr-md" />
                    </div>
                    <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-[#EC4899] to-transparent shadow-[0_0_12px_#EC4899] animate-pulse" />
                    <div className="flex justify-between p-2">
                      <div className="w-5 h-5 border-b-2 border-l-2 border-[#EC4899] rounded-bl-md" />
                      <div className="w-5 h-5 border-b-2 border-r-2 border-[#EC4899] rounded-br-md" />
                    </div>
                  </div>
                )}

                {!isScanning ? (
                  <div className="text-center space-y-3 py-3 w-full">
                    <div className="w-12 h-12 rounded-full bg-[#18121F] border border-[#33263F] mx-auto flex items-center justify-center text-[#A78BFA]">
                      <Barcode className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#F8F5FC]">
                        Ler código de barras do produto
                      </p>
                      <p className="text-xs text-[#B8AFC4] mt-0.5 max-w-sm mx-auto">
                        Câmera de alta precisão com suporte a EAN-13, EAN-8, UPC e foto.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={startBarcodeScanner}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] hover:from-[#7C3AED] hover:to-[#A78BFA] text-white text-xs font-semibold shadow-md shadow-[#8B5CF6]/30 transition-all cursor-pointer"
                      >
                        <Camera className="w-4 h-4" />
                        Câmera ao Vivo
                      </button>

                      <button
                        type="button"
                        onClick={() => barcodeCameraInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#18121F] hover:bg-[#22192C] text-[#F8F5FC] border border-[#33263F] text-xs font-medium transition-colors cursor-pointer"
                      >
                        <Camera className="w-4 h-4 text-[#EC4899]" />
                        Tirar Foto
                      </button>

                      <button
                        type="button"
                        onClick={() => barcodeGalleryInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#18121F] hover:bg-[#22192C] text-[#F8F5FC] border border-[#33263F] text-xs font-medium transition-colors cursor-pointer"
                      >
                        <Upload className="w-4 h-4 text-[#A78BFA]" />
                        Galeria
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center justify-center gap-2.5 z-10">
                    {hasTorch && (
                      <button
                        type="button"
                        onClick={toggleTorch}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                          isTorchOn
                            ? 'bg-amber-400 text-black border-amber-300 shadow-md shadow-amber-400/30'
                            : 'bg-[#18121F] text-[#B8AFC4] border-[#33263F] hover:text-white'
                        }`}
                      >
                        {isTorchOn ? <ZapOff className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
                        <span>{isTorchOn ? 'Apagar Lanterna' : 'Ligar Lanterna'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={stopScanner}
                      className="px-4 py-1.5 rounded-xl bg-[#18121F] border border-[#33263F] text-xs text-[#B8AFC4] hover:text-[#F8F5FC] cursor-pointer"
                    >
                      Parar Câmera
                    </button>
                  </div>
                )}
              </div>

              {/* Status Indicator */}
              {statusInfo && (
                <div className="p-3 rounded-xl bg-[#8B5CF6]/15 border border-[#8B5CF6]/40 text-xs text-[#A78BFA] flex items-center justify-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{statusInfo}</span>
                </div>
              )}

              {/* Hidden file inputs for barcode photos */}
              <input
                ref={barcodeCameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleBarcodeImageFile(f);
                  e.target.value = '';
                }}
                className="hidden"
              />

              <input
                ref={barcodeGalleryInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleBarcodeImageFile(f);
                  e.target.value = '';
                }}
                className="hidden"
              />

              {/* Manual Barcode Input Form */}
              <form onSubmit={handleManualSearch} className="space-y-1.5">
                <label className="text-xs font-medium text-[#B8AFC4]">
                  Ou digite o código de barras manualmente:
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={manualCode}
                      onChange={(e) => {
                        setManualCode(e.target.value);
                        setScannedCode(e.target.value.trim());
                      }}
                      placeholder="Ex: 7891000100103"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#100C16] border border-[#33263F] text-xs text-[#F8F5FC] font-mono-numbers focus:outline-none focus:border-[#8B5CF6]"
                    />
                    <Search className="w-4 h-4 text-[#B8AFC4] absolute left-3 top-3" />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading || !manualCode.trim()}
                    className="px-4 py-2.5 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-xs font-semibold disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Consultar'}
                  </button>
                </div>
              </form>

              {/* FALLBACK OPTIONS WHEN NOT FOUND */}
              {errorMsg && (
                <div className="p-4 rounded-2xl bg-[#100C16] border border-amber-500/40 text-xs space-y-3 animate-fadeIn">
                  <div className="flex items-start gap-2.5 text-amber-300">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <div>
                      <p className="font-semibold text-amber-200">
                        {scannedCode
                          ? `Código ${scannedCode} não consta no Open Food Facts.`
                          : 'Produto não encontrado na base pública.'}
                      </p>
                      <p className="text-[11px] text-[#B8AFC4] mt-0.5">
                        Não tem problema! Escolha uma das opções abaixo para capturar a tabela nutricional. O produto será{' '}
                        <strong className="text-white">salvo no seu banco de dados</strong> para você nunca mais precisar escanear:
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    {/* Opção 1: OCR por foto da tabela */}
                    <button
                      type="button"
                      onClick={() => labelInputRef.current?.click()}
                      className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl bg-[#18121F] border border-[#8B5CF6]/50 hover:bg-[#22192C] text-[#A78BFA] transition-all cursor-pointer text-center group"
                    >
                      <Camera className="w-4 h-4 text-[#EC4899] group-hover:scale-110 transition-transform" />
                      <span className="font-semibold text-xs text-[#F8F5FC]">Fotografar Rótulo</span>
                      <span className="text-[10px] text-[#B8AFC4]">OCR com IA extrai os nutrientes</span>
                    </button>

                    {/* Opção 2: Estimativa por IA pelo nome */}
                    <button
                      type="button"
                      onClick={() => setShowAiEstimateForm(!showAiEstimateForm)}
                      className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl bg-[#18121F] border border-emerald-500/40 hover:bg-[#22192C] text-emerald-400 transition-all cursor-pointer text-center group"
                    >
                      <Sparkles className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                      <span className="font-semibold text-xs text-[#F8F5FC]">Estimar com IA</span>
                      <span className="text-[10px] text-[#B8AFC4]">Digite o nome do produto</span>
                    </button>

                    {/* Opção 3: Digitar Manualmente */}
                    <button
                      type="button"
                      onClick={() => {
                        setManualForm({
                          ...manualForm,
                          barcode: scannedCode || manualCode,
                        });
                        setIsManualEntry(true);
                      }}
                      className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl bg-[#18121F] border border-[#33263F] hover:bg-[#22192C] text-[#F8F5FC] transition-all cursor-pointer text-center group"
                    >
                      <Plus className="w-4 h-4 text-[#A78BFA] group-hover:scale-110 transition-transform" />
                      <span className="font-semibold text-xs text-[#F8F5FC]">Digitar Macros</span>
                      <span className="text-[10px] text-[#B8AFC4]">Preencha a tabela você mesmo</span>
                    </button>
                  </div>

                  {/* Formulário de estimativa com IA */}
                  {showAiEstimateForm && (
                    <div className="p-3 rounded-xl bg-[#18121F] border border-emerald-500/30 space-y-2 mt-2">
                      <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-xs">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Qual é o nome do produto?</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={aiFoodName}
                          onChange={(e) => setAiFoodName(e.target.value)}
                          placeholder="Ex: Iogurte Natural Desnatado"
                          className="px-3 py-2 rounded-lg bg-[#100C16] border border-[#33263F] text-xs text-[#F8F5FC] focus:outline-none focus:border-emerald-500"
                        />
                        <input
                          type="text"
                          value={aiBrand}
                          onChange={(e) => setAiBrand(e.target.value)}
                          placeholder="Marca (opcional, ex: Nestlé)"
                          className="px-3 py-2 rounded-lg bg-[#100C16] border border-[#33263F] text-xs text-[#F8F5FC] focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleEstimateWithAi}
                        disabled={isAiEstimating || !aiFoodName.trim()}
                        className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        {isAiEstimating ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        <span>Obter Tabela Nutricional por IA</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Input invisível para upload de foto do rótulo OCR */}
              <input
                ref={labelInputRef}
                type="file"
                accept="image/*"
                onChange={handleLabelImageUpload}
                className="hidden"
              />

              {isOcrLoading && (
                <div className="p-4 rounded-xl bg-[#100C16] border border-[#8B5CF6]/40 flex items-center justify-center gap-2 text-xs text-[#A78BFA]">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Extraindo tabela nutricional do rótulo com IA...</span>
                </div>
              )}

              {/* Seção de produtos previamente salvos no banco local */}
              {customFoods.length > 0 && (
                <div className="pt-2 border-t border-[#33263F]/60">
                  <button
                    type="button"
                    onClick={() => setShowSavedList(!showSavedList)}
                    className="w-full flex items-center justify-between text-xs text-[#A78BFA] hover:text-white font-semibold py-1 cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Meus Alimentos Salvos no Banco ({customFoods.length})</span>
                    </div>
                    {showSavedList ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>

                  {showSavedList && (
                    <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {customFoods.map((saved) => (
                        <div
                          key={saved.id}
                          onClick={() => handleSelectSavedFood(saved)}
                          className="p-2 rounded-xl bg-[#100C16] hover:bg-[#22192C] border border-[#33263F] flex items-center justify-between gap-2 cursor-pointer transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[#F8F5FC] truncate">
                              {saved.name}
                            </p>
                            <p className="text-[10px] text-[#B8AFC4] truncate">
                              {saved.brand ? `${saved.brand} · ` : ''}
                              {saved.barcode ? `Cód: ${saved.barcode}` : 'Manual'}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-xs font-bold text-[#EC4899] font-mono-numbers">
                              {saved.calories} kcal
                            </span>
                            <span className="text-[10px] text-[#A78BFA] block font-mono-numbers">
                              por {saved.portionGrams || 100}g
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Exemplos rápidos para testar a base */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] text-[#B8AFC4] block">
                  Exemplos para testar busca de código de barras:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_BRAZILIAN_BARCODES.map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => {
                        setManualCode(item.code);
                        fetchBarcodeData(item.code);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[#100C16] hover:bg-[#22192C] border border-[#33263F] text-[11px] text-[#A78BFA] transition-colors cursor-pointer"
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* PRODUCT VIEW COM AJUSTE DINÂMICO DE GRAMAS E CALORIAS */}
          {product && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-[#100C16] border border-[#8B5CF6]/50 space-y-3.5">
                {/* Cabeçalho do produto */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded-md bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 text-[10px] text-[#A78BFA] uppercase tracking-wider font-semibold">
                        {product.source}
                      </span>
                      {product.barcode && (
                        <span className="px-2 py-0.5 rounded-md bg-[#18121F] border border-[#33263F] text-[10px] text-[#B8AFC4] font-mono-numbers">
                          Cód: {product.barcode}
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-[#F8F5FC] mt-1.5">
                      {product.productName}
                    </h3>
                    {product.brand && (
                      <p className="text-xs text-[#B8AFC4]">Marca: {product.brand}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setProduct(null)}
                    className="text-xs text-[#B8AFC4] hover:text-[#F8F5FC] px-2 py-1 rounded-lg bg-[#18121F] border border-[#33263F] cursor-pointer"
                  >
                    Trocar
                  </button>
                </div>

                {/* MODIFICADOR DINÂMICO DE QUANTIDADE / GRAMAS */}
                <div className="p-3.5 rounded-xl bg-[#18121F] border border-[#33263F] space-y-2.5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <label className="text-xs font-semibold text-[#F8F5FC] block">
                        Quantidade que você vai consumir:
                      </label>
                      <span className="text-[11px] text-[#A78BFA]">
                        Porção de referência do rótulo: {product.servingSize || `${product.servingGrams}g`}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="1"
                        max="2500"
                        value={consumedGrams}
                        onChange={(e) => setConsumedGrams(parseFloat(e.target.value) || 0)}
                        className="w-24 px-2.5 py-1.5 text-center font-mono-numbers text-base font-bold text-white bg-[#100C16] border border-[#8B5CF6] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/50 shadow-inner"
                      />
                      <span className="text-xs font-semibold text-[#B8AFC4]">g</span>
                    </div>
                  </div>

                  {/* Botões de ajuste rápido de gramas */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => adjustGrams(-50)}
                      className="px-2 py-1 rounded-lg bg-[#100C16] hover:bg-[#22192C] border border-[#33263F] text-[11px] text-[#B8AFC4] font-mono-numbers cursor-pointer"
                    >
                      -50g
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustGrams(-10)}
                      className="px-2 py-1 rounded-lg bg-[#100C16] hover:bg-[#22192C] border border-[#33263F] text-[11px] text-[#B8AFC4] font-mono-numbers cursor-pointer"
                    >
                      -10g
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustGrams(10)}
                      className="px-2 py-1 rounded-lg bg-[#100C16] hover:bg-[#22192C] border border-[#33263F] text-[11px] text-[#B8AFC4] font-mono-numbers cursor-pointer"
                    >
                      +10g
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustGrams(50)}
                      className="px-2 py-1 rounded-lg bg-[#100C16] hover:bg-[#22192C] border border-[#33263F] text-[11px] text-[#B8AFC4] font-mono-numbers cursor-pointer"
                    >
                      +50g
                    </button>
                    <button
                      type="button"
                      onClick={() => setConsumedGrams(product.servingGrams || 100)}
                      className="ml-auto px-2.5 py-1 rounded-lg bg-[#8B5CF6]/20 hover:bg-[#8B5CF6]/30 border border-[#8B5CF6]/40 text-[11px] text-[#A78BFA] font-medium cursor-pointer"
                    >
                      1 porção ({product.servingGrams || 100}g)
                    </button>
                  </div>
                </div>

                {/* CALORIAS E MACROS RECALCULADOS EM TEMPO REAL */}
                <div>
                  <div className="flex items-center justify-between pb-1.5">
                    <span className="text-[11px] text-[#B8AFC4] font-medium">
                      Valores recalculados para {consumedGrams}g:
                    </span>
                    <span className="text-[10px] text-[#B8AFC4]/80">
                      Base: 100g = {product.per100g.calories} kcal
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2 font-mono-numbers text-center">
                    <div className="p-2.5 rounded-xl bg-[#18121F] border border-pink-500/30">
                      <span className="text-[10px] text-[#B8AFC4] block">Calorias</span>
                      <span className="text-sm font-bold text-[#EC4899]">
                        {currentMacros.calories} kcal
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#18121F] border border-purple-500/30">
                      <span className="text-[10px] text-[#B8AFC4] block">Proteína</span>
                      <span className="text-sm font-bold text-[#8B5CF6]">
                        {currentMacros.protein}g
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#18121F] border border-violet-500/30">
                      <span className="text-[10px] text-[#B8AFC4] block">Carbos</span>
                      <span className="text-sm font-bold text-[#A78BFA]">
                        {currentMacros.carbs}g
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#18121F] border border-rose-500/30">
                      <span className="text-[10px] text-[#B8AFC4] block">Gorduras</span>
                      <span className="text-sm font-bold text-[#F472B6]">
                        {currentMacros.fat}g
                      </span>
                    </div>
                  </div>
                </div>

                {/* Aviso amigável de salvamento persistente no banco */}
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] flex items-center gap-2">
                  <Database className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>
                    Ao confirmar, este produto será <strong className="text-emerald-200">salvo no seu banco de dados</strong>.
                    Nas próximas vezes, você poderá usá-lo sem precisar escanear de novo!
                  </span>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setProduct(null)}
                  className="px-4 py-2.5 rounded-xl bg-[#18121F] border border-[#33263F] text-xs text-[#B8AFC4] hover:text-[#F8F5FC] cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAdd}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#8B5CF6] to-[#EC4899] text-white text-xs font-bold shadow-lg shadow-[#8B5CF6]/30 hover:opacity-95 transition-all cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    Salvar na refeição ({currentMacros.calories} kcal)
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* FORMULÁRIO MANUAL */}
          {isManualEntry && (
            <div className="space-y-3.5 p-4 rounded-2xl bg-[#100C16] border border-[#33263F] animate-fadeIn">
              <div className="flex items-center justify-between pb-2 border-b border-[#33263F]">
                <div>
                  <h3 className="text-xs font-bold text-[#F8F5FC]">
                    Cadastrar Alimento Manualmente
                  </h3>
                  <p className="text-[10px] text-[#B8AFC4]">
                    Ficará salvo no seu banco de dados para todas as próximas refeições
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsManualEntry(false)}
                  className="text-xs text-[#B8AFC4] hover:text-[#F8F5FC] cursor-pointer"
                >
                  Cancelar
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="space-y-1 sm:col-span-1">
                  <label className="text-[11px] text-[#B8AFC4]">Nome do produto *</label>
                  <input
                    type="text"
                    value={manualForm.name}
                    onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
                    placeholder="Ex: Iogurte Grego Maracujá"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#18121F] border border-[#33263F] text-xs text-[#F8F5FC] focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-[#B8AFC4]">Marca</label>
                  <input
                    type="text"
                    value={manualForm.brand}
                    onChange={(e) => setManualForm({ ...manualForm, brand: e.target.value })}
                    placeholder="Ex: Danone, Yopro, etc."
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#18121F] border border-[#33263F] text-xs text-[#F8F5FC] focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-[#B8AFC4]">Código de barras</label>
                  <input
                    type="text"
                    value={manualForm.barcode}
                    onChange={(e) => setManualForm({ ...manualForm, barcode: e.target.value })}
                    placeholder="Ex: 7891000..."
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#18121F] border border-[#33263F] text-xs text-[#F8F5FC] font-mono-numbers focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 font-mono-numbers">
                <div className="space-y-1">
                  <label className="text-[10px] text-[#B8AFC4]">Porção (g)</label>
                  <input
                    type="number"
                    value={manualForm.servingGrams}
                    onChange={(e) =>
                      setManualForm({
                        ...manualForm,
                        servingGrams: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-2 py-1.5 rounded-lg bg-[#18121F] border border-[#33263F] text-xs text-[#F8F5FC]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-[#B8AFC4]">Calorias (kcal)</label>
                  <input
                    type="number"
                    value={manualForm.calories}
                    onChange={(e) =>
                      setManualForm({
                        ...manualForm,
                        calories: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-2 py-1.5 rounded-lg bg-[#18121F] border border-[#33263F] text-xs text-[#EC4899] font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-[#B8AFC4]">Proteína (g)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={manualForm.protein}
                    onChange={(e) =>
                      setManualForm({
                        ...manualForm,
                        protein: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-2 py-1.5 rounded-lg bg-[#18121F] border border-[#33263F] text-xs text-[#8B5CF6]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-[#B8AFC4]">Carbos (g)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={manualForm.carbs}
                    onChange={(e) =>
                      setManualForm({
                        ...manualForm,
                        carbs: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-2 py-1.5 rounded-lg bg-[#18121F] border border-[#33263F] text-xs text-[#A78BFA]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-[#B8AFC4]">Gorduras (g)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={manualForm.fat}
                    onChange={(e) =>
                      setManualForm({
                        ...manualForm,
                        fat: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-2 py-1.5 rounded-lg bg-[#18121F] border border-[#33263F] text-xs text-[#F472B6]"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsManualEntry(false)}
                  className="px-3.5 py-2 rounded-xl bg-[#18121F] border border-[#33263F] text-xs text-[#B8AFC4] hover:text-[#F8F5FC] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveManualForm}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#EC4899] text-white text-xs font-bold cursor-pointer"
                >
                  Salvar Alimento & Guardar no Banco
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
