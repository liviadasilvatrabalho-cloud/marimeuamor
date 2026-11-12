import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Send,
  X,
  RefreshCw,
  ChefHat,
  Check,
  Copy,
  Lightbulb,
  Heart,
  Bot,
  User as UserIcon,
  Trash2,
} from 'lucide-react';
import { Recipe } from '../types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  suggestedRecipe?: {
    title: string;
    description?: string;
    prepTimeMinutes?: number;
    servings?: number;
    caloriesPerServing?: number;
    proteinPerServing?: number;
    carbsPerServing?: number;
    fatPerServing?: number;
    fiberPerServing?: number;
    ingredients?: Array<{ name: string; amount: string }>;
    instructions?: string[];
    carinhoTip?: string;
  };
}

interface AiChefChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyRecipeToForm?: (recipe: {
    title: string;
    description?: string;
    prepTimeMinutes?: number;
    servings?: number;
    caloriesPerServing?: number;
    proteinPerServing?: number;
    carbsPerServing?: number;
    fatPerServing?: number;
    fiberPerServing?: number;
    ingredients?: Array<{ name: string; amount: string }>;
    instructions?: string[];
    carinhoTip?: string;
  }) => void;
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: 'welcome',
    role: 'assistant',
    text: `Olá, Mari! 💜 Eu sou o **Chef da Mari**, seu assistente culinário pessoal com inteligência artificial (Gemini)! 🌸✨

Estou aqui para te ajudar com:
- 🥗 **Ideias de pratos e receitas** com os ingredientes que você tem na geladeira
- 💡 **Dicas culinárias** (ponto de carne, receitas na airfryer, forno, vapor)
- 🔄 **Substituições saudáveis** de ingredientes
- 🍱 **Marmitas da semana** práticas e saborosas
- 🔢 **Estimativas de calorias e macros** pela tabela TACO/TBCA

O que você gostaria de preparar ou saber hoje?`,
    timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  },
];

const QUICK_SUGGESTIONS = [
  '🥗 O que fazer com frango desfiado e legumes?',
  '🥑 Ideia de jantar leve, proteico e rápido',
  '🧁 Sobremesa doce saudável sem açúcar refinado',
  '🍳 Lanche da tarde prático para o trabalho (20g de proteína)',
  '🔄 Como substituir creme de leite em molhos?',
  '⏰ Almoço saudável pronto em 15 minutos na airfryer',
];

