import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onReset?: () => void;
  onClose?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class AppSafeBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn("AppSafeBoundary protegeu o componente:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      try {
        this.props.onReset();
      } catch (_) {}
    }
  };

  private handleReload = () => {
    window.location.reload();
  };

  public override render() {
    if (this.state.hasError) {
      const title = this.props.fallbackTitle || "Painel de Proteção e Continuidade";
      const message = this.props.fallbackMessage || 
        "Ocorreu uma instabilidade pontual ao renderizar este módulo. Seus dados estão preservados com segurança.";

      return (
        <div className="p-6 md:p-8 my-4 max-w-3xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl text-slate-800 dark:text-slate-100 animate-fadeIn">
          <div className="flex items-start gap-4">
            <div className="p-3.5 bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-2xl border border-amber-500/20 dark:border-amber-500/30 shrink-0">
              <AlertTriangle size={28} />
            </div>
            <div className="space-y-2 flex-1">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white font-display">
                {title}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {message}
              </p>

              {this.state.error && (
                <div className="p-3 bg-slate-100 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800/80 rounded-xl font-mono text-xs text-amber-700 dark:text-amber-300 overflow-x-auto max-h-32">
                  {(() => {
                    const err = this.state.error as any;
                    if (!err) return "";
                    if (typeof err === "string") return err;
                    if (err.message) return String(err.message);
                    try {
                      return JSON.stringify(err);
                    } catch {
                      return String(err);
                    }
                  })()}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={this.handleRetry}
                  className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw size={14} />
                  <span>Tentar Novamente</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (this.props.onClose) this.props.onClose();
                    else if (this.props.onReset) this.props.onReset();
                    else this.handleRetry();
                  }}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer"
                >
                  <span>Fechar / Continuar</span>
                </button>

                <button
                  type="button"
                  onClick={this.handleReload}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer"
                >
                  <RotateCcw size={14} />
                  <span>Recarregar Página</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Re-export as ErrorBoundary for backward compatibility
export const ErrorBoundary = AppSafeBoundary;
export default AppSafeBoundary;
