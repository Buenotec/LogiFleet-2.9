import React, { useState, useMemo } from "react";
import { 
  HelpCircle, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Truck, 
  FileText, 
  DollarSign, 
  MapPin, 
  Settings, 
  Download, 
  FileSpreadsheet, 
  RefreshCw, 
  Bell, 
  ShieldCheck, 
  Sun, 
  Moon, 
  Eye, 
  ArrowRight, 
  Sparkles, 
  BookOpen, 
  MousePointerClick, 
  Check, 
  ChevronRight, 
  Info, 
  Lightbulb, 
  Layers, 
  Cloud, 
  Lock, 
  CheckCheck,
  Calendar,
  Zap,
  RotateCcw
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ComoUsarTabProps {
  onNavigateTab: (tab: "dashboard" | "licencas_detalhadas" | "licencas_documentos" | "financeiro_docs" | "financeiro_licencas" | "map" | "settings") => void;
  onOpenSettings?: () => void;
}

type TutorialSection = "inicio" | "cores" | "menus" | "passo_a_passo" | "faq" | "glossario";

export const ComoUsarTab: React.FC<ComoUsarTabProps> = ({ onNavigateTab, onOpenSettings }) => {
  const [activeSection, setActiveSection] = useState<TutorialSection>("inicio");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedQuickAction, setSelectedQuickAction] = useState<string | null>("buscar_placa");

  // Ações Rápidas "O que você quer fazer agora?"
  const quickActions = [
    {
      id: "buscar_placa",
      icon: Search,
      title: "Buscar um caminhão ou placa",
      badge: "Mais Comum",
      color: "from-blue-500/20 to-cyan-500/20 border-cyan-400/40 text-cyan-400",
      steps: [
        "Olhe para o topo da tela onde tem a barra com o ícone de lupa escrito 'Buscar placa, motorista ou operação...'.",
        "Digite as letras ou números da placa do veículo (ex: ABC1234 ou apenas os números).",
        "A lista e os números na tela são filtrados instantaneamente. Não precisa apertar Enter!"
      ],
      targetTab: "licencas_detalhadas" as const,
      targetTabLabel: "Ir para Licenças Detalhadas"
    },
    {
      id: "ver_vencidos",
      icon: AlertTriangle,
      title: "Saber quais veículos estão vencidos",
      badge: "Urgente",
      color: "from-red-500/20 to-orange-500/20 border-red-400/40 text-red-400",
      steps: [
        "Vá na aba 'Dashboard Licenças' ou 'Dashboard Documentação' no menu lateral.",
        "Observe o Farol de Status: os blocos em Vermelho mostram os veículos com documentos vencidos.",
        "Você também pode clicar no 'Sininho de Notificações' no canto superior direito para ver uma lista rápida de alertas críticos."
      ],
      targetTab: "dashboard" as const,
      targetTabLabel: "Ir para o Dashboard"
    },
    {
      id: "lancar_justificativa",
      icon: FileText,
      title: "Lançar justificativa (veículo na oficina/despachante)",
      badge: "Essencial",
      color: "from-purple-500/20 to-indigo-500/20 border-purple-400/40 text-purple-400",
      steps: [
        "Acesse 'Licenças Detalhadas' ou 'Documentação Detalhada' no menu.",
        "Localize o veículo na tabela e clique no botão/ícone de Justificativa na linha correspondente.",
        "Escolha o motivo pré-cadastrado (ex: 'Em Manutenção na Oficina', 'Aguardando Despachante') ou escreva sua observação.",
        "Clique em 'Salvar Justificativa'. O sistema grava na nuvem instantaneamente com data e hora."
      ],
      targetTab: "licencas_detalhadas" as const,
      targetTabLabel: "Abrir Licenças Detalhadas"
    },
    {
      id: "exportar_relatorio",
      icon: Download,
      title: "Baixar relatório em Excel ou PDF para a chefia",
      badge: "Diretoria",
      color: "from-emerald-500/20 to-teal-500/20 border-emerald-400/40 text-emerald-400",
      steps: [
        "Vá na tela que deseja exportar (Licenças Detalhadas, Documentação ou Financeiro).",
        "No canto superior direito da tabela, localize os botões de exportação:",
        "• Botão verde com símbolo de planilha: baixa o arquivo Excel (.xlsx) completo.",
        "• Botão de documento: gera um PDF executivo formatado, timbrado e pronto para impressão ou envio por e-mail/WhatsApp."
      ],
      targetTab: "licencas_detalhadas" as const,
      targetTabLabel: "Ver tela com botão de Exportar"
    },
    {
      id: "ver_financeiro",
      icon: DollarSign,
      title: "Consultar valores e custos em dinheiro",
      badge: "Gestão",
      color: "from-amber-500/20 to-yellow-500/20 border-amber-400/40 text-amber-400",
      steps: [
        "No menu lateral, clique em 'Financeiro - Licenças' ou 'Financeiro - Docs'.",
        "Veja os totais de taxas já pagas (em verde), valores pendentes a pagar (em amarelo) e valores vencidos (em vermelho).",
        "Você pode filtrar por filial ou despachante para saber exatamente quanto deve ser transferido."
      ],
      targetTab: "financeiro_licencas" as const,
      targetTabLabel: "Ir para Financeiro Licenças"
    }
  ];

  // Cores do Farol
  const colorItems = [
    {
      color: "bg-emerald-500",
      border: "border-emerald-500/40",
      bgSoft: "bg-emerald-500/10 dark:bg-emerald-950/30",
      text: "text-emerald-600 dark:text-emerald-400",
      title: "VERDE = Tudo Certo (Regular)",
      status: "Veículo Liberado para Rodar",
      desc: "Significa que o documento ou licenciamento está com prazo de validade longo e totalmente pago. O motorista pode viajar sem risco de fiscalização.",
      action: "Nenhuma ação necessária. Apenas acompanhe o painel."
    },
    {
      color: "bg-amber-500",
      border: "border-amber-500/40",
      bgSoft: "bg-amber-500/10 dark:bg-amber-950/30",
      text: "text-amber-600 dark:text-amber-400",
      title: "AMARELO = Atenção (Vence em Breve)",
      status: "Vencendo nos próximos 30 dias",
      desc: "O documento ainda é válido hoje, mas vai vencer muito em breve. É o alarme prévio para agendar vistoria, emitir boleto ou acionar o despachante com antecedência.",
      action: "Encaminhar para o setor financeiro ou despachante providenciar a renovação antes de virar vermelho."
    },
    {
      color: "bg-rose-500",
      border: "border-rose-500/40",
      bgSoft: "bg-rose-500/10 dark:bg-rose-950/30",
      text: "text-rose-600 dark:text-rose-400",
      title: "VERMELHO = Vencido (Crítico / Perigo)",
      status: "Documento Já Vencido!",
      desc: "ALERTA MÁXIMO! O prazo expirou. O veículo corre risco de ser apreendido em blitz policial, receber multa gravíssima ou ficar impedido de carregar em clientes.",
      action: "Ação imediata! Regularize o pagamento ou, se o carro estiver parado na garagem/oficina, cadastre a justificativa no sistema para informar a equipe."
    }
  ];

  // Menus Explicados
  const menuExplains = [
    {
      icon: BookOpen,
      name: "Página Inicial",
      desc: "Tela de apresentação visual (capa futurista). Contém o botão 'Iniciar Sistema' para acessar o painel.",
      when: "Quando você abre o sistema pela primeira vez."
    },
    {
      icon: Layers,
      name: "Dashboard Licenças & Documentação",
      desc: "O painel de controle principal. Mostra gráficos de pizza, barras de evolução, contagem de veículos regulares e o farol de alertas.",
      when: "Para ter uma visão geral em 10 segundos sobre a saúde de toda a frota."
    },
    {
      icon: Truck,
      name: "Licenças Detalhadas",
      desc: "A tabela mais usada no dia a dia. Lista veículo por veículo com placa, modelo, data de vencimento do licenciamento e campo de justificativa.",
      when: "Para pesquisar um veículo específico, ver datas exatas e cadastrar justificativas."
    },
    {
      icon: DollarSign,
      name: "Financeiro - Licenças & Docs",
      desc: "Módulo financeiro executivo. Converte as pendências documentais em valores monetários (R$). Mostra custos pagos e a vencer.",
      when: "Para reuniões de diretoria, fechamento de mês e envio de valores para o setor de contas a pagar."
    },
    {
      icon: FileText,
      name: "Documentação Detalhada",
      desc: "Controle individual de cada certificado: Laudo de Cronotacógrafo, ANTT, CRLV, Vistorias Especiais e Seguros.",
      when: "Quando você precisa auditar laudos técnicos que não sejam apenas o IPVA/Licenciamento anual."
    },
    {
      icon: MapPin,
      name: "Mapas",
      desc: "Visualização geográfica. Exibe as cidades, filiais e rotas onde os veículos operam, permitindo ver pendências por estado/região.",
      when: "Para entender a distribuição física da frota no território nacional."
    },
    {
      icon: Settings,
      name: "Configurações",
      desc: "Área administrativa. Permite fazer upload de novas planilhas Excel da frota, trocar o logotipo da empresa e ajustar prazos de alerta.",
      when: "Quando a matriz enviar uma nova planilha de dados ou você quiser personalizar o sistema."
    }
  ];

  // Dúvidas Frequentes
  const faqItems = [
    {
      q: "Se eu fechar a página ou o navegador, vou perder o que escrevi?",
      a: "Não! O sistema possui sincronização automática em nuvem com o Firebase Firestore (repare na luz verde 'Firebase Online' no menu lateral). Qualquer justificativa ou alteração é gravada na mesma fração de segundo."
    },
    {
      q: "Posso estragar ou apagar os dados da frota se clicar no lugar errado?",
      a: "Pode ficar totalmente tranquilo(a)! Navegar pelos menus, clicar nos filtros, pesquisar placas e gerar relatórios em Excel/PDF NÃO altera nem apaga dados. O sistema foi construído com proteção contra erros humanos."
    },
    {
      q: "Pesquisei uma placa e apareceu 'Nenhum resultado'. O que fazer?",
      a: "Verifique duas coisas simples: 1) Confira se você digitou a placa corretamente sem espaços extras; 2) Verifique se você não deixou algum filtro de 'Filial' ou 'Status' ativado que esteja escondendo aquele veículo. Se tiver dúvida, clique no botão 'Limpar Filtros' (ícone de rodar)."
    },
    {
      q: "Como sei se os dados que estou vendo são de hoje?",
      a: "Olhe no cabeçalho superior direito: ao lado do botão de atualizar há a indicação 'Atualizado em: DD/MM/AAAA às HH:MM:SS'. Se quiser forçar uma nova checagem com o servidor, basta clicar no ícone das duas setinhas circulares."
    },
    {
      q: "A tela está muito clara e cansa minha vista. Como deixar escura?",
      a: "No menu da esquerda, logo acima dos itens, há um seletor com ícones de Sol e Lua. Clique na Lua para ativar o Modo Escuro (Dark Mode) super confortável para ambientes com pouca luz."
    },
    {
      q: "Preciso de mais espaço na tela para ver a tabela inteira. Como recolher o menu?",
      a: "No canto inferior esquerdo do menu lateral, clique no botão 3D com as setas para a esquerda. O menu vai recolher e a tabela vai ocupar toda a largura da tela. Para abrir novamente, clique nas setas para a direita."
    }
  ];

  // Glossário
  const glossaryItems = [
    { term: "CRLV", meaning: "Certificado de Registro e Licenciamento de Veículo. O documento anual obrigatório para qualquer veículo rodar." },
    { term: "Farol de Status", meaning: "Sistema visual idêntico a um semáforo de trânsito: Verde (ok), Amarelo (prestes a vencer) e Vermelho (vencido)." },
    { term: "Cronotacógrafo", meaning: "Instrumento obrigatório que registra velocidade e tempo de direção. Exige aferição periódica com laudo válido." },
    { term: "AET", meaning: "Autorização Especial de Trânsito, necessária para veículos com dimensões ou pesos acima dos limites padrão (ex: carretas longas)." },
    { term: "ANTT", meaning: "Registro Nacional de Transportadores Rodoviários de Cargas. Cadastro obrigatório para transportar mercadorias comercialmente." },
    { term: "Justificativa", meaning: "Nota explicativa registrada por você no sistema informando por que um veículo com documento pendente não pode ser multado (ex: está desmontado na oficina)." },
    { term: "Firebase Cloud", meaning: "O banco de dados na nuvem da Google que mantém todos os dados sincronizados em tempo real entre todos os computadores da empresa." }
  ];

  // Filtragem de busca no tutorial
  const filteredFaq = useMemo(() => {
    if (!searchQuery.trim()) return faqItems;
    const q = searchQuery.toLowerCase();
    return faqItems.filter(item => item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q));
  }, [searchQuery]);

  return (
    <div className="space-y-8 pb-12">
      {/* Hero Banner do Tutorial */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border border-cyan-500/30 p-6 md:p-10 text-white shadow-2xl">
        {/* Glow de fundo */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 text-xs font-black uppercase tracking-wider shadow-[0_0_12px_rgba(6,182,212,0.3)]">
              <Sparkles size={14} className="animate-spin-slow" />
              Manual Oficial Descomplicado
            </div>
            <h1 className="text-3xl md:text-4xl font-black font-display tracking-tight text-white drop-shadow-md">
              Como Usar o Sistema <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">Passo a Passo</span>
            </h1>
            <p className="text-slate-300 text-sm md:text-base leading-relaxed">
              Guia 100% visual e sem jargões difíceis. Aprenda em poucos minutos a consultar veículos pela placa, entender o farol de cores, lançar justificativas e gerar relatórios executivos para a chefia.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <button
              onClick={() => onNavigateTab("dashboard")}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black rounded-2xl text-sm shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all transform hover:scale-105 active:scale-95"
            >
              <Zap size={18} className="fill-slate-950" />
              Ir para o Painel Principal
            </button>
            <button
              onClick={() => {
                setActiveSection("passo_a_passo");
                setSelectedQuickAction("buscar_placa");
              }}
              className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white/10 hover:bg-white/15 text-white font-bold rounded-2xl text-sm border border-white/20 transition-all backdrop-blur-sm"
            >
              <BookOpen size={18} className="text-cyan-300" />
              Ver Tarefas Rápidas
            </button>
          </div>
        </div>

        {/* Barra de Busca de Dúvidas */}
        <div className="mt-8 pt-6 border-t border-white/10 flex flex-col md:flex-row items-center gap-4">
          <div className="relative w-full max-w-xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-cyan-300/70" size={18} />
            <input
              type="text"
              placeholder="Digite sua dúvida (ex: 'como justificar', 'como exportar', 'o que é farol')..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white/10 hover:bg-white/15 focus:bg-slate-900 border border-white/20 focus:border-cyan-400 rounded-2xl text-white placeholder:text-slate-400 text-sm outline-none transition-all shadow-inner"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
              >
                Limpar
              </button>
            )}
          </div>
          <div className="text-xs text-slate-300/80 flex items-center gap-2">
            <Lightbulb size={14} className="text-amber-400 shrink-0" />
            <span>Dica: tudo que você faz no sistema é salvo automaticamente na nuvem.</span>
          </div>
        </div>
      </div>

      {/* Navegação entre Seções do Tutorial */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {[
          { id: "inicio", label: "1. Início Rápido", icon: Zap },
          { id: "cores", label: "2. Significado das Cores", icon: AlertTriangle },
          { id: "passo_a_passo", label: "3. Passo a Passo do Dia a Dia", icon: MousePointerClick },
          { id: "menus", label: "4. Tour pelos Menus", icon: Layers },
          { id: "faq", label: "5. Dúvidas Frequentes", icon: HelpCircle },
          { id: "glossario", label: "6. Dicionário de Siglas", icon: BookOpen },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id as TutorialSection)}
              className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm whitespace-nowrap transition-all duration-200 border ${
                isActive
                  ? "bg-slate-900 dark:bg-slate-900 text-white border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.35)]"
                  : "bg-white dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-700 shadow-sm"
              }`}
            >
              <Icon size={18} className={isActive ? "text-cyan-400" : "text-slate-400"} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* SEÇÃO 1: INÍCIO RÁPIDO */}
      {activeSection === "inicio" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Card de Boas-Vindas */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center shrink-0 border border-cyan-500/20">
                <Truck size={24} />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">
                  Para que serve o DocInsight? (Em poucas palavras)
                </h2>
                <p className="text-slate-600 dark:text-slate-400 text-sm md:text-base leading-relaxed">
                  Pense no DocInsight como o <strong>painel de bordo da sua frota</strong>. Ele serve para responder na hora perguntas como:
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-cyan-400 flex items-center justify-center font-black text-sm">
                  1
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">Qual carro pode rodar?</h3>
                <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed">
                  Você descobre em 1 segundo se o caminhão está 100% legalizado para pegar estrada sem risco de multa ou apreensão.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black text-sm">
                  2
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">O que vai vencer logo?</h3>
                <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed">
                  O sistema avisa com 30 dias de antecedência para você acionar o despachante antes do prazo estourar.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black text-sm">
                  3
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">Por que está parado?</h3>
                <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed">
                  Permite cadastrar justificativas (ex: "está no conserto", "aguardando laudo") para toda a empresa saber o motivo.
                </p>
              </div>
            </div>

            {/* As 3 Regras de Ouro */}
            <div className="p-6 rounded-2xl bg-gradient-to-r from-blue-500/10 via-cyan-500/10 to-indigo-500/10 border border-cyan-400/30 space-y-3">
              <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <ShieldCheck size={18} className="text-cyan-500" />
                As 3 Regras de Ouro para Usar Sem Medo:
              </h4>
              <ul className="space-y-2 text-xs md:text-sm text-slate-700 dark:text-slate-300">
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                  <span><strong>1. Você não pode estragar nada:</strong> Clicar nos botões, pesquisar e ver os gráficos não deleta dados. Pode fuçar à vontade!</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                  <span><strong>2. Tudo salva sozinho:</strong> Toda justificativa que você digita é salva na nuvem na mesma hora. Não precisa de botão "salvar geral".</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                  <span><strong>3. Se tiver dúvida, olhe as cores:</strong> Verde é bom, Amarelo atenção, Vermelho ação imediata.</span>
                </li>
              </ul>
            </div>
          </div>
        </motion.div>
      )}

      {/* SEÇÃO 2: ENTENDA AS CORES (FAROL) */}
      {activeSection === "cores" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">
                O Semáforo do Sistema: O que cada cor quer dizer?
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                Todas as tabelas, gráficos e cards usam exatamente estas três cores:
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {colorItems.map((item, idx) => (
                <div
                  key={idx}
                  className={`p-6 rounded-3xl border ${item.border} ${item.bgSoft} space-y-4 relative overflow-hidden flex flex-col justify-between`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className={`w-4 h-4 rounded-full ${item.color} shadow-md animate-pulse`} />
                      <h3 className={`font-black text-lg ${item.text}`}>{item.title}</h3>
                    </div>
                    <div className="inline-block px-3 py-1 rounded-full bg-white/80 dark:bg-slate-900/80 text-xs font-bold text-slate-800 dark:text-slate-200 shadow-sm">
                      {item.status}
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 text-xs md:text-sm leading-relaxed">
                      {item.desc}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-black/10 dark:border-white/10">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      O que você deve fazer:
                    </p>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white mt-1">
                      {item.action}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Dica do Farol */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center gap-3">
              <Info size={20} className="text-blue-500 shrink-0" />
              <p className="text-xs text-slate-600 dark:text-slate-300">
                <strong>Onde ver isso rápido:</strong> No menu <strong>Dashboard Licenças</strong>, a primeira coisa que aparece no topo da tela é o Farol com os totais de veículos em cada uma dessas cores.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* SEÇÃO 3: PASSO A PASSO DO DIA A DIA (SIMULADOR INTERATIVO) */}
      {activeSection === "passo_a_passo" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">
                O que você quer fazer hoje? (Clique na sua tarefa)
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                Selecione o que precisa resolver agora para ver o roteiro passo a passo com atalho direto:
              </p>
            </div>

            {/* Botoes de selecao rapida */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {quickActions.map((action) => {
                const isSelected = selectedQuickAction === action.id;
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    onClick={() => setSelectedQuickAction(action.id)}
                    className={`p-4 rounded-2xl text-left border transition-all flex items-start gap-3.5 relative overflow-hidden ${
                      isSelected
                        ? "bg-gradient-to-br from-slate-900 to-blue-950 text-white border-cyan-400 shadow-[0_0_18px_rgba(6,182,212,0.35)] scale-[1.02]"
                        : "bg-slate-50 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:bg-white dark:hover:bg-slate-800"
                    }`}
                  >
                    <div className={`p-2.5 rounded-xl bg-white/10 shrink-0 ${isSelected ? "text-cyan-300" : "text-slate-500 dark:text-slate-400"}`}>
                      <Icon size={20} />
                    </div>
                    <div className="space-y-1 min-w-0">
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${isSelected ? "bg-cyan-400/20 text-cyan-300" : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"}`}>
                        {action.badge}
                      </span>
                      <h3 className="font-bold text-sm leading-snug truncate">{action.title}</h3>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Detalhe da Tarefa Selecionada */}
            {selectedQuickAction && (() => {
              const current = quickActions.find(a => a.id === selectedQuickAction);
              if (!current) return null;
              return (
                <div className="p-6 md:p-8 rounded-3xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700 pb-4">
                    <div className="space-y-1">
                      <span className="text-xs font-black uppercase tracking-wider text-cyan-500">Roteiro Guiado</span>
                      <h3 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">
                        {current.title}
                      </h3>
                    </div>
                    <button
                      onClick={() => onNavigateTab(current.targetTab)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition-all self-start sm:self-auto"
                    >
                      {current.targetTabLabel}
                      <ArrowRight size={14} />
                    </button>
                  </div>

                  <div className="space-y-4">
                    {current.steps.map((step, idx) => (
                      <div key={idx} className="flex items-start gap-3.5">
                        <div className="w-7 h-7 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-sm">
                          {idx + 1}
                        </div>
                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed pt-0.5">
                          {step}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </motion.div>
      )}

      {/* SEÇÃO 4: TOUR PELOS MENUS */}
      {activeSection === "menus" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">
                O que cada botão do menu lateral faz?
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                Conheça para que serve cada uma das opções da barra esquerda:
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {menuExplains.map((menu, idx) => {
                const Icon = menu.icon;
                return (
                  <div
                    key={idx}
                    className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-cyan-400">
                        <Icon size={22} />
                      </div>
                      <h3 className="font-bold text-base text-slate-900 dark:text-white">{menu.name}</h3>
                    </div>
                    <p className="text-xs md:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      {menu.desc}
                    </p>
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 text-[11px] text-slate-500 dark:text-slate-400">
                      <strong>Quando usar:</strong> {menu.when}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* SEÇÃO 5: DÚVIDAS FREQUENTES (FAQ) */}
      {activeSection === "faq" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">
                Perguntas Frequentes & "E se acontecer isso?"
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                Respostas diretas para as dúvidas mais comuns de quem está começando a usar o sistema:
              </p>
            </div>

            <div className="space-y-4">
              {filteredFaq.map((faq, idx) => (
                <div
                  key={idx}
                  className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2"
                >
                  <div className="flex items-start gap-3">
                    <HelpCircle size={20} className="text-cyan-500 shrink-0 mt-0.5" />
                    <h3 className="font-bold text-sm md:text-base text-slate-900 dark:text-white">
                      {faq.q}
                    </h3>
                  </div>
                  <p className="text-xs md:text-sm text-slate-600 dark:text-slate-300 leading-relaxed pl-8">
                    {faq.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* SEÇÃO 6: GLOSSÁRIO DE SIGLAS */}
      {activeSection === "glossario" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">
                Dicionário de Siglas da Frota
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                Não sabe o que significa uma sigla na tabela? Encontre aqui a explicação simples:
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {glossaryItems.map((item, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1.5"
                >
                  <div className="inline-block px-2.5 py-0.5 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-cyan-300 font-black text-xs tracking-wider">
                    {item.term}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {item.meaning}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Card de Apoio e Rodapé */}
      <div className="p-6 rounded-3xl bg-slate-900 text-white border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 border border-cyan-500/40">
            <CheckCheck size={20} />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Pronto para começar?</p>
            <p className="text-xs text-slate-400">Você já sabe tudo o que precisa para operar o sistema com confiança total!</p>
          </div>
        </div>
        <button
          onClick={() => onNavigateTab("dashboard")}
          className="px-6 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs tracking-wide transition-all shadow-[0_0_15px_rgba(6,182,212,0.4)] shrink-0"
        >
          Acessar Painel Agora
        </button>
      </div>
    </div>
  );
};
export default ComoUsarTab;
