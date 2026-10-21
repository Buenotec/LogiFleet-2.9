import React from 'react';
import { motion } from 'motion/react';
import { Vehicle, Document } from '../types';
import { 
  AlertTriangle, 
  Clock, 
  XCircle, 
  CheckCircle2, 
  ShieldAlert, 
  Calendar, 
  FileText, 
  Truck, 
  Building2, 
  Sparkles, 
  HelpCircle,
  Activity,
  Info
} from 'lucide-react';

export type FarolTooltipType = 
  | { kind: 'doc'; doc?: Document; docType: string; vehicle: Vehicle; x: number; y: number; placement: 'top' | 'bottom' }
  | { kind: 'vehicle'; vehicle: Vehicle; x: number; y: number; placement: 'top' | 'bottom' }
  | { kind: 'operation'; operation: string; fleet?: string; vehicleCount: number; x: number; y: number; placement: 'top' | 'bottom' }
  | { kind: 'header'; title: string; x: number; y: number; placement: 'top' | 'bottom' };

// Known regulatory guides for common Brazilian transport licenses
const REGULATORY_DICTIONARY: Record<string, { fullTitle: string; agency: string; description: string; periodicity: string }> = {
  'AGR - GOIAS': {
    fullTitle: 'Autorização AGR Goiás - Transporte Intermunicipal',
    agency: 'AGR (Agência Goiana de Regulação)',
    description: 'Licença obrigatória para operação de transporte e fretamento no estado de Goiás.',
    periodicity: 'Anual / Renovação Periódica'
  },
  'AGR': {
    fullTitle: 'Autorização AGR - Regulação Estadual',
    agency: 'AGR',
    description: 'Licença regulatória para circulação e operação de veículos de carga e passageiros.',
    periodicity: 'Anual'
  },
  'AUTORIZAÇÃO DE FRETAMENTO': {
    fullTitle: 'Autorização de Fretamento Contínuo ou Eventual',
    agency: 'ANTT / Órgão Estadual',
    description: 'Permissão emitida para prestação de serviços de transporte sob demanda ou contrato corporativo.',
    periodicity: 'Validade por Contrato / Anual'
  },
  'CADASTRO CNPJ - DER': {
    fullTitle: 'Cadastro de Frota e Pessoa Jurídica no DER',
    agency: 'DER (Departamento de Estradas de Rodagem)',
    description: 'Registro cadastral da empresa e vínculo dos veículos operando em rodovias estaduais.',
    periodicity: 'Bienal / Periódica'
  },
  'CRC CERT.REGIST.CADASTRAL': {
    fullTitle: 'Certificado de Registro Cadastral (CRC)',
    agency: 'Órgãos Reguladores / Gestão Pública',
    description: 'Certificado que atesta a qualificação técnica e regularidade jurídica da frota cadastrada.',
    periodicity: 'Anual'
  },
  'CRV': {
    fullTitle: 'Certificado de Registro de Veículo (CRV / CRLV)',
    agency: 'SENATRAN / DETRAN',
    description: 'Documento fundamental de posse e licenciamento anual para circulação em território nacional.',
    periodicity: 'Anual (Licenciamento)'
  },
  'CRV CEF': {
    fullTitle: 'Certificado de Registro de Veículo / Quitação CEF',
    agency: 'DETRAN / Caixa Econômica Federal',
    description: 'Licenciamento com controle de gravame, financiamento ou desalienação fiduciária junto à CEF.',
    periodicity: 'Anual / Conforme Financiamento'
  },
  'ANTT': {
    fullTitle: 'RNTRC - Registro Nacional de Transportadores Rodoviários',
    agency: 'ANTT',
    description: 'Registro federal mandatório para todo veículo comercial que realize frete rodoviário no Brasil.',
    periodicity: 'Renovação a cada 5 anos'
  },
  'AET': {
    fullTitle: 'Autorização Especial de Trânsito',
    agency: 'DNIT / DER',
    description: 'Autorização emitida para composições com peso, dimensões ou cargas que excedem limites regulamentares.',
    periodicity: 'Por viagem ou anual'
  },
  'CIV': {
    fullTitle: 'Certificado de Inspeção Veicular',
    agency: 'Inmetro / OIA',
    description: 'Comprovante de vistoria técnica e mecânica para transporte de cargas perigosas e especiais.',
    periodicity: 'Anual'
  },
  'CIPP': {
    fullTitle: 'Certificado de Inspeção para Transporte de Produtos Perigosos',
    agency: 'Inmetro',
    description: 'Atestado de adequação e estanqueidade de tanques e carrocerias para produtos perigosos.',
    periodicity: 'Anual ou semestral'
  }
};

