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
  ShieldCheck,
  FileText,
  Sliders,
  HelpCircle,
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { FoodItem, MealType, MealSlot, NutritionSource } from '../types';
import { INITIAL_MEAL_SLOTS } from '../services/storage';

// Comprime fotos antes do envio evitando erro 413 da Vercel (limite 4.5MB)
async function compressImageClient(
  fileOrDataUrl: File | string,
  maxDimension = 1400,
  quality = 0.85
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
      throw new Error(
        'A foto enviada é muito pesada. O aplicativo a redimensionou, por favor tente novamente.'
      );
    }
    if (res.status === 504 || text.toLowerCase().includes('timeout')) {
      throw new Error('Tempo limite no servidor. Tente novamente com uma foto mais nítida e aproximada.');
    }
    throw new Error(text || `Erro no servidor (código ${res.status})`);
  }
}

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMealType?: MealType;
  mealSlots?: MealSlot[];
  customFoods?: FoodItem[];
  onSaveMealItem: (item: FoodItem, mealType: MealType) => void;
  onSaveCustomFood: (food: FoodItem) => void;
}

export interface ProductDetails {
  found: boolean;
  barcode: string;
  productName: string;
  brand: string;
  category?: string;
  packageSize?: string;
  servingSize: string;
  servingGrams: number;
  per100g: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sodium?: number | null;
    sugars?: number | null;
    addedSugars?: number | null;
    saturatedFat?: number | null;
    transFat?: number | null;
  };
  imageUrl?: string | null;
  ingredients?: string | null;
  source: string;
  verificationStatus?: string;
  confidenceScore?: number;
  provenance?: any;
  lastUpdated?: string;
}