export const AiChefChatModal: React.FC<AiChefChatModalProps> = ({
  isOpen,
  onClose,
  onApplyRecipeToForm,
}) => {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-scroll to latest message
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => textareaRef.current?.focus(), 150);
    }
  }, [isOpen, messages, isLoading]);

  if (!isOpen) return null;

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isLoading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputText('');
    setIsLoading(true);

    try {
      // Build history for backend API (user & assistant)
      const formattedHistory = newHistory.map((m) => ({
        role: m.role,
        text: m.text,
      }));

      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: text,
          history: formattedHistory.slice(-10), // keep recent context
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Erro ao conversar com a IA');
      }

      const data = await res.json();
      const replyText = data.reply || 'Não consegui gerar uma resposta no momento.';

      // Try to parse recipe suggestion if the model structured it
      let parsedRecipe: any = null;
      if (
        replyText.toLowerCase().includes('ingredientes') &&
        (replyText.toLowerCase().includes('modo de preparo') || replyText.toLowerCase().includes('passo a passo'))
      ) {
        // Simple extraction for 1-click import into Recipe Book
        const lines = replyText.split('\n').map((l: string) => l.trim()).filter(Boolean);
        const titleMatch = replyText.match(/(?:###|##|\*\*Título:|\*\*Receita:)\s*([^\n*#]+)/i);
        const title = titleMatch ? titleMatch[1].trim() : lines[0].replace(/[*#]/g, '').trim();

        parsedRecipe = {
          title: title.length > 50 ? title.substring(0, 50) : title,
          description: 'Receita sugerida com carinho pelo Chef da Mari IA 💜',
          prepTimeMinutes: 25,
          servings: 2,
          caloriesPerServing: 320,
          proteinPerServing: 26,
          carbsPerServing: 30,
          fatPerServing: 8,
          fiberPerServing: 4,
          ingredients: lines
            .filter((l: string) => l.startsWith('-') || l.startsWith('•'))
            .slice(0, 8)
            .map((l: string) => ({
              name: l.replace(/^[-•*]\s*/, '').trim(),
              amount: 'A gosto / porção',
            })),
          instructions: lines
            .filter((l: string) => /^\d+\./.test(l))
            .slice(0, 6)
            .map((l: string) => l.replace(/^\d+\.\s*/, '').trim()),
          carinhoTip: 'Receita feita com amor no Our Little Kitchen 🌸',
        };
      }

      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: replyText,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        suggestedRecipe: parsedRecipe,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error('Erro no chat Gemini:', err);
      const errorMsg: Message = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        text: `Poxa, Mari! 💜 Ocorreu um pequeno erro ao consultar o Gemini: ${err.message || 'Verifique sua conexão'}. Tente enviar novamente ou faça outra pergunta!`,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleClearChat = () => {
    if (window.confirm('Deseja reiniciar a conversa com o Chef da Mari?')) {
      setMessages(INITIAL_MESSAGES);
    }
  };

  // Simple Markdown Renderer for beautiful bubbles
  const renderFormattedText = (raw: string) => {
    const lines = raw.split('\n');
    return (
      <div className="space-y-1.5 text-xs sm:text-sm text-[#F8F5FC] leading-relaxed">
        {lines.map((line, idx) => {
          const trimmed = line.trim();
          if (!trimmed) return <div key={idx} className="h-1" />;

          // Heading ###
          if (trimmed.startsWith('###') || trimmed.startsWith('##')) {
            const headingText = trimmed.replace(/^#+\s*/, '');
            return (
              <h4 key={idx} className="text-xs sm:text-sm font-bold text-[#A78BFA] mt-2 mb-1 flex items-center gap-1.5">
                <ChefHat className="w-3.5 h-3.5 text-[#EC4899] shrink-0" />
                <span>{headingText}</span>
              </h4>
            );
          }

          // Bullet list -
          if (trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.startsWith('* ')) {
            const itemText = trimmed.replace(/^[-•*]\s*/, '');
            return (
              <div key={idx} className="flex items-start gap-2 pl-1.5 text-xs text-[#E2DCE8]">
                <span className="text-[#EC4899] font-bold shrink-0">•</span>
                <span>{renderInlineStyles(itemText)}</span>
              </div>
            );
          }

          // Numbered list 1.
          const numMatch = trimmed.match(/^(\d+)\.\s*(.+)/);
          if (numMatch) {
            return (
              <div key={idx} className="flex items-start gap-2 pl-1.5 text-xs text-[#E2DCE8]">
                <span className="font-bold text-[#A78BFA] font-mono-numbers shrink-0">{numMatch[1]}.</span>
                <span>{renderInlineStyles(numMatch[2])}</span>
              </div>
            );
          }

          // Normal paragraph
          return (
            <p key={idx} className="text-xs sm:text-[13px] text-[#E2DCE8]">
              {renderInlineStyles(trimmed)}
            </p>
          );
        })}
      </div>
    );
  };

  const renderInlineStyles = (text: string) => {
    // Replace **bold**
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="font-bold text-[#F8F5FC]">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#18121F] border-t sm:border border-[#8B5CF6]/40 rounded-t-3xl sm:rounded-3xl shadow-2xl h-[92vh] sm:h-[85vh] flex flex-col overflow-hidden pb-safe">
        {/* Header */}
        <div className="p-3.5 sm:p-4 border-b border-[#33263F] bg-[#100C16]/90 backdrop-blur-md flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-tr from-[#6D28D9] via-[#8B5CF6] to-[#EC4899] p-0.5 flex items-center justify-center shadow-md shadow-[#8B5CF6]/30 shrink-0">
              <div className="w-full h-full rounded-2xl bg-[#100C16] flex items-center justify-center">
                <ChefHat className="w-5 h-5 text-[#A78BFA]" />
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-xs sm:text-sm font-bold text-[#F8F5FC] truncate">
                  Chef da Mari 🌸
                </h2>
                <span className="px-1.5 py-0.5 rounded-full bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 text-[#A78BFA] text-[9px] font-bold uppercase tracking-wider shrink-0">
                  Gemini IA
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-[#B8AFC4] truncate">
                Converse, peça sugestões de receitas, dicas e substituições
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleClearChat}
              title="Limpar histórico da conversa"
              className="p-1.5 sm:p-2 rounded-xl text-[#B8AFC4] hover:text-[#F8F5FC] hover:bg-[#22192C] transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-xl text-[#B8AFC4] hover:text-[#F8F5FC] hover:bg-[#22192C] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4 no-scrollbar">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex gap-2.5 sm:gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-gradient-to-tr from-[#6D28D9] to-[#EC4899] flex items-center justify-center text-white shrink-0 mt-0.5 shadow-sm">
                    <ChefHat className="w-4 h-4 text-white" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] sm:max-w-[78%] rounded-2xl p-3.5 sm:p-4 shadow-md ${
                    isUser
                      ? 'bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] text-white rounded-tr-sm'
                      : 'bg-[#100C16] border border-[#33263F] text-[#F8F5FC] rounded-tl-sm'
                  }`}
                >
                  {isUser ? (
                    <p className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                  ) : (
                    <>
                      {renderFormattedText(msg.text)}

                      {/* Optional Action Buttons on Recipe Suggestion */}
                      {msg.suggestedRecipe && onApplyRecipeToForm && (
                        <div className="mt-3 pt-2.5 border-t border-[#33263F]/60 flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => {
                              if (msg.suggestedRecipe) {
                                onApplyRecipeToForm(msg.suggestedRecipe);
                                onClose();
                              }
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] text-white text-[11px] font-bold shadow-md shadow-[#8B5CF6]/30 cursor-pointer active:scale-95 transition-all"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Salvar no Livro de Receitas</span>
                          </button>
                          <button
                            onClick={() => copyToClipboard(msg.text, msg.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#18121F] border border-[#33263F] text-[#B8AFC4] hover:text-[#F8F5FC] text-[11px] font-medium transition-colors cursor-pointer"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span>Copiado!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copiar texto</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  <span
                    className={`block text-[9px] mt-1.5 ${
                      isUser ? 'text-white/60 text-right' : 'text-[#B8AFC4]/60 text-left'
                    }`}
                  >
                    {msg.timestamp}
                  </span>
                </div>

                {isUser && (
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#22192C] border border-[#EC4899]/50 flex items-center justify-center text-xs font-bold text-[#EC4899] shrink-0 mt-0.5">
                    M
                  </div>
                )}
              </div>
            );
          })}

          {/* Typing Indicator */}
          {isLoading && (
            <div className="flex gap-2.5 sm:gap-3 items-center">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-gradient-to-tr from-[#6D28D9] to-[#EC4899] flex items-center justify-center text-white shrink-0">
                <ChefHat className="w-4 h-4 text-white" />
              </div>
              <div className="p-3.5 rounded-2xl rounded-tl-sm bg-[#100C16] border border-[#33263F] flex items-center gap-2">
                <span className="text-xs text-[#A78BFA] font-medium">Chef da Mari pensando...</span>
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#EC4899] animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#8B5CF6] animate-bounce [animation-delay:0.2s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA] animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Pills */}
        <div className="px-3 sm:px-4 py-2 border-t border-[#33263F]/50 bg-[#100C16]/60 overflow-x-auto no-scrollbar flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-[#A78BFA] font-semibold flex items-center gap-1 shrink-0">
            <Lightbulb className="w-3 h-3 text-[#EC4899]" />
            <span>Sugestões:</span>
          </span>
          {QUICK_SUGGESTIONS.map((sug, i) => (
            <button
              key={i}
              type="button"
              disabled={isLoading}
              onClick={() => handleSendMessage(sug)}
              className="px-2.5 py-1 rounded-xl bg-[#18121F] border border-[#33263F] hover:border-[#8B5CF6]/50 text-[#B8AFC4] hover:text-[#F8F5FC] text-[10px] sm:text-[11px] whitespace-nowrap transition-colors cursor-pointer shrink-0 disabled:opacity-50"
            >
              {sug}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-2.5 sm:p-3 bg-[#100C16] border-t border-[#33263F] shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-end gap-2"
          >
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder="Pergunte ao Chef da Mari (receitas, dicas, calorias...)"
                className="w-full py-2.5 px-3.5 rounded-2xl bg-[#18121F] border border-[#33263F] focus:border-[#8B5CF6] text-xs sm:text-sm text-[#F8F5FC] placeholder-[#B8AFC4]/60 resize-none max-h-24 focus:outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={!inputText.trim() || isLoading}
              className="p-2.5 sm:p-3 rounded-2xl bg-gradient-to-r from-[#6D28D9] to-[#EC4899] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-95 shadow-md shadow-[#8B5CF6]/20 transition-all active:scale-95 cursor-pointer shrink-0"
              title="Enviar mensagem"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
              ) : (
                <Send className="w-4 h-4 sm:w-5 sm:h-5" />
              )}
            </button>
          </form>
          <p className="text-[9px] text-[#B8AFC4]/50 text-center mt-1.5">
            Powered by Google Gemini 💜 Dicas e receitas personalizadas para Mariana.
          </p>
        </div>
      </div>
    </div>
  );
};