export function getRegulatoryInfo(docType: string) {
  const upper = docType.toUpperCase().trim();
  for (const [key, val] of Object.entries(REGULATORY_DICTIONARY)) {
    if (upper.includes(key) || key.includes(upper)) {
      return val;
    }
  }
  return {
    fullTitle: docType,
    agency: 'Órgão Regulador Competente',
    description: 'Documento e licença operacional vinculada ao monitoramento regulatório da frota.',
    periodicity: 'Vencimento Periódico'
  };
}

export const FarolFloatingTooltip: React.FC<{ data: FarolTooltipType }> = ({ data }) => {
  // Common 3D container styling with high-depth neon glow
  const placementOffsetClass = data.placement === 'top' 
    ? '-translate-x-1/2 -translate-y-full -mt-3' 
    : '-translate-x-1/2 mt-3';

  return (
    <div
      style={{
        position: 'fixed',
        left: `${data.x}px`,
        top: `${data.y}px`,
        zIndex: 99999,
        pointerEvents: 'none'
      }}
      className={placementOffsetClass}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: data.placement === 'top' ? 10 : -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: data.placement === 'top' ? 8 : -8 }}
        transition={{ type: 'spring', stiffness: 380, damping: 26 }}
        style={{
          perspective: 800,
          transformStyle: 'preserve-3d'
        }}
      >
        {data.kind === 'doc' && <DocTooltipCard data={data} />}
        {data.kind === 'vehicle' && <VehicleTooltipCard vehicle={data.vehicle} />}
        {data.kind === 'operation' && (
          <OperationTooltipCard 
            operation={data.operation} 
            fleet={data.fleet} 
            vehicleCount={data.vehicleCount} 
          />
        )}
        {data.kind === 'header' && <HeaderTooltipCard title={data.title} />}
      </motion.div>
    </div>
  );
};