const COMMON_BRAZILIAN_BARCODES = [
  { name: 'Leite Moça Nestlé', code: '7891000100103' },
  { name: 'Aveia Quaker Flocos', code: '7891000244104' },
  { name: 'Café Melitta Tradicional', code: '7891021000109' },
  { name: 'Iogurte Danone Natural', code: '7891025114109' },
  { name: 'Arroz Tio João 1kg', code: '7896006700010' },
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

  // Active product state
  const [product, setProduct] = useState<ProductDetails | null>(null);
  const [consumedGrams, setConsumedGrams] = useState<number>(100);

  const slots = mealSlots && mealSlots.length ? mealSlots : INITIAL_MEAL_SLOTS;

  // OCR Nutrition Table State
  const [isOcrLoading, setIsOcrLoading] = useState<boolean>(false);
  const [ocrReviewData, setOcrReviewData] = useState<any | null>(null);
  const labelCameraInputRef = useRef<HTMLInputElement | null>(null);
  const labelGalleryInputRef = useRef<HTMLInputElement | null>(null);

  // Barcode Photo upload refs
  const barcodeCameraInputRef = useRef<HTMLInputElement | null>(null);
  const barcodeGalleryInputRef = useRef<HTMLInputElement | null>(null);

  // Search by Name State (Prioridade 4)
  const [showNameSearch, setShowNameSearch] = useState<boolean>(false);
  const [searchNameQuery, setSearchNameQuery] = useState<string>('');
  const [isSearchingName, setIsSearchingName] = useState<boolean>(false);
  const [nameSearchResults, setNameSearchResults] = useState<ProductDetails[]>([]);

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
    sugars: 0,
    addedSugars: 0,
    fat: 5,
    saturatedFat: 1,
    transFat: 0,
    fiber: 2,
    sodium: 50,
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
    setOcrReviewData(null);
    setIsManualEntry(false);
    setShowNameSearch(false);
    setSearchNameQuery('');
    setNameSearchResults([]);
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
    setStatusInfo('Calibrando câmera com leitor de código de barras...');
    setIsScanning(true);
    setIsTorchOn(false);

    try {
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

      const scanner = new Html5Qrcode('barcode-scanner-viewport', {
        formatsToSupport,
        verbose: false,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true,
        },
      });
      scannerRef.current = scanner;

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
        // Fallback para environment
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
        () => {}
      );

      try {
        const capabilities = (scanner as any).getRunningTrackCapabilities?.();
        if (capabilities && 'torch' in capabilities) {
          setHasTorch(true);
        }
      } catch {}

      setStatusInfo('Aponte para as barras com boa luz (a cerca de 15cm)');
    } catch (err: any) {
      console.warn('Erro ao inicializar câmera do scanner:', err);
      setIsScanning(false);
      setStatusInfo(null);
      setErrorMsg(
        'A câmera em tempo real não pôde ser iniciada (navegadores exigem conexão segura HTTPS). Utilize "Tirar Foto" ou "Galeria" abaixo, ou digite o número do código.'
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
      } catch (e) {}
      scannerRef.current = null;
    }
    setIsScanning(false);
  };

  // SISTEMA DE CONSULTA EM CASCATA COM PRIORIDADES OFICIAIS
  const fetchBarcodeData = async (code: string) => {
    const clean = code.trim();
    if (!clean) return;

    setScannedCode(clean);
    setIsLoading(true);
    setErrorMsg(null);
    setStatusInfo(`Buscando ${clean} (Prioridade 1: Banco Local)...`);
    setProduct(null);

    // PRIORIDADE 1 — BANCO DE DADOS PRÓPRIO (Verificação imediata em memória/cache local)
    const foundCustom = customFoods.find((f) => f.barcode === clean);
    if (foundCustom) {
      const serving = foundCustom.portionGrams || 100;
      const p100 = foundCustom.per100g || {
        calories: Math.round(((foundCustom.calories || 0) / serving) * 100),
        protein: Number((((foundCustom.protein || 0) / serving) * 100).toFixed(1)),
        carbs: Number((((foundCustom.carbs || 0) / serving) * 100).toFixed(1)),
        fat: Number((((foundCustom.fat || 0) / serving) * 100).toFixed(1)),
        fiber: Number((((foundCustom.fiber || 0) / serving) * 100).toFixed(1)),
        sodium: foundCustom.sodium,
        sugars: foundCustom.sugars,
        addedSugars: foundCustom.addedSugars,
        saturatedFat: foundCustom.saturatedFat,
        transFat: foundCustom.transFat,
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
          sodium: p100.sodium != null ? p100.sodium : null,
          sugars: p100.sugars != null ? p100.sugars : null,
          addedSugars: p100.addedSugars != null ? p100.addedSugars : null,
          saturatedFat: p100.saturatedFat != null ? p100.saturatedFat : null,
          transFat: p100.transFat != null ? p100.transFat : null,
        },
        source: 'Banco Local',
        verificationStatus: 'verified',
        confidenceScore: 100,
        provenance: foundCustom.provenance || {
          barcodeSource: 'scanner',
          nutritionSource: 'Banco Local',
          verifiedStatus: 'verified',
        },
      });
      setConsumedGrams(serving);
      setStatusInfo(null);
      setIsLoading(false);
      return;
    }

    // Consulta ao backend: PRIORIDADE 1 (Postgres) -> PRIORIDADE 2 (Open Food Facts) -> PRIORIDADE 3 (FatSecret)
    try {
      setStatusInfo(`Consultando bases oficiais para ${clean}...`);
      const res = await fetch(`/api/barcode/${clean}`);
      const data = await res.json();

      if (!res.ok || !data.found) {
        setErrorMsg(
          data.message ||
            `Produto com código "${clean}" não foi encontrado automaticamente.`
        );
        return;
      }

      setProduct(data);
      setConsumedGrams(data.servingGrams || 100);
      setStatusInfo(null);
    } catch (err: any) {
      console.error('Erro na consulta em cascata:', err);
      setErrorMsg('Falha de conexão com os serviços de consulta nutricional.');
    } finally {
      setIsLoading(false);
    }
  };

  // Processar foto de código de barras
  const handleBarcodeImageFile = async (file: File) => {
    if (!file) return;

    setIsLoading(true);
    setErrorMsg(null);
    setStatusInfo('Identificando código de barras na fotografia...');

    try {
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

      setStatusInfo('Decodificando números do código de barras com IA...');
      const compressedBase64 = await compressImageClient(file, 1400, 0.85);

      const res = await fetch('/api/gemini/read-barcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: compressedBase64,
          mimeType: 'image/jpeg',
        }),
      });

      const aiData = await parseResponseSafely(res);
      if (!res.ok) {
        setErrorMsg(aiData.error || 'Serviço de leitura por foto indisponível.');
        return;
      }
      if (aiData && aiData.found && aiData.barcode) {
        const clean = String(aiData.barcode).trim();
        setScannedCode(clean);
        setManualCode(clean);
        setStatusInfo(`Código identificado pela IA: ${clean}`);
        await fetchBarcodeData(clean);
      } else {
        setErrorMsg(
          aiData.reason ||
            'Não foi possível identificar o código de barras na foto. Tente aproximar ou use uma das opções de recuperação abaixo.'
        );
      }
    } catch (err: any) {
      setErrorMsg('Erro ao analisar foto do código de barras: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      fetchBarcodeData(manualCode.trim());
    }
  };

  // 3. LEITURA AUTOMÁTICA DA TABELA NUTRICIONAL POR FOTO (Gemini API)
  const handleLabelImageUpload = async (file: File) => {
    if (!file) return;

    setIsOcrLoading(true);
    setErrorMsg(null);
    setStatusInfo('Lendo tabela nutricional da embalagem com IA (Normas ANVISA)...');

    try {
      const compressedBase64 = await compressImageClient(file, 1400, 0.85);
      const effectiveBarcode = scannedCode || manualCode || '';

      const res = await fetch('/api/gemini/ocr-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: compressedBase64,
          mimeType: 'image/jpeg',
          barcode: effectiveBarcode,
          productNameHint: manualForm.name || '',
          brandHint: manualForm.brand || '',
        }),
      });

      const ocrData = await parseResponseSafely(res);

      if (!res.ok) {
        throw new Error(ocrData.error || 'Erro ao processar imagem');
      }

      // Regra obrigatória: identificar fotografia ilegível
      if (ocrData.isLegible === false) {
        setErrorMsg(
          ocrData.illegibleReason ||
            'A fotografia da tabela ficou embaçada ou cortada. Por favor, aproxime a câmera da tabela nutricional sob boa luz e tente novamente.'
        );
        return;
      }

      // Abre tela de revisão estruturada para a usuária conferir antes de salvar
      setOcrReviewData(ocrData);
      setStatusInfo(null);
    } catch (err: any) {
      console.error('Erro no OCR de rótulo:', err);
      setErrorMsg('Falha ao extrair tabela nutricional: ' + err.message);
    } finally {
      setIsOcrLoading(false);
    }
  };

  // Confirmar dados revisados do OCR da tabela e salvar no banco
  const handleConfirmOcrAndSave = async () => {
    if (!ocrReviewData) return;

    setIsLoading(true);
    setStatusInfo('Gravando produto com tabela nutricional no banco de dados...');

    try {
      const servingGrams = Number(ocrReviewData.portion?.servingQuantity) || 100;
      const servingUnit = ocrReviewData.portion?.servingSize || `${servingGrams}g`;

      const p100 = ocrReviewData.per100g || {};
      const effectiveBarcode = ocrReviewData.barcode || scannedCode || manualCode || `AUTO-${Date.now()}`;

      const payload = {
        barcode: effectiveBarcode,
        productName: ocrReviewData.productName || 'Alimento Registrado por Rótulo',
        brand: ocrReviewData.brand || '',
        servingSize: servingUnit,
        servingGrams,
        per100g: p100,
        ingredients: ocrReviewData.ingredientsList || '',
        source: 'IA Gemini',
        verificationStatus: 'user_confirmed',
        confidenceScore: ocrReviewData.confidence?.overall || 90,
        provenance: {
          barcodeSource: scannedCode ? 'scanner' : 'manual',
          nutritionSource: 'gemini_ocr',
          nameSource: ocrReviewData.productName ? 'user_confirmed' : 'user',
          confidenceScore: ocrReviewData.confidence?.overall || 90,
          verifiedStatus: 'user_confirmed',
          timestamp: new Date().toISOString(),
        },
      };

      // 1. Salva no banco de dados Neon Postgres (UPSERT sem duplicações)
      try {
        await fetch('/api/barcode/save-product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (dbErr) {
        console.warn('Salvamento Postgres offline ou parcial:', dbErr);
      }

      // 2. Salva no estado customFoods local
      const customFoodItem: FoodItem = {
        id: `food-${Date.now()}`,
        name: payload.productName,
        brand: payload.brand,
        barcode: payload.barcode,
        prepState: 'cru',
        portionGrams: servingGrams,
        calories: Math.round((Number(p100.calories || 0) * servingGrams) / 100),
        protein: Number((((Number(p100.protein) || 0) * servingGrams) / 100).toFixed(1)),
        carbs: Number((((Number(p100.carbs) || 0) * servingGrams) / 100).toFixed(1)),
        fat: Number((((Number(p100.fat) || 0) * servingGrams) / 100).toFixed(1)),
        fiber: Number((((Number(p100.fiber) || 0) * servingGrams) / 100).toFixed(1)),
        sodium: p100.sodium != null ? Math.round((Number(p100.sodium) * servingGrams) / 100) : undefined,
        sugars: p100.sugars != null ? Number((((Number(p100.sugars) || 0) * servingGrams) / 100).toFixed(1)) : undefined,
        addedSugars: p100.addedSugars != null ? Number((((Number(p100.addedSugars) || 0) * servingGrams) / 100).toFixed(1)) : undefined,
        saturatedFat: p100.saturatedFat != null ? Number((((Number(p100.saturatedFat) || 0) * servingGrams) / 100).toFixed(1)) : undefined,
        transFat: p100.transFat != null ? Number((((Number(p100.transFat) || 0) * servingGrams) / 100).toFixed(1)) : undefined,
        per100g: p100,
        source: 'IA Gemini',
        verified: true,
        confidenceScore: payload.confidenceScore,
        provenance: payload.provenance,
      };

      onSaveCustomFood(customFoodItem);

      // Carrega o produto ativo já pronto para ser usado e adicionado à refeição
      setProduct({
        found: true,
        barcode: payload.barcode,
        productName: payload.productName,
        brand: payload.brand,
        servingSize: payload.servingSize,
        servingGrams,
        per100g: p100,
        source: 'Banco Local (IA Gemini)',
        verificationStatus: 'user_confirmed',
        confidenceScore: payload.confidenceScore,
        provenance: payload.provenance,
      });

      setConsumedGrams(servingGrams);
      setOcrReviewData(null);
      setSuccessSavedToast('Produto e tabela nutricional salvos no banco com sucesso!');
      setTimeout(() => setSuccessSavedToast(null), 4000);
    } catch (err: any) {
      setErrorMsg('Erro ao salvar produto revisado: ' + err.message);
    } finally {
      setIsLoading(false);
      setStatusInfo(null);
    }
  };

  // PRIORIDADE 4 — BUSCA COMPLEMENTAR POR NOME OU MARCA
  const handleSearchByName = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchNameQuery.trim();
    if (!query) return;

    setIsSearchingName(true);
    setErrorMsg(null);
    setNameSearchResults([]);

    try {
      const res = await fetch(`/api/barcode/search-by-name?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setNameSearchResults(data.items || []);
        if (!data.items || data.items.length === 0) {
          setErrorMsg(`Nenhum alimento encontrado com o nome "${query}".`);
        }
      } else {
        setErrorMsg('Erro ao buscar alimentos pelo nome.');
      }
    } catch (err: any) {
      setErrorMsg('Falha na busca por nome: ' + err.message);
    } finally {
      setIsSearchingName(false);
    }
  };

  // Selecionar resultado da busca por nome
  const handleSelectNameResult = (item: ProductDetails) => {
    // Preserva o código de barras original escaneado se o item escolhido não tiver
    const effectiveBarcode = scannedCode || item.barcode || '';
    setProduct({
      ...item,
      barcode: effectiveBarcode,
    });
    setConsumedGrams(item.servingGrams || 100);
    setShowNameSearch(false);
    setErrorMsg(null);
  };

  // Salvar produto encontrado no banco próprio para evitar novas chamadas externas
  const handleSaveProductToDatabase = async () => {
    if (!product) return;

    try {
      const payload = {
        barcode: product.barcode,
        productName: product.productName,
        brand: product.brand,
        servingSize: product.servingSize,
        servingGrams: product.servingGrams,
        per100g: product.per100g,
        imageUrl: product.imageUrl,
        source: product.source || 'Banco Local',
        verificationStatus: product.verificationStatus || 'verified',
        confidenceScore: product.confidenceScore || 100,
        provenance: product.provenance || {
          barcodeSource: 'scanner',
          nutritionSource: product.source,
          nameSource: 'verified',
          savedAt: new Date().toISOString(),
        },
      };

      await fetch('/api/barcode/save-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const customFoodItem: FoodItem = {
        id: `food-${Date.now()}`,
        name: product.productName,
        brand: product.brand,
        barcode: product.barcode,
        prepState: 'cru',
        portionGrams: product.servingGrams || 100,
        calories: Math.round((Number(product.per100g.calories || 0) * (product.servingGrams || 100)) / 100),
        protein: Number((((Number(product.per100g.protein) || 0) * (product.servingGrams || 100)) / 100).toFixed(1)),
        carbs: Number((((Number(product.per100g.carbs) || 0) * (product.servingGrams || 100)) / 100).toFixed(1)),
        fat: Number((((Number(product.per100g.fat) || 0) * (product.servingGrams || 100)) / 100).toFixed(1)),
        fiber: Number((((Number(product.per100g.fiber) || 0) * (product.servingGrams || 100)) / 100).toFixed(1)),
        sodium: product.per100g.sodium != null ? Math.round((Number(product.per100g.sodium) * (product.servingGrams || 100)) / 100) : undefined,
        sugars: product.per100g.sugars != null ? Number((((Number(product.per100g.sugars) || 0) * (product.servingGrams || 100)) / 100).toFixed(1)) : undefined,
        addedSugars: product.per100g.addedSugars != null ? Number((((Number(product.per100g.addedSugars) || 0) * (product.servingGrams || 100)) / 100).toFixed(1)) : undefined,
        saturatedFat: product.per100g.saturatedFat != null ? Number((((Number(product.per100g.saturatedFat) || 0) * (product.servingGrams || 100)) / 100).toFixed(1)) : undefined,
        transFat: product.per100g.transFat != null ? Number((((Number(product.per100g.transFat) || 0) * (product.servingGrams || 100)) / 100).toFixed(1)) : undefined,
        per100g: product.per100g,
        source: 'Banco Local',
        verified: true,
      };

      onSaveCustomFood(customFoodItem);
      setProduct((prev) => (prev ? { ...prev, source: 'Banco Local' } : null));

      setSuccessSavedToast('Produto salvo no seu banco de dados para reuso imediato!');
      setTimeout(() => setSuccessSavedToast(null), 3500);
    } catch (err: any) {
      console.warn('Erro ao salvar no banco:', err);
    }
  };

  // Cálculos dinâmicos em tempo real conforme gramas consumidos mudam
  const calculateMacrosForConsumed = () => {
    if (!product) return { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0, sugars: 0, saturatedFat: 0 };
    const ratio = Math.max(0, consumedGrams || 0) / 100;
    return {
      calories: Math.round(product.per100g.calories * ratio),
      protein: Number((product.per100g.protein * ratio).toFixed(1)),
      carbs: Number((product.per100g.carbs * ratio).toFixed(1)),
      fat: Number((product.per100g.fat * ratio).toFixed(1)),
      fiber: Number((product.per100g.fiber * ratio).toFixed(1)),
      sodium: product.per100g.sodium != null ? Math.round(product.per100g.sodium * ratio) : null,
      sugars: product.per100g.sugars != null ? Number((product.per100g.sugars * ratio).toFixed(1)) : null,
      saturatedFat: product.per100g.saturatedFat != null ? Number((product.per100g.saturatedFat * ratio).toFixed(1)) : null,
    };
  };

  const currentMacros = calculateMacrosForConsumed();

  const adjustGrams = (delta: number) => {
    setConsumedGrams((prev) => Math.max(1, Math.min(2500, (prev || 0) + delta)));
  };

  // Salvar alimento na refeição e guardar no banco
  const handleConfirmAdd = async () => {
    if (!product) return;

    const effectiveBarcode = product.barcode || scannedCode || manualCode || undefined;

    const foodItem: FoodItem = {
      id: `food-${Date.now()}`,
      name: product.productName || 'Alimento Registrado',
      brand: product.brand || undefined,
      barcode: effectiveBarcode,
      per100g: product.per100g,
      prepState: 'cru',
      portionGrams: Math.max(1, consumedGrams),
      calories: currentMacros.calories,
      protein: currentMacros.protein,
      carbs: currentMacros.carbs,
      fat: currentMacros.fat,
      fiber: currentMacros.fiber,
      sodium: currentMacros.sodium ?? undefined,
      sugars: currentMacros.sugars ?? undefined,
      saturatedFat: currentMacros.saturatedFat ?? undefined,
      source: (product.source as any) || 'Banco Local',
      verified: true,
      confidenceScore: product.confidenceScore,
      provenance: product.provenance,
    };

    // 1. Salva na refeição atual
    onSaveMealItem(foodItem, mealType);

    // 2. Persiste no banco de dados para reuso futuro
    onSaveCustomFood(foodItem);
    handleSaveProductToDatabase();

    onClose();
  };

  // Salvar cadastro manual
  const handleSaveManualForm = async () => {
    const portion = Math.max(1, manualForm.servingGrams || 100);
    const ratio = 100 / portion;
    const effectiveBarcode = manualForm.barcode.trim() || scannedCode || manualCode || undefined;

    const per100g = {
      calories: Math.round(manualForm.calories * ratio),
      protein: Number((manualForm.protein * ratio).toFixed(1)),
      carbs: Number((manualForm.carbs * ratio).toFixed(1)),
      fat: Number((manualForm.fat * ratio).toFixed(1)),
      fiber: Number((manualForm.fiber * ratio).toFixed(1)),
      sodium: Math.round(manualForm.sodium * ratio),
      sugars: Number((manualForm.sugars * ratio).toFixed(1)),
      addedSugars: Number((manualForm.addedSugars * ratio).toFixed(1)),
      saturatedFat: Number((manualForm.saturatedFat * ratio).toFixed(1)),
      transFat: Number((manualForm.transFat * ratio).toFixed(1)),
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
      sodium: manualForm.sodium,
      sugars: manualForm.sugars,
      addedSugars: manualForm.addedSugars,
      saturatedFat: manualForm.saturatedFat,
      transFat: manualForm.transFat,
      per100g,
      source: 'Manual',
      verified: true,
      provenance: {
        barcodeSource: effectiveBarcode ? 'scanner' : 'manual',
        nutritionSource: 'manual',
        nameSource: 'user',
        verifiedStatus: 'user_confirmed',
        updatedAt: new Date().toISOString(),
      },
    };

    onSaveMealItem(foodItem, mealType);
    onSaveCustomFood(foodItem);

    // Persiste também no Postgres
    if (effectiveBarcode) {
      try {
        await fetch('/api/barcode/save-product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            barcode: effectiveBarcode,
            productName: foodItem.name,
            brand: foodItem.brand,
            servingGrams: portion,
            per100g,
            source: 'Manual',
            verificationStatus: 'user_confirmed',
          }),
        });
      } catch (e) {}
    }

    onClose();
  };

  // Carregar um alimento previamente salvo do banco local
  const handleSelectSavedFood = (item: FoodItem) => {
    const serving = item.portionGrams || 100;
    const p100 = item.per100g || {
      calories: Math.round(((item.calories || 0) / serving) * 100),
      protein: Number((((item.protein || 0) / serving) * 100).toFixed(1)),
      carbs: Number((((item.carbs || 0) / serving) * 100).toFixed(1)),
      fat: Number((((item.fat || 0) / serving) * 100).toFixed(1)),
      fiber: Number((((item.fiber || 0) / serving) * 100).toFixed(1)),
      sodium: item.sodium,
      sugars: item.sugars,
      saturatedFat: item.saturatedFat,
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
        sodium: p100.sodium,
        sugars: p100.sugars,
        saturatedFat: p100.saturatedFat,
      },
      source: 'Banco Local',
      verificationStatus: 'verified',
    });
    setConsumedGrams(serving);
    setErrorMsg(null);
    setStatusInfo(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="relative w-full max-w-xl bg-[#18121F] border-t sm:border border-[#33263F] rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 pb-safe shadow-2xl max-h-[94vh] overflow-y-auto overflow-x-hidden">
        {/* Toast de sucesso */}
        {successSavedToast && (
          <div className="absolute top-4 left-4 right-4 z-50 p-3 rounded-xl bg-emerald-600 text-white text-xs font-semibold shadow-xl flex items-center justify-center gap-2 animate-fadeIn">
            <ShieldCheck className="w-4 h-4" />
            <span>{successSavedToast}</span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#33263F]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-[#6D28D9] to-[#8B5CF6] text-white">
              <Barcode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#F8F5FC]">
                Leitor & Cadastro Inteligente de Alimentos
              </h2>
              <p className="text-xs text-[#B8AFC4]">
                Busca automática no banco, Open Food Facts e OCR de rótulo por IA
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#B8AFC4] hover:text-[#F8F5FC] hover:bg-[#22192C] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Elemento temporário para decodificação de arquivo */}
        <div id="barcode-file-scan-temp" style={{ position: 'absolute', left: '-9999px', top: 0 }} />

        {/* Conteúdo */}
        <div className="py-4 space-y-4">
          {/* Seletor de refeição */}
          <div>
            <label className="text-xs font-medium text-[#B8AFC4] block mb-1.5">
              Registrar em qual refeição?
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

          {/* ESTADO 1: SCANNER DE CÂMERA E ENTRADA DE CÓDIGO */}
          {!product && !ocrReviewData && !isManualEntry && !showNameSearch && (
            <>
              {/* Viewport da câmera */}
              <div className="relative rounded-2xl bg-[#100C16] border border-[#33263F] overflow-hidden min-h-[200px] flex flex-col items-center justify-center p-4">
                <div id="barcode-scanner-viewport" className="w-full max-w-sm rounded-xl overflow-hidden relative" />

                {/* Retículo de mira com linha laser animada */}
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
                        Escanear código de barras do alimento
                      </p>
                      <p className="text-xs text-[#B8AFC4] mt-0.5 max-w-sm mx-auto">
                        Suporte a EAN-13, EAN-8, UPC e foto com câmera de alta resolução.
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

              {/* Inputs invisíveis para fotos de código de barras */}
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

              {/* Campo para digitação de código */}
              <form onSubmit={handleManualSearch} className="space-y-1.5">
                <label className="text-xs font-medium text-[#B8AFC4]">
                  Ou digite os números do código de barras:
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

              {/* FLUXO INTELIGENTE DE RECUPERAÇÃO / FALLBACK (Nunca apresenta erro simples) */}
              {errorMsg && (
                <div className="p-4 rounded-2xl bg-[#100C16] border border-amber-500/40 text-xs space-y-3 animate-fadeIn">
                  <div className="flex items-start gap-2.5 text-amber-300">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <div>
                      <p className="font-semibold text-amber-200">
                        {scannedCode
                          ? `Código ${scannedCode} não localizado nas bases públicas.`
                          : 'Produto não localizado nas bases automáticas.'}
                      </p>
                      <p className="text-[11px] text-[#B8AFC4] mt-0.5">
                        Não se preocupe! O aplicativo preservou o seu código de barras. Escolha como completar as informações para que o produto seja{' '}
                        <strong className="text-white">salvo no banco de dados</strong> e você nunca mais precise escanear:
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    {/* AÇÃO 1: Fotografar tabela nutricional (Gemini OCR) */}
                    <button
                      type="button"
                      onClick={() => labelCameraInputRef.current?.click()}
                      className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl bg-[#18121F] border border-[#8B5CF6]/60 hover:bg-[#22192C] text-[#A78BFA] transition-all cursor-pointer text-center group"
                    >
                      <Camera className="w-5 h-5 text-[#EC4899] group-hover:scale-110 transition-transform" />
                      <span className="font-bold text-xs text-[#F8F5FC]">Fotografar Tabela</span>
                      <span className="text-[10px] text-[#B8AFC4]">IA extrai todos os macros</span>
                    </button>

                    {/* AÇÃO 2: Buscar pelo nome ou marca */}
                    <button
                      type="button"
                      onClick={() => setShowNameSearch(true)}
                      className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl bg-[#18121F] border border-emerald-500/50 hover:bg-[#22192C] text-emerald-400 transition-all cursor-pointer text-center group"
                    >
                      <Search className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
                      <span className="font-bold text-xs text-[#F8F5FC]">Buscar por Nome</span>
                      <span className="text-[10px] text-[#B8AFC4]">Encontrar alimento brasileiro</span>
                    </button>

                    {/* AÇÃO 3: Digitar manualmente */}
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
                      <Plus className="w-5 h-5 text-[#A78BFA] group-hover:scale-110 transition-transform" />
                      <span className="font-bold text-xs text-[#F8F5FC]">Digitar Dados</span>
                      <span className="text-[10px] text-[#B8AFC4]">Preenchimento guiado</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Inputs para fotografar rótulo/tabela nutricional */}
              <input
                ref={labelCameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleLabelImageUpload(f);
                  e.target.value = '';
                }}
                className="hidden"
              />

              <input
                ref={labelGalleryInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleLabelImageUpload(f);
                  e.target.value = '';
                }}
                className="hidden"
              />

              {isOcrLoading && (
                <div className="p-4 rounded-xl bg-[#100C16] border border-[#8B5CF6]/50 flex items-center justify-center gap-2 text-xs text-[#A78BFA]">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#EC4899]" />
                  <span>Extraindo valores nutricionais da tabela com IA (Normas ANVISA)...</span>
                </div>
              )}

              {/* Seção de produtos previamente salvos no banco de dados */}
              {customFoods.length > 0 && (
                <div className="pt-2 border-t border-[#33263F]/60">
                  <button
                    type="button"
                    onClick={() => setShowSavedList(!showSavedList)}
                    className="w-full flex items-center justify-between text-xs text-[#A78BFA] hover:text-white font-semibold py-1 cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Meus Alimentos Cadastrados no Banco ({customFoods.length})</span>
                    </div>
                    {showSavedList ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {showSavedList && (
                    <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {customFoods.map((saved) => (
                        <div
                          key={saved.id}
                          onClick={() => handleSelectSavedFood(saved)}
                          className="p-2.5 rounded-xl bg-[#100C16] hover:bg-[#22192C] border border-[#33263F] flex items-center justify-between gap-2 cursor-pointer transition-colors"
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

              {/* Exemplos para teste */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] text-[#B8AFC4] block">
                  Exemplos para testar o fluxo de código de barras:
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

          {/* ESTADO 2: REVISÃO DE OCR DA TABELA NUTRICIONAL (Antes de salvar no banco) */}
          {ocrReviewData && (
            <div className="space-y-4 p-4 rounded-2xl bg-[#100C16] border border-[#8B5CF6]/60 animate-fadeIn">
              <div className="flex items-center justify-between pb-3 border-b border-[#33263F]">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-md bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 text-[10px] text-[#A78BFA] font-bold uppercase tracking-wider">
                      OCR ANVISA · IA Gemini
                    </span>
                    {ocrReviewData.barcode && (
                      <span className="px-2 py-0.5 rounded-md bg-[#18121F] border border-[#33263F] text-[10px] text-[#B8AFC4] font-mono-numbers">
                        Cód: {ocrReviewData.barcode}
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-[#F8F5FC] mt-1">
                    Conferir e Salvar Tabela Nutricional
                  </h3>
                  <p className="text-[11px] text-[#B8AFC4]">
                    Os dados foram extraídos da foto. Você pode ajustar qualquer valor antes de salvar no banco.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOcrReviewData(null)}
                  className="text-xs text-[#B8AFC4] hover:text-[#F8F5FC] px-2.5 py-1 rounded-lg bg-[#18121F] border border-[#33263F] cursor-pointer"
                >
                  Cancelar
                </button>
              </div>

              {/* Identificação do produto */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-[#B8AFC4]">Nome do Produto *</label>
                  <input
                    type="text"
                    value={ocrReviewData.productName || ''}
                    onChange={(e) =>
                      setOcrReviewData({ ...ocrReviewData, productName: e.target.value })
                    }
                    placeholder="Ex: Biscoito Integral Aveia e Mel"
                    className="w-full px-3 py-2 rounded-xl bg-[#18121F] border border-[#33263F] text-xs text-[#F8F5FC] focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-[#B8AFC4]">Marca</label>
                  <input
                    type="text"
                    value={ocrReviewData.brand || ''}
                    onChange={(e) =>
                      setOcrReviewData({ ...ocrReviewData, brand: e.target.value })
                    }
                    placeholder="Ex: Quaker, Danone, etc."
                    className="w-full px-3 py-2 rounded-xl bg-[#18121F] border border-[#33263F] text-xs text-[#F8F5FC] focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
              </div>

              {/* Porção e unidade */}
              <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-[#18121F] border border-[#33263F]">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-[#B8AFC4]">Peso da Porção (g ou ml)</label>
                  <input
                    type="number"
                    value={ocrReviewData.portion?.servingQuantity || 100}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 100;
                      setOcrReviewData({
                        ...ocrReviewData,
                        portion: { ...ocrReviewData.portion, servingQuantity: val },
                      });
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#100C16] border border-[#33263F] text-xs text-[#F8F5FC] font-mono-numbers"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-[#B8AFC4]">Descrição da Porção</label>
                  <input
                    type="text"
                    value={ocrReviewData.portion?.servingSize || ''}
                    onChange={(e) =>
                      setOcrReviewData({
                        ...ocrReviewData,
                        portion: { ...ocrReviewData.portion, servingSize: e.target.value },
                      })
                    }
                    placeholder="Ex: 30g (2 biscoitos)"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#100C16] border border-[#33263F] text-xs text-[#F8F5FC]"
                  />
                </div>
              </div>

              {/* Tabela de valores por 100g */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#F8F5FC]">
                    Valores Nutricionais por 100g / 100ml:
                  </span>
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Confiança IA: {ocrReviewData.confidence?.overall || 90}%
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono-numbers">
                  <div className="p-2.5 rounded-xl bg-[#18121F] border border-pink-500/40 space-y-1">
                    <span className="text-[10px] text-[#B8AFC4] block">Calorias (kcal)</span>
                    <input
                      type="number"
                      value={ocrReviewData.per100g?.calories ?? ''}
                      onChange={(e) =>
                        setOcrReviewData({
                          ...ocrReviewData,
                          per100g: {
                            ...ocrReviewData.per100g,
                            calories: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                      className="w-full bg-transparent text-sm font-bold text-[#EC4899] focus:outline-none"
                    />
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#18121F] border border-purple-500/40 space-y-1">
                    <span className="text-[10px] text-[#B8AFC4] block">Proteínas (g)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={ocrReviewData.per100g?.protein ?? ''}
                      onChange={(e) =>
                        setOcrReviewData({
                          ...ocrReviewData,
                          per100g: {
                            ...ocrReviewData.per100g,
                            protein: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                      className="w-full bg-transparent text-sm font-bold text-[#8B5CF6] focus:outline-none"
                    />
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#18121F] border border-violet-500/40 space-y-1">
                    <span className="text-[10px] text-[#B8AFC4] block">Carboidratos (g)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={ocrReviewData.per100g?.carbs ?? ''}
                      onChange={(e) =>
                        setOcrReviewData({
                          ...ocrReviewData,
                          per100g: {
                            ...ocrReviewData.per100g,
                            carbs: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                      className="w-full bg-transparent text-sm font-bold text-[#A78BFA] focus:outline-none"
                    />
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#18121F] border border-rose-500/40 space-y-1">
                    <span className="text-[10px] text-[#B8AFC4] block">Gorduras Totais (g)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={ocrReviewData.per100g?.fat ?? ''}
                      onChange={(e) =>
                        setOcrReviewData({
                          ...ocrReviewData,
                          per100g: {
                            ...ocrReviewData.per100g,
                            fat: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                      className="w-full bg-transparent text-sm font-bold text-[#F472B6] focus:outline-none"
                    />
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#18121F] border border-[#33263F] space-y-1">
                    <span className="text-[10px] text-[#B8AFC4] block">Fibras (g)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={ocrReviewData.per100g?.fiber ?? ''}
                      onChange={(e) =>
                        setOcrReviewData({
                          ...ocrReviewData,
                          per100g: {
                            ...ocrReviewData.per100g,
                            fiber: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                      className="w-full bg-transparent text-xs font-semibold text-[#F8F5FC] focus:outline-none"
                    />
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#18121F] border border-[#33263F] space-y-1">
                    <span className="text-[10px] text-[#B8AFC4] block">Sódio (mg)</span>
                    <input
                      type="number"
                      value={ocrReviewData.per100g?.sodium ?? ''}
                      onChange={(e) =>
                        setOcrReviewData({
                          ...ocrReviewData,
                          per100g: {
                            ...ocrReviewData.per100g,
                            sodium: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                      className="w-full bg-transparent text-xs font-semibold text-[#F8F5FC] focus:outline-none"
                    />
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#18121F] border border-[#33263F] space-y-1">
                    <span className="text-[10px] text-[#B8AFC4] block">Açúcares Totais (g)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={ocrReviewData.per100g?.sugars ?? ''}
                      onChange={(e) =>
                        setOcrReviewData({
                          ...ocrReviewData,
                          per100g: {
                            ...ocrReviewData.per100g,
                            sugars: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                      className="w-full bg-transparent text-xs font-semibold text-[#F8F5FC] focus:outline-none"
                    />
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#18121F] border border-[#33263F] space-y-1">
                    <span className="text-[10px] text-[#B8AFC4] block">Gorduras Sat. (g)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={ocrReviewData.per100g?.saturatedFat ?? ''}
                      onChange={(e) =>
                        setOcrReviewData({
                          ...ocrReviewData,
                          per100g: {
                            ...ocrReviewData.per100g,
                            saturatedFat: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                      className="w-full bg-transparent text-xs font-semibold text-[#F8F5FC] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Proveniência */}
              <div className="p-3 rounded-xl bg-[#18121F] border border-purple-500/20 text-[11px] text-[#B8AFC4] flex items-center justify-between">
                <span>Origem dos dados: Código de barras + OCR Rótulo por IA Gemini</span>
                <span className="text-emerald-400 font-semibold">Vínculo mantido</span>
              </div>

              {/* Botão de confirmação e salvamento definitivo no banco */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setOcrReviewData(null)}
                  className="px-4 py-2.5 rounded-xl bg-[#18121F] border border-[#33263F] text-xs text-[#B8AFC4] hover:text-[#F8F5FC] cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmOcrAndSave}
                  disabled={isLoading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#8B5CF6] to-[#EC4899] text-white text-xs font-bold shadow-lg shadow-[#8B5CF6]/30 hover:opacity-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Confirmar & Salvar no Banco de Dados</span>
                </button>
              </div>
            </div>
          )}

          {/* ESTADO 3: BUSCA COMPLEMENTAR POR NOME OU MARCA */}
          {showNameSearch && !product && (
            <div className="space-y-3.5 p-4 rounded-2xl bg-[#100C16] border border-[#33263F] animate-fadeIn">
              <div className="flex items-center justify-between pb-2 border-b border-[#33263F]">
                <div>
                  <h3 className="text-xs font-bold text-[#F8F5FC]">
                    Buscar Alimento por Nome ou Marca
                  </h3>
                  <p className="text-[10px] text-[#B8AFC4]">
                    Priorizando produtos brasileiros (Open Food Facts e Banco Local)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNameSearch(false)}
                  className="text-xs text-[#B8AFC4] hover:text-[#F8F5FC] cursor-pointer"
                >
                  Voltar
                </button>
              </div>

              <form onSubmit={handleSearchByName} className="flex gap-2">
                <input
                  type="text"
                  value={searchNameQuery}
                  onChange={(e) => setSearchNameQuery(e.target.value)}
                  placeholder="Ex: Pão de Forma Integral Wickbold"
                  className="flex-1 px-3 py-2 rounded-xl bg-[#18121F] border border-[#33263F] text-xs text-[#F8F5FC] focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={isSearchingName || !searchNameQuery.trim()}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  {isSearchingName ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  <span>Buscar</span>
                </button>
              </form>

              {nameSearchResults.length > 0 && (
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {nameSearchResults.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => handleSelectNameResult(item)}
                      className="p-3 rounded-xl bg-[#18121F] hover:bg-[#22192C] border border-[#33263F] flex items-center justify-between gap-2.5 cursor-pointer transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#F8F5FC] truncate">
                          {item.productName}
                        </p>
                        <p className="text-[10px] text-[#B8AFC4] truncate">
                          {item.brand ? `${item.brand} · ` : ''}
                          {item.barcode ? `Cód: ${item.barcode}` : 'Sem código'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-bold text-[#EC4899] font-mono-numbers">
                          {item.per100g.calories} kcal
                        </span>
                        <span className="text-[10px] text-[#A78BFA] block font-mono-numbers">
                          por 100g
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ESTADO 4: PRODUTO ENCONTRADO — DETALHES COMPLETOS COM MODIFICADOR DE GRAMAS EM TEMPO REAL */}
          {product && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-[#100C16] border border-[#8B5CF6]/50 space-y-3.5">
                {/* Cabeçalho do produto */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded-md bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 text-[10px] text-[#A78BFA] uppercase tracking-wider font-bold flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                        {product.source}
                      </span>
                      {product.barcode && (
                        <span className="px-2 py-0.5 rounded-md bg-[#18121F] border border-[#33263F] text-[10px] text-[#B8AFC4] font-mono-numbers">
                          Cód: {product.barcode}
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-[#F8F5FC] mt-1.5 truncate">
                      {product.productName}
                    </h3>
                    {product.brand && (
                      <p className="text-xs text-[#B8AFC4]">Marca: {product.brand}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setProduct(null)}
                    className="text-xs text-[#B8AFC4] hover:text-[#F8F5FC] px-2.5 py-1 rounded-lg bg-[#18121F] border border-[#33263F] cursor-pointer shrink-0"
                  >
                    Trocar
                  </button>
                </div>

                {/* MODIFICADOR DINÂMICO DE QUANTIDADE / GRAMAS */}
                <div className="p-3.5 rounded-xl bg-[#18121F] border border-[#33263F] space-y-2.5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <label className="text-xs font-semibold text-[#F8F5FC] block">
                        Quantidade a consumir:
                      </label>
                      <span className="text-[11px] text-[#A78BFA]">
                        Porção de referência: {product.servingSize || `${product.servingGrams}g`}
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

                  {/* Botões rápidos de gramas */}
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

                {/* MACROS RECALCULADOS EM TEMPO REAL */}
                <div>
                  <div className="flex items-center justify-between pb-1.5">
                    <span className="text-[11px] text-[#B8AFC4] font-medium">
                      Valores recalculados para {consumedGrams}g:
                    </span>
                    <span className="text-[10px] text-[#B8AFC4]/80">
                      Base 100g = {product.per100g.calories} kcal
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

                  {/* Detalhamento complementar ANVISA */}
                  <div className="grid grid-cols-3 gap-2 font-mono-numbers text-center mt-2">
                    <div className="p-2 rounded-lg bg-[#18121F] border border-[#33263F]">
                      <span className="text-[9px] text-[#B8AFC4] block">Fibras</span>
                      <span className="text-xs font-semibold text-[#F8F5FC]">
                        {currentMacros.fiber}g
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-[#18121F] border border-[#33263F]">
                      <span className="text-[9px] text-[#B8AFC4] block">Açúcares</span>
                      <span className="text-xs font-semibold text-[#F8F5FC]">
                        {currentMacros.sugars != null ? `${currentMacros.sugars}g` : '—'}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-[#18121F] border border-[#33263F]">
                      <span className="text-[9px] text-[#B8AFC4] block">Sódio</span>
                      <span className="text-xs font-semibold text-[#F8F5FC]">
                        {currentMacros.sodium != null ? `${currentMacros.sodium}mg` : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Aviso de persistência */}
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>
                      {product.source === 'Banco Local'
                        ? 'Produto carregado do seu banco de dados próprio.'
                        : 'Será gravado no seu banco de dados para reutilização instantânea.'}
                    </span>
                  </div>
                  {product.source !== 'Banco Local' && (
                    <button
                      type="button"
                      onClick={handleSaveProductToDatabase}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] shrink-0 cursor-pointer transition-colors"
                    >
                      Salvar no Banco
                    </button>
                  )}
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
                    Adicionar à refeição ({currentMacros.calories} kcal)
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* ESTADO 5: CADASTRO MANUAL COMPLETO */}
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

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono-numbers">
                <div className="space-y-1">
                  <label className="text-[10px] text-[#B8AFC4]">Fibras (g)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={manualForm.fiber}
                    onChange={(e) =>
                      setManualForm({
                        ...manualForm,
                        fiber: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-2 py-1.5 rounded-lg bg-[#18121F] border border-[#33263F] text-xs text-[#F8F5FC]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-[#B8AFC4]">Açúcares (g)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={manualForm.sugars}
                    onChange={(e) =>
                      setManualForm({
                        ...manualForm,
                        sugars: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-2 py-1.5 rounded-lg bg-[#18121F] border border-[#33263F] text-xs text-[#F8F5FC]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-[#B8AFC4]">Sódio (mg)</label>
                  <input
                    type="number"
                    value={manualForm.sodium}
                    onChange={(e) =>
                      setManualForm({
                        ...manualForm,
                        sodium: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-2 py-1.5 rounded-lg bg-[#18121F] border border-[#33263F] text-xs text-[#F8F5FC]"
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
