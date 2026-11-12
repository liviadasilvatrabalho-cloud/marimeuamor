import React, { useState, useEffect, useRef } from 'react';
import {
  Barcode,
  Camera,
  Search,
  X,
  Check,
  AlertCircle,
  FileText,
  Plus,
  RefreshCw,
  Sparkles,
  Upload,
  Image as ImageIcon,
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { FoodItem, MealType, MealSlot } from '../types';
import { INITIAL_MEAL_SLOTS } from '../services/storage';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMealType?: MealType;
  mealSlots?: MealSlot[];
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
  onSaveMealItem,
  onSaveCustomFood,
}) => {
  const [mealType, setMealType] = useState<MealType>(initialMealType);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [manualCode, setManualCode] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusInfo, setStatusInfo] = useState<string | null>(null);

  // Found product state
  const [product, setProduct] = useState<OpenFoodFactsResult | null>(null);
  const [consumedGrams, setConsumedGrams] = useState<number>(100);

  const slots = mealSlots && mealSlots.length ? mealSlots : INITIAL_MEAL_SLOTS;

  // Label OCR State fallback
  const [isOcrLoading, setIsOcrLoading] = useState<boolean>(false);
  const labelInputRef = useRef<HTMLInputElement | null>(null);

  // Barcode Photo upload refs (Camera and Gallery)
  const barcodeCameraInputRef = useRef<HTMLInputElement | null>(null);
  const barcodeGalleryInputRef = useRef<HTMLInputElement | null>(null);

  // Manual fallback state
  const [isManualEntry, setIsManualEntry] = useState<boolean>(false);
  const [manualForm, setManualForm] = useState({
    name: '',
    brand: '',
    servingGrams: 100,
    calories: 150,
    protein: 10,
    carbs: 20,
    fat: 5,
    fiber: 2,
  });

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
    setIsLoading(false);
    setErrorMsg(null);
    setStatusInfo(null);
    setIsOcrLoading(false);
    setIsManualEntry(false);
  };

  const startBarcodeScanner = async () => {
    setErrorMsg(null);
    setStatusInfo('Iniciando câmera...');
    setIsScanning(true);

    try {
      // Formats for food packages (EAN-13, EAN-8, UPC, Code 128)
      const formatsToSupport = [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.QR_CODE,
      ];

      const scanner = new Html5Qrcode('barcode-scanner-viewport', {
        formatsToSupport,
        verbose: false,
      });
      scannerRef.current = scanner;

      // Try back camera first
      let cameraConfig: any = { facingMode: 'environment' };
      try {
        const cameras = await Html5Qrcode.getCameras();
        if (cameras && cameras.length > 0) {
          const backCam = cameras.find((c) =>
            c.label.toLowerCase().includes('back') ||
            c.label.toLowerCase().includes('traseira') ||
            c.label.toLowerCase().includes('environment')
          );
          cameraConfig = backCam ? backCam.id : cameras[0].id;
        }
      } catch (camErr) {
        // Continue with facingMode environment fallback
      }

      await scanner.start(
        cameraConfig,
        {
          fps: 15,
          qrbox: { width: 280, height: 160 },
          aspectRatio: 1.5,
        },
        async (decodedText) => {
          await stopScanner();
          setStatusInfo(`Código detectado: ${decodedText}`);
          fetchBarcodeData(decodedText);
        },
        () => {
          // Frame error (silent during search)
        }
      );

      setStatusInfo('Aponte para as barras pretas do código...');
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

    setIsLoading(true);
    setErrorMsg(null);
    setStatusInfo(`Buscando ${clean} no Open Food Facts...`);
    setProduct(null);

    try {
      const res = await fetch(`/api/barcode/${clean}`);
      const data = await res.json();

      if (!res.ok || !data.found) {
        setErrorMsg(
          data.message || `Produto com código "${clean}" não encontrado na base de dados.`
        );
        return;
      }

      setProduct(data);
      setConsumedGrams(data.servingGrams || 100);
      setStatusInfo(null);
    } catch (err: any) {
      console.error('Erro na consulta:', err);
      setErrorMsg('Falha de conexão com a base Open Food Facts.');
    } finally {
      setIsLoading(false);
    }
  };

  // Process barcode from image file (via Html5Qrcode.scanFile or Gemini Vision fallback)
  const handleBarcodeImageFile = async (file: File) => {
    if (!file) return;

    setIsLoading(true);
    setErrorMsg(null);
    setStatusInfo('Identificando código de barras na fotografia...');

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;

      // 1. Try local Html5Qrcode scanFile first
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
          setStatusInfo(`Código identificado: ${decoded}`);
          await fetchBarcodeData(decoded);
          return;
        }
      } catch (scanErr) {
        console.warn('scanFile falhou, tentando Gemini:', scanErr);
        // Fallback to Gemini AI vision below
      }

      // 2. Multimodal Gemini Vision Reader (reads digits printed on the package)
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
          setStatusInfo(`Código identificado pela IA: ${aiData.barcode}`);
          await fetchBarcodeData(aiData.barcode);
          return;
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

  // Label OCR with Gemini for nutrition table
  const handleLabelImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsOcrLoading(true);
    setErrorMsg(null);
    setStatusInfo('Lendo tabela nutricional por OCR com Gemini...');

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

        const converted: OpenFoodFactsResult = {
          found: true,
          barcode: manualCode || 'RÓTULO-FOTO',
          productName: ocrData.productName || 'Produto do Rótulo',
          brand: ocrData.brand || '',
          servingSize: ocrData.servingSize || `${servingGrams}g`,
          servingGrams: servingGrams,
          per100g: {
            calories: Math.round((Number(ocrData.calories) || 0) * ratio),
            protein: Number(((Number(ocrData.protein) || 0) * ratio).toFixed(1)),
            carbs: Number(((Number(ocrData.carbs) || 0) * ratio).toFixed(1)),
            fat: Number(((Number(ocrData.fat) || 0) * ratio).toFixed(1)),
            fiber: Number(((Number(ocrData.fiber) || 0) * ratio).toFixed(1)),
          },
          source: 'Rótulo OCR',
        };

        setProduct(converted);
        setConsumedGrams(servingGrams);
        setStatusInfo(null);
      } catch (err: any) {
        console.error('Erro no OCR:', err);
        setErrorMsg('Não foi possível extrair a tabela nutricional: ' + err.message);
      } finally {
        setIsOcrLoading(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Calculations for current consumed grams
  const calculateMacrosForConsumed = () => {
    if (!product) return { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    const ratio = (consumedGrams || 0) / 100;
    return {
      calories: Math.round(product.per100g.calories * ratio),
      protein: Number((product.per100g.protein * ratio).toFixed(1)),
      carbs: Number((product.per100g.carbs * ratio).toFixed(1)),
      fat: Number((product.per100g.fat * ratio).toFixed(1)),
      fiber: Number((product.per100g.fiber * ratio).toFixed(1)),
    };
  };

  const currentMacros = calculateMacrosForConsumed();

  const handleConfirmAdd = () => {
    if (!product) return;

    const foodItem: FoodItem = {
      id: `barcode-${Date.now()}`,
      name: product.productName || 'Alimento Código de Barras',
      brand: product.brand || undefined,
      barcode: product.barcode || undefined,
      per100g: {
        calories: product.per100g?.calories,
        protein: product.per100g?.protein,
        carbs: product.per100g?.carbs,
        fat: product.per100g?.fat,
        fiber: product.per100g?.fiber,
        sodium: product.per100g?.sodium,
      },
      prepState: 'cru',
      portionGrams: consumedGrams,
      calories: currentMacros.calories,
      protein: currentMacros.protein,
      carbs: currentMacros.carbs,
      fat: currentMacros.fat,
      fiber: currentMacros.fiber,
      source: (product.source as any) || 'Open Food Facts',
      verified: true,
    };

    onSaveMealItem(foodItem, mealType);
    onSaveCustomFood(foodItem);
    onClose();
  };

  const handleSaveManualForm = () => {
    const foodItem: FoodItem = {
      id: `manual-prod-${Date.now()}`,
      name: manualForm.name || 'Alimento Personalizado',
      brand: manualForm.brand || undefined,
      prepState: 'cru',
      portionGrams: manualForm.servingGrams,
      calories: manualForm.calories,
      protein: manualForm.protein,
      carbs: manualForm.carbs,
      fat: manualForm.fat,
      fiber: manualForm.fiber,
      source: 'Manual',
      verified: true,
    };

    onSaveMealItem(foodItem, mealType);
    onSaveCustomFood(foodItem);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="relative w-full max-w-xl bg-[#18121F] border-t sm:border border-[#33263F] rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 pb-safe shadow-2xl max-h-[92vh] overflow-y-auto overflow-x-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#33263F]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-[#6D28D9] to-[#8B5CF6] text-white">
              <Barcode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#F8F5FC]">
                Scanner de Código de Barras
              </h2>
              <p className="text-xs text-[#B8AFC4]">
                Câmera ao vivo, foto da embalagem ou base Open Food Facts
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

        {/* Temp element for file barcode decode (kept in DOM; off-screen for html5-qrcode) */}
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
                  className={`py-2 px-1 text-center rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
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
              <div className="relative rounded-2xl bg-[#100C16] border border-[#33263F] overflow-hidden min-h-[220px] flex flex-col items-center justify-center p-4">
                <div id="barcode-scanner-viewport" className="w-full max-w-sm rounded-xl overflow-hidden" />

                {!isScanning ? (
                  <div className="text-center space-y-3 py-4 w-full">
                    <div className="w-14 h-14 rounded-full bg-[#18121F] border border-[#33263F] mx-auto flex items-center justify-center text-[#A78BFA]">
                      <Barcode className="w-7 h-7" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#F8F5FC]">
                        Ler código de barras de alimentos
                      </p>
                      <p className="text-xs text-[#B8AFC4] mt-1 max-w-sm mx-auto">
                        Aponte a câmera ao vivo, tire uma foto do código ou selecione da sua galeria.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={startBarcodeScanner}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] hover:from-[#7C3AED] hover:to-[#A78BFA] text-white text-xs font-semibold shadow-md shadow-[#8B5CF6]/30 transition-all cursor-pointer"
                      >
                        <Camera className="w-4 h-4" />
                        Câmera ao Vivo
                      </button>

                      <button
                        type="button"
                        onClick={() => barcodeCameraInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#18121F] hover:bg-[#22192C] text-[#F8F5FC] border border-[#33263F] text-xs font-medium transition-colors cursor-pointer"
                      >
                        <Camera className="w-4 h-4 text-[#EC4899]" />
                        Tirar Foto
                      </button>

                      <button
                        type="button"
                        onClick={() => barcodeGalleryInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#18121F] hover:bg-[#22192C] text-[#F8F5FC] border border-[#33263F] text-xs font-medium transition-colors cursor-pointer"
                      >
                        <Upload className="w-4 h-4 text-[#A78BFA]" />
                        Galeria
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={stopScanner}
                      className="px-4 py-2 rounded-xl bg-[#18121F] border border-[#33263F] text-xs text-[#B8AFC4] hover:text-[#F8F5FC]"
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

              {/* Hidden file inputs for barcode photo */}
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
                      onChange={(e) => setManualCode(e.target.value)}
                      placeholder="Ex: 7891000100103"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#100C16] border border-[#33263F] text-xs text-[#F8F5FC] font-mono-numbers focus:outline-none focus:border-[#8B5CF6]"
                    />
                    <Search className="w-4 h-4 text-[#B8AFC4] absolute left-3 top-3" />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading || !manualCode.trim()}
                    className="px-4 py-2.5 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-xs font-semibold disabled:opacity-50 transition-colors"
                  >
                    {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Consultar'}
                  </button>
                </div>
              </form>

              {/* Quick Test Chips for common items */}
              <div className="space-y-1.5">
                <span className="text-[11px] text-[#B8AFC4] block">
                  Exemplos rápidos para testar a base de dados:
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
                      className="px-2.5 py-1 rounded-lg bg-[#100C16] hover:bg-[#22192C] border border-[#33263F] text-[11px] text-[#A78BFA] transition-colors"
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error & Fallbacks when not found */}
              {errorMsg && (
                <div className="p-4 rounded-2xl bg-[#100C16] border border-rose-500/30 text-xs space-y-3">
                  <div className="flex items-start gap-2.5 text-rose-300">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>

                  <div className="pt-2 border-t border-[#33263F] flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => labelInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#18121F] border border-[#8B5CF6]/50 hover:bg-[#22192C] text-[#A78BFA] text-xs font-medium transition-colors"
                    >
                      <Camera className="w-3.5 h-3.5 text-[#EC4899]" />
                      <span>Fotografar Tabela Nutricional (OCR)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsManualEntry(true)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#18121F] border border-[#33263F] hover:bg-[#22192C] text-[#F8F5FC] text-xs font-medium transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Cadastrar Manualmente</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Hidden file input for label OCR */}
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
            </>
          )}

          {/* FOUND PRODUCT VIEW */}
          {product && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-[#100C16] border border-[#8B5CF6]/40 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] text-[#A78BFA] uppercase tracking-wider font-semibold">
                      {product.source} · Código: {product.barcode}
                    </span>
                    <h3 className="text-sm font-bold text-[#F8F5FC] mt-0.5">
                      {product.productName}
                    </h3>
                    {product.brand && (
                      <p className="text-xs text-[#B8AFC4]">Marca: {product.brand}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setProduct(null)}
                    className="text-xs text-[#B8AFC4] hover:text-[#F8F5FC]"
                  >
                    Trocar
                  </button>
                </div>

                {/* Grams Consumed input */}
                <div className="p-3 rounded-xl bg-[#18121F] border border-[#33263F] flex items-center justify-between gap-4">
                  <div>
                    <label className="text-xs text-[#B8AFC4] block">
                      Quantidade consumida:
                    </label>
                    <span className="text-[11px] text-[#A78BFA]">
                      Porção de referência: {product.servingSize}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="2000"
                      value={consumedGrams}
                      onChange={(e) => setConsumedGrams(parseFloat(e.target.value) || 0)}
                      className="w-20 px-2.5 py-1.5 text-center font-mono-numbers text-sm font-bold text-[#F8F5FC] bg-[#100C16] border border-[#33263F] rounded-lg focus:outline-none focus:border-[#8B5CF6]"
                    />
                    <span className="text-xs text-[#B8AFC4]">g</span>
                  </div>
                </div>

                {/* Recalculated Macros */}
                <div className="grid grid-cols-4 gap-2 pt-1 font-mono-numbers text-center">
                  <div className="p-2 rounded-lg bg-[#18121F]">
                    <span className="text-[10px] text-[#B8AFC4] block">Calorias</span>
                    <span className="text-xs font-bold text-[#EC4899]">
                      {currentMacros.calories} kcal
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-[#18121F]">
                    <span className="text-[10px] text-[#B8AFC4] block">Proteína</span>
                    <span className="text-xs font-bold text-[#8B5CF6]">
                      {currentMacros.protein}g
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-[#18121F]">
                    <span className="text-[10px] text-[#B8AFC4] block">Carbos</span>
                    <span className="text-xs font-bold text-[#A78BFA]">
                      {currentMacros.carbs}g
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-[#18121F]">
                    <span className="text-[10px] text-[#B8AFC4] block">Gorduras</span>
                    <span className="text-xs font-bold text-[#F472B6]">
                      {currentMacros.fat}g
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setProduct(null)}
                  className="px-4 py-2.5 rounded-xl bg-[#18121F] border border-[#33263F] text-xs text-[#B8AFC4] hover:text-[#F8F5FC]"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAdd}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#EC4899] text-white text-xs font-bold shadow-lg shadow-[#EC4899]/30 transition-all cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  Salvar no {mealType === 'cafe' ? 'Café' : mealType === 'almoco' ? 'Almoço' : mealType}
                </button>
              </div>
            </div>
          )}

          {/* MANUAL ENTRY FORM */}
          {isManualEntry && (
            <div className="space-y-3 p-4 rounded-2xl bg-[#100C16] border border-[#33263F]">
              <div className="flex items-center justify-between pb-2 border-b border-[#33263F]">
                <h3 className="text-xs font-bold text-[#F8F5FC]">
                  Cadastrar Produto Manualmente
                </h3>
                <button
                  type="button"
                  onClick={() => setIsManualEntry(false)}
                  className="text-xs text-[#B8AFC4] hover:text-[#F8F5FC]"
                >
                  Cancelar
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-[#B8AFC4]">Nome do produto</label>
                  <input
                    type="text"
                    value={manualForm.name}
                    onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
                    placeholder="Ex: Iogurte Grego Maracujá"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#18121F] border border-[#33263F] text-xs text-[#F8F5FC]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-[#B8AFC4]">Marca</label>
                  <input
                    type="text"
                    value={manualForm.brand}
                    onChange={(e) => setManualForm({ ...manualForm, brand: e.target.value })}
                    placeholder="Ex: Danone, Yopro, etc."
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#18121F] border border-[#33263F] text-xs text-[#F8F5FC]"
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
                      setManualForm({ ...manualForm, servingGrams: parseFloat(e.target.value) || 0 })
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
                      setManualForm({ ...manualForm, calories: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-2 py-1.5 rounded-lg bg-[#18121F] border border-[#33263F] text-xs text-[#EC4899]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-[#B8AFC4]">Proteína (g)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={manualForm.protein}
                    onChange={(e) =>
                      setManualForm({ ...manualForm, protein: parseFloat(e.target.value) || 0 })
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
                      setManualForm({ ...manualForm, carbs: parseFloat(e.target.value) || 0 })
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
                      setManualForm({ ...manualForm, fat: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-2 py-1.5 rounded-lg bg-[#18121F] border border-[#33263F] text-xs text-[#F472B6]"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleSaveManualForm}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#EC4899] text-white text-xs font-bold"
                >
                  Salvar Produto
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
