import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Upload,
  X,
  Sparkles,
  Check,
  Plus,
  Trash2,
  AlertCircle,
  RefreshCw,
  HelpCircle,
  Scale,
  Sliders,
} from 'lucide-react';
import { FoodItem, MealLog, MealType, PrepState, MealSlot } from '../types';
import { INITIAL_MEAL_SLOTS } from '../services/storage';

interface FoodScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMealType?: MealType;
  mealSlots?: MealSlot[];
  onSaveMeal: (meal: MealLog) => void;
}

export const FoodScannerModal: React.FC<FoodScannerModalProps> = ({
  isOpen,
  onClose,
  initialMealType = 'almoco',
  mealSlots,
  onSaveMeal,
}) => {
  const [mealType, setMealType] = useState<MealType>(initialMealType);

  const slots = mealSlots && mealSlots.length ? mealSlots : INITIAL_MEAL_SLOTS;
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Verification / Conference State before saving
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [detectedMealName, setDetectedMealName] = useState<string>('');
  const [confidenceScore, setConfidenceScore] = useState<number>(0);
  const [confidenceNotes, setConfidenceNotes] = useState<string>('');
  const [aiQuestions, setAiQuestions] = useState<string[]>([]);
  const [verifiedFoods, setVerifiedFoods] = useState<FoodItem[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setMealType(initialMealType);
  }, [initialMealType]);

  // Clean up camera stream on close
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      resetForm();
    }
  }, [isOpen]);

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setCameraActive(false);
  };

  const resetForm = () => {
    setCapturedImage(null);
    setIsAnalyzing(false);
    setIsVerifying(false);
    setAnalysisError(null);
    setVerifiedFoods([]);
    setAiQuestions([]);
    setNotes('');
  };

  const startCamera = async () => {
    try {
      setAnalysisError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      console.warn('Erro ao acessar câmera diretamente:', err);
      // Seamlessly fallback to camera file capture
      if (cameraInputRef.current) {
        cameraInputRef.current.click();
      } else {
        setAnalysisError(
          'Não foi possível abrir a câmera em tempo real. Você pode escolher uma foto da galeria.'
        );
      }
    }
  };

  const captureCameraFrame = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setCapturedImage(dataUrl);
        stopCamera();
      }
    }
  };

  const processImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setAnalysisError('Por favor selecione um arquivo de imagem válido (JPG, PNG, WebP).');
      return;
    }
    setAnalysisError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setCapturedImage(event.target.result as string);
        stopCamera();
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
    // Crucial: reset input value so re-selecting the same photo works!
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const runGeminiAnalysis = async () => {
    if (!capturedImage) return;

    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const res = await fetch('/api/gemini/analyze-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: capturedImage,
          mimeType: 'image/jpeg',
          notes: notes,
          mealType: mealType,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Falha ao analisar imagem');
      }

      const result = await res.json();

      setDetectedMealName(result.mealName || `Refeição com Reconhecimento IA`);
      setConfidenceScore(result.overallConfidence || 85);
      setConfidenceNotes(result.confidenceNotes || 'Reconhecimento baseado em proporções visuais e TACO');
      setAiQuestions(result.questionsForMariana || []);

      const mappedItems: FoodItem[] = (result.items || []).map((it: any, index: number) => {
        const portion = Number(it.portionGrams) || 100;
        const cal = Math.round(Number(it.calories) || 0);
        return {
          id: `ai-food-${Date.now()}-${index}`,
          name: it.foodName || 'Alimento',
          prepState: (it.prepState as PrepState) || 'cozido',
          portionGrams: portion,
          calories: cal,
          protein: Number(Number(it.protein || 0).toFixed(1)),
          carbs: Number(Number(it.carbs || 0).toFixed(1)),
          fat: Number(Number(it.fat || 0).toFixed(1)),
          fiber: Number(Number(it.fiber || 0).toFixed(1)),
          per100g: {
            calories: Number(it.kcalPer100g) || Math.round((cal / portion) * 100),
            protein: Number(it.proteinPer100g) || 0,
            carbs: Number(it.carbsPer100g) || 0,
            fat: Number(it.fatPer100g) || 0,
            fiber: Number(it.fiberPer100g) || 0,
          },
          source: 'IA',
          householdMeasure: it.portionReasoning || it.reasoning || undefined,
          verified: false,
        };
      });

      setVerifiedFoods(mappedItems);
      setIsVerifying(true);
    } catch (err: any) {
      console.error('Erro na análise da IA:', err);
      setAnalysisError(err.message || 'Erro ao processar imagem com Gemini');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Conference editing helpers
  const updateFoodGrams = (id: string, newGrams: number) => {
    const validGrams = Math.max(1, newGrams || 1);
    setVerifiedFoods((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const ratio = validGrams / (item.portionGrams || 1);
        return {
          ...item,
          portionGrams: validGrams,
          calories: Math.round(item.calories * ratio),
          protein: Number((item.protein * ratio).toFixed(1)),
          carbs: Number((item.carbs * ratio).toFixed(1)),
          fat: Number((item.fat * ratio).toFixed(1)),
          fiber: Number((item.fiber * ratio).toFixed(1)),
        };
      })
    );
  };

  const updateFoodPrepState = (id: string, prepState: PrepState) => {
    setVerifiedFoods((prev) =>
      prev.map((item) => (item.id === id ? { ...item, prepState } : item))
    );
  };

  const removeFoodItem = (id: string) => {
    setVerifiedFoods((prev) => prev.filter((item) => item.id !== id));
  };

  const addNewCustomFood = () => {
    const newItem: FoodItem = {
      id: `manual-food-${Date.now()}`,
      name: 'Novo Alimento',
      prepState: 'cozido',
      portionGrams: 50,
      calories: 60,
      protein: 2,
      carbs: 10,
      fat: 1,
      fiber: 1,
      source: 'Manual',
      verified: true,
    };
    setVerifiedFoods((prev) => [...prev, newItem]);
  };

  const totalCalories = verifiedFoods.reduce((acc, f) => acc + f.calories, 0);
  const totalProtein = verifiedFoods.reduce((acc, f) => acc + f.protein, 0);
  const totalCarbs = verifiedFoods.reduce((acc, f) => acc + f.carbs, 0);
  const totalFat = verifiedFoods.reduce((acc, f) => acc + f.fat, 0);
  const totalFiber = verifiedFoods.reduce((acc, f) => acc + f.fiber, 0);

  const confirmAndSaveMeal = () => {
    const newMeal: MealLog = {
      id: `meal-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      mealType: mealType,
      title: detectedMealName || 'Refeição Analisada por IA',
      foods: verifiedFoods,
      totalCalories,
      totalProtein,
      totalCarbs,
      totalFat,
      totalFiber,
      photoUrl: capturedImage || undefined,
      confidenceNotes,
      createdAt: new Date().toISOString(),
    };

    onSaveMeal(newMeal);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="relative w-full max-w-2xl bg-[#18121F] border-t sm:border border-[#33263F] rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 pb-safe shadow-2xl max-h-[92vh] overflow-y-auto overflow-x-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#33263F]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-[#6D28D9] to-[#EC4899] text-white">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#F8F5FC]">
                Scanner Inteligente de Refeição 💜
              </h2>
              <p className="text-xs text-[#B8AFC4]">
                Reconhecimento alimentar real por IA (Google Gemini + TACO)
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

        {/* Modal Body */}
        <div className="py-4 space-y-4">
          {!isVerifying ? (
            <>
              {/* Meal Type Selection */}
              <div>
                <label className="text-xs font-medium text-[#B8AFC4] block mb-1.5">
                  Qual refeição você está fotografando?
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

              {/* Camera / Capture Section */}
              <div className="relative rounded-2xl bg-[#100C16] border border-[#33263F] overflow-hidden min-h-[260px] flex items-center justify-center">
                {cameraActive ? (
                  <div className="relative w-full h-[320px] bg-black">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-4">
                      <button
                        onClick={captureCameraFrame}
                        className="px-6 py-3 rounded-full bg-[#EC4899] text-white text-xs font-bold shadow-lg shadow-[#EC4899]/40 active:scale-95 transition-transform"
                      >
                        Capturar Fotografia
                      </button>
                      <button
                        onClick={stopCamera}
                        className="px-4 py-3 rounded-full bg-[#18121F]/80 text-[#F8F5FC] text-xs font-medium border border-[#33263F]"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : capturedImage ? (
                  <div className="relative w-full max-h-[340px] flex flex-col items-center">
                    <img
                      src={capturedImage}
                      alt="Refeição capturada"
                      className="w-full max-h-[300px] object-cover rounded-xl"
                    />
                    <div className="absolute top-3 right-3 flex items-center gap-2">
                      <button
                        onClick={() => setCapturedImage(null)}
                        className="p-2 rounded-xl bg-black/60 backdrop-blur-md text-[#F8F5FC] hover:text-rose-400 border border-[#33263F] transition-colors"
                        title="Tirar outra foto"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    className="p-6 text-center space-y-4 w-full cursor-pointer hover:bg-[#18121F]/40 transition-colors"
                  >
                    <div className="w-16 h-16 rounded-full bg-[#18121F] border border-[#33263F] mx-auto flex items-center justify-center text-[#A78BFA]">
                      <Camera className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#F8F5FC]">
                        Fotografe ou envie uma foto do seu prato
                      </p>
                      <p className="text-xs text-[#B8AFC4] mt-1 max-w-sm mx-auto">
                        Tire uma foto agora, escolha da galeria do celular ou arraste uma imagem. A IA identificará cada ingrediente e calculará calorias pela TACO.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startCamera();
                        }}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] hover:from-[#7C3AED] hover:to-[#A78BFA] text-white text-xs font-semibold shadow-md shadow-[#8B5CF6]/30 transition-all cursor-pointer"
                      >
                        <Camera className="w-4 h-4" />
                        Abrir Câmera
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          galleryInputRef.current?.click();
                        }}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#18121F] hover:bg-[#22192C] text-[#F8F5FC] border border-[#33263F] text-xs font-medium transition-colors cursor-pointer"
                      >
                        <Upload className="w-4 h-4 text-[#A78BFA]" />
                        Galeria de Fotos
                      </button>
                    </div>

                    <div className="pt-2 border-t border-[#33263F]/50 flex items-center justify-center gap-2">
                      <span className="text-[11px] text-[#B8AFC4]">Ou teste agora com foto de exemplo:</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCapturedImage('/src/assets/images/marmita_prep_dish_1794179957885.jpg');
                        }}
                        className="text-[11px] text-[#EC4899] font-semibold hover:underline"
                      >
                        Prato Marmita Fit 🌸
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Camera file input (with capture) */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileUpload}
                className="hidden"
              />

              {/* Gallery file input (NO capture attribute, opens photo album on iOS and Android) */}
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />

              {/* Hidden canvas for capture */}
              <canvas ref={canvasRef} className="hidden" />

              {/* Optional context notes */}
              {capturedImage && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#B8AFC4]">
                    Notas adicionais sobre o preparo (opcional):
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ex: Frango grelhado sem óleo, salada com 1 colher de azeite"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#100C16] border border-[#33263F] text-xs text-[#F8F5FC] focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
              )}

              {/* Analysis Error Notification */}
              {analysisError && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">Atenção</span>
                    <span>{analysisError}</span>
                  </div>
                </div>
              )}

              {/* Analyze CTA */}
              {capturedImage && (
                <button
                  type="button"
                  disabled={isAnalyzing}
                  onClick={runGeminiAnalysis}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#6D28D9] via-[#8B5CF6] to-[#EC4899] hover:opacity-95 text-white text-xs font-bold shadow-lg shadow-[#8B5CF6]/30 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                >
                  {isAnalyzing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Analisando prato com Google Gemini...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Identificar Alimentos & Calcular Porções</span>
                    </>
                  )}
                </button>
              )}
            </>
          ) : (
            /* CONFERÊNCIA OBRIGATÓRIA ANTES DE SALVAR (Section 4 do Prompt) */
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-[#100C16] border border-[#33263F]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#A78BFA] uppercase tracking-wider">
                    Conferência da Mariana
                  </span>
                  <span className="text-xs text-[#B8AFC4]">
                    Confiança IA: <strong className="text-[#EC4899]">{confidenceScore}%</strong>
                  </span>
                </div>
                <input
                  type="text"
                  value={detectedMealName}
                  onChange={(e) => setDetectedMealName(e.target.value)}
                  className="mt-2 w-full text-base font-bold bg-transparent text-[#F8F5FC] border-b border-[#33263F] pb-1 focus:outline-none focus:border-[#8B5CF6]"
                />
                <p className="text-[11px] text-[#B8AFC4] mt-1.5">{confidenceNotes}</p>

                {aiQuestions.length > 0 && (
                  <div className="mt-3 p-3 rounded-xl bg-[#18121F] border border-[#8B5CF6]/30">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-[#A78BFA]">
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>Pergunta da Nutri IA:</span>
                    </div>
                    {aiQuestions.map((q, idx) => (
                      <p key={idx} className="text-xs text-[#F8F5FC] mt-1">
                        • {q}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* Items Breakdown Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-[#F8F5FC]">
                  <span>Alimentos Identificados ({verifiedFoods.length})</span>
                  <button
                    onClick={addNewCustomFood}
                    className="text-[#A78BFA] hover:text-[#F8F5FC] flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar alimento
                  </button>
                </div>

                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {verifiedFoods.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl bg-[#100C16] border border-[#33263F] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex-1 space-y-1">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) =>
                            setVerifiedFoods((prev) =>
                              prev.map((f) => (f.id === item.id ? { ...f, name: e.target.value } : f))
                            )
                          }
                          className="text-xs font-semibold text-[#F8F5FC] bg-transparent border-b border-transparent hover:border-[#33263F] focus:border-[#8B5CF6] focus:outline-none w-full"
                        />

                        <div className="flex items-center gap-2">
                          {/* Prep State select */}
                          <select
                            value={item.prepState}
                            onChange={(e) =>
                              updateFoodPrepState(item.id, e.target.value as PrepState)
                            }
                            className="text-[11px] bg-[#18121F] text-[#A78BFA] border border-[#33263F] rounded-lg px-2 py-0.5 focus:outline-none"
                          >
                            <option value="cozido">Cozido</option>
                            <option value="grelhado">Grelhado</option>
                            <option value="assado">Assado</option>
                            <option value="no_vapor">No Vapor</option>
                            <option value="refogado">Refogado</option>
                            <option value="cru">Cru</option>
                            <option value="frito">Frito</option>
                          </select>

                          {item.householdMeasure && (
                            <span className="text-[10px] text-[#B8AFC4] truncate max-w-[180px]">
                              {item.householdMeasure}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Grams input and macro display */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="1"
                            max="2000"
                            value={item.portionGrams}
                            onChange={(e) =>
                              updateFoodGrams(item.id, parseFloat(e.target.value) || 0)
                            }
                            className="w-16 px-2 py-1 text-center font-mono-numbers text-xs font-bold text-[#F8F5FC] bg-[#18121F] border border-[#33263F] rounded-lg focus:outline-none focus:border-[#8B5CF6]"
                          />
                          <span className="text-xs text-[#B8AFC4]">g</span>
                        </div>

                        <div className="text-right font-mono-numbers min-w-[65px]">
                          <span className="text-xs font-bold text-[#A78BFA]">
                            {item.calories} kcal
                          </span>
                          <span className="text-[10px] text-[#B8AFC4] block">
                            P:{item.protein}g · C:{item.carbs}g
                          </span>
                        </div>

                        <button
                          onClick={() => removeFoodItem(item.id)}
                          className="p-1 text-[#B8AFC4] hover:text-rose-400 transition-colors"
                          title="Remover este item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total Summary Footer */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-[#18121F] to-[#100C16] border border-[#8B5CF6]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-xs text-[#B8AFC4]">Total Calculado da Refeição:</span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="font-heading text-2xl font-bold text-[#F8F5FC] font-mono-numbers">
                      {totalCalories} kcal
                    </span>
                    <span className="text-xs text-[#A78BFA] font-mono-numbers">
                      P: {totalProtein.toFixed(1)}g · C: {totalCarbs.toFixed(1)}g · G:{' '}
                      {totalFat.toFixed(1)}g
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsVerifying(false)}
                    className="px-3.5 py-2 rounded-xl bg-[#18121F] border border-[#33263F] text-xs text-[#B8AFC4] hover:text-[#F8F5FC] transition-colors"
                  >
                    Voltar
                  </button>

                  <button
                    onClick={confirmAndSaveMeal}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#EC4899] hover:from-[#7C3AED] hover:to-[#F472B6] text-white text-xs font-bold shadow-lg shadow-[#EC4899]/30 transition-all cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    Salvar no Meu Dia
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
