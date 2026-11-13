import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in React tree:', error, errorInfo);
  }

  private handleReset = () => {
    try {
      localStorage.removeItem('mari_amore_v1');
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#09070D] text-[#FAF8FC] flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#140E1B] border border-[#322046] rounded-3xl p-6 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#6D28D9] via-[#8B5CF6] to-[#EC4899] flex items-center justify-center mx-auto text-xl font-bold shadow-lg shadow-[#8B5CF6]/30">
              💜
            </div>
            <div>
              <h1 className="text-base font-bold text-[#FAF8FC]">Mari amore</h1>
              <p className="text-xs text-[#B5A8C8] mt-1">
                Ocorreu um pequeno imprevisto ao carregar a tela.
              </p>
            </div>
            <button
              onClick={this.handleReset}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#6D28D9] to-[#EC4899] text-white text-xs font-bold shadow-lg shadow-[#EC4899]/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
            >
              Recarregar Mari amore 💜
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