// 1. TOOLTIP 3D NEON PARA CÉLULAS DE DOCUMENTO / LICENÇA
function DocTooltipCard({ data }: { data: Extract<FarolTooltipType, { kind: 'doc' }> }) {
  const { doc, docType, vehicle } = data;
  const reg = getRegulatoryInfo(docType);

  // Status computation
  const status = (doc?.status as string) || 'nao_cadastrado';
  const isVencido = status === 'vencido';
  const isCritico = status === 'critico';
  const isAtencao = status === 'atencao';
  const isPago = status === 'pagos';
  const isOk = status === 'ok' || status === 'regular' || (doc && !isVencido && !isCritico && !isAtencao);

  // Color theme definition
  let theme = {
    color: '#38bdf8',
    neonGlow: 'rgba(56, 189, 248, 0.4)',
    border: 'border-cyan-500/50',
    headerBg: 'from-cyan-950/60 to-slate-900/90',
    badgeBg: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40',
    progressGradient: 'from-cyan-500 to-blue-500',
    title: 'DOCUMENTO REGULAR',
    subtitle: 'Válido para operação',
    urgencyText: 'Conformidade ativa sem pendências.',
    icon: <CheckCircle2 className="text-cyan-400" size={16} />,
    percentage: 100
  };

  if (isVencido) {
    theme = {
      color: '#f43f5e',
      neonGlow: 'rgba(244, 63, 94, 0.45)',
      border: 'border-rose-500/60',
      headerBg: 'from-rose-950/70 to-slate-950/90',
      badgeBg: 'bg-rose-500/25 text-rose-300 border-rose-400/50',
      progressGradient: 'from-rose-600 to-red-500',
      title: 'VENCIDO - AÇÃO IMEDIATA',
      subtitle: 'Risco iminente de infração e apreensão',
      urgencyText: 'Licença expirada. O veículo deve ser suspenso de viagens até protocolo ou renovação.',
      icon: <XCircle className="text-rose-400 animate-pulse" size={16} />,
      percentage: 100
    };
  } else if (isCritico) {
    theme = {
      color: '#f59e0b',
      neonGlow: 'rgba(245, 158, 11, 0.45)',
      border: 'border-amber-500/60',
      headerBg: 'from-amber-950/70 to-slate-950/90',
      badgeBg: 'bg-amber-500/25 text-amber-300 border-amber-400/50',
      progressGradient: 'from-amber-500 to-orange-500',
      title: 'CRÍTICO - VENCIMENTO PRÓXIMO',
      subtitle: 'Prazo residual menor que 15 dias',
      urgencyText: 'Emissão da guia ou renovação técnica prioritária para evitar descontinuidade.',
      icon: <AlertTriangle className="text-amber-400 animate-bounce" size={16} />,
      percentage: Math.max(15, Math.min(95, ((doc?.daysRemaining || 7) / 15) * 100))
    };
  } else if (isAtencao) {
    theme = {
      color: '#3b82f6',
      neonGlow: 'rgba(59, 130, 246, 0.45)',
      border: 'border-blue-500/60',
      headerBg: 'from-blue-950/70 to-slate-950/90',
      badgeBg: 'bg-blue-500/25 text-blue-300 border-blue-400/50',
      progressGradient: 'from-blue-500 to-cyan-500',
      title: 'ATENÇÃO - EM MONITORAMENTO',
      subtitle: 'Vencimento entre 16 e 45 dias',
      urgencyText: 'Programar solicitação de documentos e certidões junto ao despachante ou órgão.',
      icon: <Clock className="text-blue-400" size={16} />,
      percentage: Math.max(30, Math.min(90, ((doc?.daysRemaining || 25) / 45) * 100))
    };
  } else if (isPago) {
    theme = {
      color: '#10b981',
      neonGlow: 'rgba(16, 185, 129, 0.45)',
      border: 'border-emerald-500/60',
      headerBg: 'from-emerald-950/70 to-slate-950/90',
      badgeBg: 'bg-emerald-500/25 text-emerald-300 border-emerald-400/50',
      progressGradient: 'from-emerald-500 to-teal-400',
      title: 'TAXA PAGA / COMPROVADO',
      subtitle: 'Pagamento quitado',
      urgencyText: 'Comprovante anexado no sistema ou taxa já recolhida.',
      icon: <CheckCircle2 className="text-emerald-400" size={16} />,
      percentage: 100
    };
  } else if (!doc) {
    theme = {
      color: '#94a3b8',
      neonGlow: 'rgba(148, 163, 184, 0.25)',
      border: 'border-slate-700/60',
      headerBg: 'from-slate-900/90 to-slate-950/90',
      badgeBg: 'bg-slate-800 text-slate-400 border-slate-700',
      progressGradient: 'from-slate-600 to-slate-700',
      title: 'NÃO CADASTRADO',
      subtitle: 'Sem registro ativo para esta unidade',
      urgencyText: 'Este veículo não possui histórico cadastrado para este tipo documental.',
      icon: <HelpCircle className="text-slate-400" size={16} />,
      percentage: 0
    };
  }

  return (
    <div
      style={{
        transform: 'rotateX(3deg) rotateY(-1deg)',
        boxShadow: `0 24px 45px -10px rgba(0,0,0,0.9), 0 0 35px ${theme.neonGlow}, inset 0 1px 1px rgba(255,255,255,0.22)`
      }}
      className={`relative w-[310px] rounded-2xl p-4 border ${theme.border} bg-[#080e1d]/95 backdrop-blur-2xl text-white select-none overflow-hidden`}
    >
      {/* Laser Top Scanning Line */}
      <div className="absolute top-0 inset-x-0 h-[2.5px] overflow-hidden">
        <div 
          className="w-full h-full shadow-[0_0_12px_currentColor]"
          style={{ backgroundColor: theme.color, color: theme.color }}
        />
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent"
          animate={{ x: ['-100%', '200%'] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* Background Specular Ray */}
      <div 
        className="absolute -top-12 -right-12 w-32 h-32 rounded-full pointer-events-none opacity-20 blur-xl"
        style={{ backgroundColor: theme.color }}
      />

      {/* Header with Icon, Tag and Status Badge */}
      <div className="flex items-start justify-between gap-2.5 pb-2.5 mb-2.5 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5 min-w-0">
          <div 
            className="w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 shadow-[0_0_12px_rgba(0,0,0,0.5)]"
            style={{
              backgroundColor: `${theme.color}15`,
              borderColor: `${theme.color}40`,
              boxShadow: `0 0 12px ${theme.neonGlow}`
            }}
          >
            {theme.icon}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 truncate">
              {reg.agency}
            </span>
            <span className="text-xs font-black text-white tracking-tight truncate" title={docType}>
              {docType}
            </span>
          </div>
        </div>

        {/* Status Badge */}
        <div className={`px-2 py-0.5 rounded-full border text-[9px] font-black tracking-wider uppercase shrink-0 ${theme.badgeBg}`}>
          {isVencido ? 'VENCIDO' : isCritico ? `${doc?.daysRemaining}d CRÍTICO` : isAtencao ? `${doc?.daysRemaining}d ALERTA` : isPago ? 'PAGO' : isOk ? 'REGULAR' : 'PENDENTE'}
        </div>
      </div>

      {/* Vehicle info pill */}
      <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800/80 mb-3 text-[11px]">
        <div className="flex items-center gap-1.5 font-bold text-slate-300">
          <Truck size={13} className="text-cyan-400" />
          <span className="font-mono font-black text-white">{vehicle.plate || 'SEM PLACA'}</span>
          {vehicle.fleet && (
            <span className="text-slate-400 text-[10px]">({vehicle.fleet})</span>
          )}
        </div>
        <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 truncate max-w-[130px]" title={vehicle.operation || '-'}>
          <Building2 size={11} className="text-slate-500 shrink-0" />
          <span className="truncate">{vehicle.operation || '-'}</span>
        </div>
      </div>

      {/* Expiry Details Box */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/60 flex flex-col justify-center">
          <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
            <Calendar size={10} className="text-cyan-400" />
            <span>Vencimento</span>
          </div>
          <span className="text-xs font-black text-white font-mono">
            {doc?.expiryDate && doc.expiryDate !== '-' ? doc.expiryDate : 'Sem Data Fixada'}
          </span>
        </div>

        <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/60 flex flex-col justify-center">
          <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
            <Activity size={10} style={{ color: theme.color }} />
            <span>Status Temporal</span>
          </div>
          <span className="text-xs font-black font-mono truncate" style={{ color: theme.color }}>
            {isVencido 
              ? `Vencido há ${Math.abs(doc?.daysRemaining || 0)}d` 
              : doc?.daysRemaining !== undefined && doc.daysRemaining > 0
                ? `Restam ${doc.daysRemaining} dias` 
                : isPago ? 'Taxa Quitada' : isOk ? 'Em Validade' : 'Sem Cadastro'}
          </span>
        </div>
      </div>

      {/* 
        BARRA ANIMADA DE VENCIMENTO / URGÊNCIA (Requisito Explícito do Usuário):
        Barra neon dinâmica com animação de expansão e feixe de luz passando continuamente
      */}
      <div className="space-y-1.5 mb-3">
        <div className="flex items-center justify-between text-[10px] font-bold">
          <span className="text-slate-400 flex items-center gap-1">
            <span 
              className="w-1.5 h-1.5 rounded-full animate-ping"
              style={{ backgroundColor: theme.color }}
            />
            {isVencido ? 'Nível de Criticidade' : 'Prazo de Vigência Residual'}
          </span>
          <span className="font-mono font-black" style={{ color: theme.color }}>
            {isVencido ? '100% EXCEDIDO' : isCritico ? 'CRÍTICO' : isAtencao ? 'MODERADO' : 'SEGURO'}
          </span>
        </div>

        {/* Track Container with Inner Depth */}
        <div className="h-2.5 w-full rounded-full bg-slate-950/90 border border-slate-800 p-[1.5px] relative overflow-hidden shadow-inner">
          <motion.div
            className={`h-full rounded-full bg-gradient-to-r ${theme.progressGradient} relative overflow-hidden shadow-[0_0_12px_currentColor]`}
            style={{ color: theme.color }}
            initial={{ width: '0%' }}
            animate={{ width: `${Math.max(8, theme.percentage)}%` }}
            transition={{
              type: 'spring',
              stiffness: 140,
              damping: 18,
              mass: 0.6
            }}
          >
            {/* Shimmer sweep moving across */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/70 to-transparent"
              animate={{ x: ['-100%', '200%'] }}
              transition={{
                duration: 1.4,
                repeat: Infinity,
                ease: 'linear'
              }}
            />
          </motion.div>
        </div>
      </div>

      {/* Regulatory Context Box */}
      <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-[10px] space-y-1">
        <div className="flex items-center gap-1 font-bold text-slate-300">
          <Info size={11} className="text-cyan-400 shrink-0" />
          <span>{reg.fullTitle}</span>
        </div>
        <p className="text-slate-400 leading-relaxed">
          {theme.urgencyText}
        </p>
      </div>
    </div>
  );
}

// 2. TOOLTIP 3D NEON PARA O VEÍCULO (PLACA MERCOSUL / FROTA)
function VehicleTooltipCard({ vehicle }: { vehicle: Vehicle }) {
  const docs = vehicle.documents || [];
  const vencidos = docs.filter(d => (d.status as string) === 'vencido').length;
  const criticos = docs.filter(d => (d.status as string) === 'critico').length;
  const atencao = docs.filter(d => (d.status as string) === 'atencao').length;
  const regulares = docs.filter(d => (d.status as string) === 'ok' || (d.status as string) === 'regular' || (d.status as string) === 'pagos').length;
  const total = docs.length;

  const healthScore = total > 0 
    ? Math.round(((total - vencidos - (criticos * 0.5)) / total) * 100) 
    : 100;

  const isHealthy = vencidos === 0 && criticos === 0;

  return (
    <div
      style={{
        transform: 'rotateX(3deg) rotateY(-1deg)',
        boxShadow: `0 24px 45px -10px rgba(0,0,0,0.9), 0 0 35px ${isHealthy ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.35)'}, inset 0 1px 1px rgba(255,255,255,0.22)`
      }}
      className="relative w-[300px] rounded-2xl p-4 border border-slate-700/80 bg-[#080e1d]/95 backdrop-blur-2xl text-white select-none overflow-hidden"
    >
      {/* Top Scanning Line */}
      <div className="absolute top-0 inset-x-0 h-[2.5px] overflow-hidden">
        <div className={`w-full h-full ${isHealthy ? 'bg-emerald-400' : 'bg-rose-500'}`} />
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent"
          animate={{ x: ['-100%', '200%'] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-[0_0_10px_rgba(56,189,248,0.3)]">
            <Truck size={18} />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Prontuário Veicular</span>
            <h4 className="text-sm font-black font-mono text-white tracking-wider">{vehicle.plate || 'FROTA DEDICADA'}</h4>
          </div>
        </div>

        <span className={`px-2 py-0.5 rounded-full border text-[9px] font-black tracking-wider uppercase ${
          isHealthy ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
        }`}>
          {isHealthy ? 'APTO PARA VIAGEM' : 'BLOQUEIO PREVENTIVO'}
        </span>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
        <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-[9px] font-bold text-slate-400 block uppercase">Frota / ID</span>
          <span className="font-mono font-bold text-cyan-300">{vehicle.fleet || '-'}</span>
        </div>
        <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-[9px] font-bold text-slate-400 block uppercase">Operação / Base</span>
          <span className="font-bold text-slate-200 truncate block" title={vehicle.operation || '-'}>
            {vehicle.operation || '-'}
          </span>
        </div>
      </div>

      {/* Health Progress Bar */}
      <div className="space-y-1.5 mb-3">
        <div className="flex items-center justify-between text-[10px] font-bold">
          <span className="text-slate-400">Índice de Conformidade Documental</span>
          <span className={`font-mono font-black ${healthScore > 80 ? 'text-emerald-400' : healthScore > 50 ? 'text-amber-400' : 'text-rose-400'}`}>
            {healthScore}%
          </span>
        </div>

        <div className="h-2.5 w-full rounded-full bg-slate-950 border border-slate-800 p-[1.5px] relative overflow-hidden shadow-inner">
          <motion.div
            className={`h-full rounded-full ${
              healthScore > 80 ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_12px_#10b981]' 
              : healthScore > 50 ? 'bg-gradient-to-r from-amber-500 to-orange-400 shadow-[0_0_12px_#f59e0b]'
              : 'bg-gradient-to-r from-rose-600 to-red-500 shadow-[0_0_12px_#f43f5e]'
            }`}
            initial={{ width: '0%' }}
            animate={{ width: `${healthScore}%` }}
            transition={{ type: 'spring', stiffness: 140, damping: 18 }}
          >
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent"
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            />
          </motion.div>
        </div>
      </div>

      {/* Status Counters */}
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <div className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30">
          <span className="text-xs font-black text-rose-400 font-mono">{vencidos}</span>
          <span className="text-[8px] font-bold text-rose-300 block uppercase">Vencidos</span>
        </div>
        <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <span className="text-xs font-black text-amber-400 font-mono">{criticos + atencao}</span>
          <span className="text-[8px] font-bold text-amber-300 block uppercase">A Vencer</span>
        </div>
        <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
          <span className="text-xs font-black text-emerald-400 font-mono">{regulares}</span>
          <span className="text-[8px] font-bold text-emerald-300 block uppercase">Regulares</span>
        </div>
      </div>
    </div>
  );
}

// 3. TOOLTIP 3D NEON PARA OPERAÇÃO / BASE LOGÍSTICA
function OperationTooltipCard({ operation, fleet, vehicleCount }: { operation: string; fleet?: string; vehicleCount: number }) {
  return (
    <div
      style={{
        transform: 'rotateX(3deg) rotateY(-1deg)',
        boxShadow: '0 24px 45px -10px rgba(0,0,0,0.9), 0 0 30px rgba(56,189,248,0.35), inset 0 1px 1px rgba(255,255,255,0.22)'
      }}
      className="relative w-[280px] rounded-2xl p-4 border border-cyan-500/50 bg-[#080e1d]/95 backdrop-blur-2xl text-white select-none overflow-hidden"
    >
      <div className="absolute top-0 inset-x-0 h-[2.5px] overflow-hidden">
        <div className="w-full h-full bg-cyan-400" />
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent"
          animate={{ x: ['-100%', '200%'] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <div className="flex items-center gap-2.5 pb-2 mb-2 border-b border-slate-800">
        <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-[0_0_10px_rgba(56,189,248,0.3)]">
          <Building2 size={18} />
        </div>
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Unidade Operacional</span>
          <h4 className="text-xs font-black text-white tracking-wide truncate" title={operation}>{operation}</h4>
        </div>
      </div>

      <div className="space-y-2 text-xs">
        {fleet && (
          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-slate-400 text-[10px] font-bold uppercase">Identificador de Frota</span>
            <span className="font-mono font-black text-cyan-300">{fleet}</span>
          </div>
        )}

        <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-[10px] text-slate-400 leading-relaxed">
          Base operacional com monitoramento automatizado de rotas, vistorias e licenças municipais, estaduais e federais.
        </div>
      </div>
    </div>
  );
}

// 4. TOOLTIP 3D NEON PARA OS CABEÇALHOS DAS COLUNAS DA TABELA
function HeaderTooltipCard({ title }: { title: string }) {
  const reg = getRegulatoryInfo(title);

  return (
    <div
      style={{
        transform: 'rotateX(3deg) rotateY(-1deg)',
        boxShadow: '0 24px 45px -10px rgba(0,0,0,0.9), 0 0 30px rgba(129,140,248,0.35), inset 0 1px 1px rgba(255,255,255,0.22)'
      }}
      className="relative w-[300px] rounded-2xl p-4 border border-indigo-500/50 bg-[#080e1d]/95 backdrop-blur-2xl text-white select-none overflow-hidden"
    >
      <div className="absolute top-0 inset-x-0 h-[2.5px] overflow-hidden">
        <div className="w-full h-full bg-indigo-400" />
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent"
          animate={{ x: ['-100%', '200%'] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <div className="flex items-center gap-2.5 pb-2 mb-2 border-b border-slate-800">
        <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.3)]">
          <FileText size={18} />
        </div>
        <div className="min-w-0">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Parâmetro Regulatório</span>
          <h4 className="text-xs font-black text-white truncate" title={title}>{title}</h4>
        </div>
      </div>

      <div className="space-y-2 text-[10px]">
        <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <span className="text-slate-400 font-bold block uppercase text-[9px]">Denominação Completa</span>
          <span className="text-indigo-300 font-bold block">{reg.fullTitle}</span>
        </div>

        <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <span className="text-slate-400 font-bold uppercase text-[9px]">Periodicidade de Renovação</span>
          <span className="text-cyan-300 font-mono font-black">{reg.periodicity}</span>
        </div>

        <p className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-400 leading-relaxed">
          {reg.description}
        </p>
      </div>
    </div>
  );
}
