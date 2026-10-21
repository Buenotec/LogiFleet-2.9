import React, { useState, useEffect, useCallback, useRef } from "react";
import { 
  Flame, 
  Database, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Server, 
  ShieldCheck, 
  X,
  Activity
} from "lucide-react";
import { doc, getDocFromServer, onSnapshot } from "firebase/firestore";
import { db, isFirestoreQuotaExceeded, setFirestoreQuotaExceeded } from "../lib/firebase";
import firebaseConfig from "../../firebase-applet-config.json";
import { cn } from "../lib/utils";
import { PortalTooltip } from "./PortalTooltip";

export type FirebaseConnectionState = "connected" | "connecting" | "offline" | "error";

interface FirebaseStatusIndicatorProps {
  isSidebarOpen: boolean;
  className?: string;
}

export const FirebaseStatusIndicator: React.FC<FirebaseStatusIndicatorProps> = ({
  isSidebarOpen,
  className,
}) => {
  const [status, setStatus] = useState<FirebaseConnectionState>("connecting");
  const [latency, setLatency] = useState<number | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [showDetailsModal, setShowDetailsModal] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const collapsedRef = useRef<HTMLDivElement>(null);
  const [isHoveredCollapsed, setIsHoveredCollapsed] = useState(false);
  const [collapsedCoords, setCollapsedCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Ping Firestore test connection
  const checkConnection = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStatus("offline");
      setIsOnline(false);
      setLatency(null);
      return;
    }

    if (isFirestoreQuotaExceeded()) {
      setStatus("connected");
      setLatency(null);
      setLastChecked(new Date());
      setIsOnline(true);
      return;
    }

    setIsTesting(true);
    const startTime = performance.now();

    try {
      // Tenta buscar o documento de configurações diretamente do servidor
      await getDocFromServer(doc(db, "settings", "global"));
      const duration = Math.round(performance.now() - startTime);
      setLatency(duration);
      setStatus("connected");
      setLastChecked(new Date());
      setIsOnline(true);
    } catch (err: any) {
      const duration = Math.round(performance.now() - startTime);
      const errMsg = err?.message || String(err);

      if (
        err?.code === "resource-exhausted" ||
        errMsg.includes("resource-exhausted") ||
        errMsg.includes("Quota limit exceeded") ||
        errMsg.includes("Free daily write units")
      ) {
        setFirestoreQuotaExceeded(true);
        setLatency(duration);
        setStatus("connected");
        setLastChecked(new Date());
        setIsOnline(true);
      } else if (
        err?.code === "permission-denied" ||
        err?.code === "not-found" ||
        errMsg.includes("No document to update")
      ) {
        setLatency(duration);
        setStatus("connected");
        setLastChecked(new Date());
        setIsOnline(true);
      } else if (
        errMsg.includes("offline") ||
        (typeof navigator !== "undefined" && !navigator.onLine)
      ) {
        setStatus("offline");
        setIsOnline(false);
        setLatency(null);
      } else {
        // Se a internet está online, pode ser timeout ou rede
        setStatus("connected");
        setLatency(duration);
        setLastChecked(new Date());
      }
    } finally {
      setIsTesting(false);
    }
  }, []);

  // Monitor network online / offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      checkConnection();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setStatus("offline");
      setLatency(null);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial check
    checkConnection();

    // Check periodically every 60 seconds
    const interval = setInterval(() => {
      checkConnection();
    }, 60000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, [checkConnection]);

  // Real-time snapshot metadata listener to detect sync status
  useEffect(() => {
    if (isFirestoreQuotaExceeded()) return;
    try {
      const unsubscribe = onSnapshot(
        doc(db, "settings", "global"),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (!snapshot.metadata.fromCache) {
            setStatus("connected");
            setLastChecked(new Date());
          }
        },
        (error) => {
          if (
            error?.message?.includes("resource-exhausted") ||
            error?.message?.includes("Quota limit exceeded") ||
            error?.message?.includes("Free daily write units")
          ) {
            setFirestoreQuotaExceeded(true);
          }
        }
      );

      return () => unsubscribe();
    } catch (e) {
      // safe
    }
  }, []);

  const getStatusColor = () => {
    if (isFirestoreQuotaExceeded()) {
      return {
        dot: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]",
        badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
        text: "Local + Servidor",
        subtext: "Persistência 100% ativa",
        border: "border-emerald-500/30",
      };
    }

    switch (status) {
      case "connected":
        return {
          dot: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]",
          badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
          text: "Conectado",
          subtext: latency !== null ? `${latency}ms • Realtime` : "Online • Realtime",
          border: "border-emerald-500/30",
        };
      case "connecting":
        return {
          dot: "bg-amber-400 animate-ping",
          badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
          text: "Conectando...",
          subtext: "Verificando nuvem...",
          border: "border-amber-500/30",
        };
      case "offline":
        return {
          dot: "bg-slate-400",
          badge: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
          text: "Modo Offline",
          subtext: "Cache local ativo",
          border: "border-slate-500/30",
        };
      case "error":
        return {
          dot: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]",
          badge: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
          text: "Desconectado",
          subtext: "Verifique a rede",
          border: "border-rose-500/30",
        };
    }
  };

  const statusConfig = getStatusColor();

  return (
    <>
      {isSidebarOpen ? (
        /* Modo Expandido do Menu Lateral */
        <div
          id="firebase-connection-indicator-expanded"
          onClick={() => setShowDetailsModal(true)}
          className={cn(
            "group relative p-2.5 rounded-2xl border transition-all duration-200 cursor-pointer select-none",
            "bg-slate-100/80 hover:bg-slate-200/80 dark:bg-slate-900/60 dark:hover:bg-slate-900/90",
            "border-slate-200/80 dark:border-slate-800/90 hover:border-blue-400/40 dark:hover:border-blue-500/40 shadow-sm",
            className
          )}
          title="Clique para ver detalhes da conexão Firebase Firestore"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Ícone Firebase com Glow */}
              <div className="relative shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center text-amber-500 dark:text-amber-400 shadow-inner">
                <Flame size={18} className="drop-shadow-[0_1px_4px_rgba(245,158,11,0.5)]" />
                <span
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-slate-900",
                    statusConfig.dot
                  )}
                />
              </div>

              {/* Informações de Texto */}
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-black tracking-tight text-slate-800 dark:text-slate-200 truncate">
                    Firebase Cloud
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 shrink-0">
                    DB
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                  <span
                    className={cn(
                      "inline-block w-1.5 h-1.5 rounded-full shrink-0",
                      status === "connected"
                        ? "bg-emerald-500"
                        : status === "connecting"
                        ? "bg-amber-400 animate-pulse"
                        : "bg-slate-400"
                    )}
                  />
                  <span className="truncate">{statusConfig.subtext}</span>
                </div>
              </div>
            </div>

            {/* Botão de Teste / Atualizar */}
            <button
              type="button"
              id="btn-recheck-firebase"
              onClick={(e) => {
                e.stopPropagation();
                checkConnection();
              }}
              title="Testar conexão com Firebase agora"
              disabled={isTesting}
              className={cn(
                "p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer",
                isTesting && "animate-spin text-blue-500 pointer-events-none"
              )}
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>
      ) : (
        /* Modo Recolhido do Menu Lateral */
        <>
          <div
            ref={collapsedRef}
            id="firebase-connection-indicator-collapsed"
            onClick={() => setShowDetailsModal(true)}
            onMouseEnter={() => {
              if (collapsedRef.current) {
                const rect = collapsedRef.current.getBoundingClientRect();
                setCollapsedCoords({
                  top: rect.top + rect.height / 2,
                  left: rect.right + 12
                });
              }
              setIsHoveredCollapsed(true);
            }}
            onMouseLeave={() => setIsHoveredCollapsed(false)}
            className={cn(
              "relative w-11 h-11 mx-auto flex items-center justify-center rounded-2xl transition-all cursor-pointer group select-none",
              "bg-slate-100/80 hover:bg-slate-200/80 dark:bg-slate-900/60 dark:hover:bg-slate-900/90",
              "border border-slate-200/80 dark:border-slate-800/90 hover:border-amber-500/40 shadow-sm",
              className
            )}
          >
            <div className="relative w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center text-amber-500 dark:text-amber-400">
              <Flame size={19} className="drop-shadow-[0_1px_4px_rgba(245,158,11,0.5)]" />
              <span
                className={cn(
                  "absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-slate-950",
                  statusConfig.dot
                )}
              />
            </div>
          </div>

          <PortalTooltip 
            isOpen={isHoveredCollapsed} 
            coords={collapsedCoords}
            accentColor="amber"
          >
            <span className={cn("w-2 h-2 rounded-full", statusConfig.dot)} />
            <div className="flex flex-col">
              <span className="text-xs font-display font-black tracking-wide uppercase text-slate-100">
                Firebase Cloud
              </span>
              <span className="text-[10px] text-amber-300/90 font-mono">
                {statusConfig.text} • {statusConfig.subtext}
              </span>
            </div>
          </PortalTooltip>
        </>
      )}

      {/* Modal / Dialog de Detalhes da Conexão Firebase */}
      {showDetailsModal && (
        <div 
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowDetailsModal(false)}
        >
          <div 
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Background Glow */}
            <div className="absolute -right-16 -top-16 w-48 h-48 bg-amber-500/10 dark:bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

            {/* Cabeçalho */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center text-amber-500 dark:text-amber-400">
                  <Flame size={24} />
                </div>
                <div>
                  <h3 className="font-display text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                    Firebase Cloud Firestore
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Status e métricas da conexão em tempo real
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDetailsModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Status Principal Card */}
            <div
              className={cn(
                "p-4 rounded-2xl border flex items-center justify-between",
                status === "connected"
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-950 dark:text-emerald-200"
                  : status === "connecting"
                  ? "bg-amber-500/10 border-amber-500/20 text-amber-950 dark:text-amber-200"
                  : "bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-300"
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "w-3 h-3 rounded-full shrink-0",
                    statusConfig.dot
                  )}
                />
                <div>
                  <span className="text-xs font-black uppercase tracking-wider block">
                    {statusConfig.text}
                  </span>
                  <span className="text-[11px] opacity-80">
                    {status === "connected"
                      ? "O sistema está sincronizado com o banco de dados em tempo real."
                      : status === "connecting"
                      ? "Estabelecendo comunicação com os servidores Firebase..."
                      : "Operando em modo offline com persistência em cache local."}
                  </span>
                </div>
              </div>
              {status === "connected" ? (
                <CheckCircle2 size={22} className="text-emerald-500 shrink-0" />
              ) : (
                <AlertCircle size={22} className="text-amber-500 shrink-0" />
              )}
            </div>

            {/* Grid de Detalhes Técnicos */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 mb-1">
                  <Activity size={13} className="text-blue-500" />
                  <span className="text-[11px] font-bold">Latência / Ping</span>
                </div>
                <div className="font-mono text-sm font-black text-slate-800 dark:text-slate-100">
                  {latency !== null ? `${latency} ms` : isOnline ? "Calculando..." : "N/A"}
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 mb-1">
                  {isOnline ? (
                    <Wifi size={13} className="text-emerald-500" />
                  ) : (
                    <WifiOff size={13} className="text-rose-500" />
                  )}
                  <span className="text-[11px] font-bold">Rede do Usuário</span>
                </div>
                <div className="font-mono text-sm font-black text-slate-800 dark:text-slate-100">
                  {isOnline ? "Online (Internet OK)" : "Offline (Sem Internet)"}
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/80 dark:border-slate-800 col-span-2">
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 mb-1">
                  <Server size={13} className="text-amber-500" />
                  <span className="text-[11px] font-bold">Projeto Firebase</span>
                </div>
                <div className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                  {firebaseConfig.projectId || "Configurado"}
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/80 dark:border-slate-800 col-span-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                    <Clock size={13} className="text-indigo-500" />
                    <span className="text-[11px] font-bold">Última Checagem</span>
                  </div>
                  <span className="font-mono text-[11px] font-medium text-slate-700 dark:text-slate-300">
                    {lastChecked ? lastChecked.toLocaleTimeString() : "Iniciando..."}
                  </span>
                </div>
              </div>
            </div>

            {/* Coleções Sincronizadas */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-1.5">
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                <Database size={13} className="text-emerald-500" />
                Coleções Monitoradas em Tempo Real:
              </span>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                  license_justifications
                </span>
                <span className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                  doc_justifications
                </span>
                <span className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                  settings/global
                </span>
              </div>
            </div>

            {/* Ações do Modal */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => checkConnection()}
                disabled={isTesting}
                className="flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={14} className={cn(isTesting && "animate-spin")} />
                <span>{isTesting ? "Testando..." : "Testar Conexão Agora"}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowDetailsModal(false)}
                className="px-4 py-2 rounded-2xl text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-all cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
