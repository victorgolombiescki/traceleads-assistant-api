/**
 * Catálogo allowlist: só estes GETs podem ser chamados por `consultarRecursoTraceLeads`.
 * Expande aqui para “mais ferramentas” sem multiplicar definições `tool()` no modelo.
 */
export const TRACELEADS_RECURSOS_CATALOGO = [
  {
    id: "tl_dashboard",
    path: "/dashboard",
    descricao:
      "GET agregado da ‘home’ operacional: pipeline, funil, atividades do mês, periodMonth (métricas do mês no servidor), notificações. Melhor 1.ª escolha para resumo aberto, ‘como está o funil’, ‘o que olhar hoje’. notifications.newLeads = criados hoje na base (não é total acumulado).",
  },
  { id: "tl_analytics_stats", path: "/analytics/stats", descricao: "Estatísticas gerais de analytics (público agregado)" },
  { id: "tl_analytics_email_dominios", path: "/analytics/email-dominios", descricao: "Distribuição de domínios de e-mail na base agregada" },
  { id: "tl_analytics_principal", path: "/analytics", descricao: "Analytics completo (query: days)", queryKeysPermitidas: ["days"] },
  { id: "tl_leads_lista", path: "/leads", descricao: "Lista de leads com filtros", queryKeysPermitidas: ["limit", "offset", "status", "search", "responsibleId", "pipelineId", "temperature", "questionnairePending", "groupId"] },
  { id: "tl_leads_count", path: "/leads/count", descricao: "Contagem de leads (acumulado; filtros status/pipeline; sem período/data)" },
  { id: "tl_leads_stats", path: "/leads/stats", descricao: "Estatísticas de leads por pipeline (agregado)" },
  {
    id: "tl_leads_kanban_board",
    path: "/leads/kanban-board",
    descricao:
      "FONTE PREFERIDA para 'quantos leads por etapa/coluna'. Devolve array de colunas com countByStatus (contagem real por coluna, isolada por pipelineId). Sem pipelineId usa o pipeline padrão automaticamente. Filtra por lead.pipelineId no SQL — resultado é o que o utilizador vê no ecrã. Usa sempre este em vez de tl_leads_indicators_funnel para contar leads por etapa.",
    queryKeysPermitidas: ["pipelineId", "limit"],
  },
  { id: "tl_leads_status_map", path: "/leads/status-map", descricao: "Mapa de estados dos leads" },
  { id: "tl_leads_kanban_columns", path: "/leads/kanban-columns", descricao: "Colunas do kanban de leads" },
  { id: "tl_leads_groups", path: "/leads/groups", descricao: "Grupos de leads" },
  { id: "tl_leads_automacoes", path: "/leads/automations", descricao: "Automações de leads" },
  { id: "tl_leads_questionarios", path: "/leads/questionnaires", descricao: "Questionários de leads" },
  { id: "tl_leads_scoring_rules", path: "/leads/scoring-rules", descricao: "Regras de scoring" },
  { id: "tl_leads_leaderboard", path: "/leads/leaderboard", descricao: "Leaderboard de responsáveis / performance" },
  {
    id: "tl_leads_indicators_funnel",
    path: "/leads/indicators/funnel",
    descricao:
      "⚠️ USAR APENAS para métricas de funil (valor, tempo médio na etapa, paradosMais7Dias). NÃO usar para contar leads por etapa — sem pipelineId mistura todos os leads da conta (incluindo leads sem pipeline atribuído) e dá contagens incorretas. Para 'quantos leads por etapa' usa SEMPRE tl_leads_kanban_board.",
    queryKeysPermitidas: ["pipelineId"],
  },
  {
    id: "tl_leads_indicators_summary",
    path: "/leads/indicators/summary",
    descricao:
      "Totais da conta: totalLeads, pipelineCount, valores ganhos/perdidos/em pipeline (acumulado; não substitui período nem painel completo). Query opcional pipelineId. IMPORTANTE: se a empresa tiver múltiplos pipelines, passa SEMPRE pipelineId para evitar zeros ou dados misturados — chama tl_pipelines_lista primeiro se não souberes o id.",
    queryKeysPermitidas: ["pipelineId"],
  },
  { id: "tl_leads_indicators_by_responsible", path: "/leads/indicators/by-responsible", descricao: "Indicador: por responsável", queryKeysPermitidas: ["pipelineId"] },
  {
    id: "tl_leads_indicators_retornos",
    path: "/leads/indicators/retornos",
    descricao:
      "Contagens de e-mail e WhatsApp no período: resposta JSON com emails.enviados / whatsapp.enviados (e taxas). parametrosQuery.period = hoje | ultimos_7_dias | ultimos_30_dias | mes_atual | ano_atual. Para ‘último mês’ usa mes_atual ou ultimos_30_dias conforme o utilizador.",
    queryKeysPermitidas: ["period", "pipelineId"],
  },
  { id: "tl_leads_indicators_activities", path: "/leads/indicators/activities", descricao: "Indicador: atividades", queryKeysPermitidas: ["period", "pipelineId"] },
  {
    id: "tl_leads_indicators_period",
    path: "/leads/indicators/period",
    descricao:
      "Novos/ganhos/perdidos no período: parametrosQuery.period = hoje | ultimos_7_dias | ultimos_30_dias | mes_atual | ano_atual; newInPeriodCount = leads criados na janela",
    queryKeysPermitidas: ["period", "pipelineId"],
  },
  { id: "tl_leads_indicators_temporal", path: "/leads/indicators/temporal", descricao: "Indicador: série temporal", queryKeysPermitidas: ["pipelineId"] },
  { id: "tl_leads_indicators_operational", path: "/leads/indicators/operational", descricao: "Indicador: operacional", queryKeysPermitidas: ["period", "responsibleUserId", "status", "pipelineId"] },
  { id: "tl_leads_indicators_lead_direction", path: "/leads/indicators/lead-direction", descricao: "Indicador: direção do lead" },
  {
    id: "tl_whatsapp_connection",
    path: "/whatsapp/connection",
    descricao: "Estado da integração WhatsApp Cloud API da empresa (ligação, número, etc.) — usar para ‘como está o meu WhatsApp’.",
  },
  { id: "tl_whatsapp_access_check", path: "/whatsapp/access/check", descricao: "Se o módulo/plano permite WhatsApp" },
  {
    id: "tl_whatsapp_conversations_stats",
    path: "/whatsapp/conversations/stats",
    descricao: "Resumo: conversas ativas, total, mensagens enviadas no mês, taxa de resposta — para contagens sem listar conversas.",
  },
  {
    id: "tl_whatsapp_conversations",
    path: "/whatsapp/conversations",
    descricao: "Lista paginada de conversas (ativas/arquivadas conforme status na API).",
    queryKeysPermitidas: ["page", "limit", "status", "search"],
  },
  { id: "tl_whatsapp_templates", path: "/whatsapp/templates", descricao: "Modelos de mensagem WhatsApp" },
  { id: "tl_whatsapp_quick_replies", path: "/whatsapp/quick-replies", descricao: "Respostas rápidas WhatsApp" },
  { id: "tl_whatsapp_bulk_send", path: "/whatsapp/bulk-send", descricao: "Envios em massa WhatsApp" },
  { id: "tl_email_templates", path: "/email/templates", descricao: "Templates de e-mail criados na conta (id, name, subject, htmlContent). Usar para listar templates disponíveis ao criar campanha." },
  { id: "tl_campaigns_lista", path: "/campaigns", descricao: "Campanhas de e-mail" },
  { id: "tl_campaigns_send_config", path: "/campaigns/send-config", descricao: "Configuração de envio de campanhas" },
  { id: "tl_campaigns_leads", path: "/campaigns/leads", descricao: "Leads disponíveis para campanhas", queryKeysPermitidas: ["search", "limit", "offset"] },
  {
    id: "tl_email_stats",
    path: "/email/stats",
    descricao:
      "E-mails enviados da empresa: summary agregado + lista paginada. Query days (ex.: 30 ou 31 para ‘último mês’), page, limit, templateId. Requer módulo comunicação.",
    queryKeysPermitidas: ["days", "page", "limit", "templateId", "orderBy"],
  },
  {
    id: "tl_email_stats_chart",
    path: "/email/stats/chart",
    descricao: "Série diária de envios/abertas de e-mail (gráfico). Query days (defeito 30), templateId opcional.",
    queryKeysPermitidas: ["days", "templateId"],
  },
  { id: "tl_pipelines_lista", path: "/pipelines", descricao: "Pipelines de vendas" },
  { id: "tl_pipelines_default", path: "/pipelines/default", descricao: "Pipeline padrão da empresa" },
  { id: "tl_subscriptions_planos_atuais", path: "/subscriptions/current-plans", descricao: "Planos atuais da subscrição" },
  { id: "tl_subscriptions_modulos", path: "/subscriptions/enabled-modules", descricao: "Módulos ativos (leads, WhatsApp, etc.)" },
  { id: "tl_subscriptions_pagamentos", path: "/subscriptions/payments", descricao: "Histórico de pagamentos" },
  { id: "tl_subscriptions_plan_history", path: "/subscriptions/plan-history", descricao: "Histórico de planos", queryKeysPermitidas: ["limit"] },
  { id: "tl_agents_lista", path: "/agents", descricao: "Agentes de IA configurados" },
  { id: "tl_icp_lista", path: "/icp", descricao: "Perfis ICP" },
  { id: "tl_outbound_perfis", path: "/outbound/profiles", descricao: "Perfis outbound" },
  { id: "tl_calendar_disponibilidades", path: "/calendar/availability", descricao: "Disponibilidades de calendário", queryKeysPermitidas: ["userId"] },
  { id: "tl_calendar_slots", path: "/calendar/slots", descricao: "Slots de agendamento (público)", queryKeysPermitidas: ["date", "userId", "companyId"] },
  { id: "tl_calendar_agendamentos", path: "/calendar/appointments", descricao: "Agendamentos da empresa", queryKeysPermitidas: ["leadCnpj", "userId"] },
  { id: "tl_kanban_boards", path: "/kanban/boards", descricao: "Quadros kanban (gestão)" },
  { id: "tl_meta_leadgen_configs", path: "/meta-leadgen/configs", descricao: "Configurações Meta Lead Ads" },
  { id: "tl_inbound_configs", path: "/inbound-lead/configs", descricao: "Configurações de captura inbound" },
  { id: "tl_news_agenda_dates", path: "/news-agenda/dates", descricao: "Datas com notícias na agenda IA", queryKeysPermitidas: ["limit"] },
  { id: "tl_news_agenda_profile", path: "/news-agenda/profile", descricao: "Perfil da empresa na agenda de notícias" },
  { id: "tl_notifications_preferences", path: "/notifications/preferences", descricao: "Preferências de notificações do utilizador" },
] as const;

export type TraceleadsRecursoCatalogId = (typeof TRACELEADS_RECURSOS_CATALOGO)[number]["id"];

const CATALOGO_POR_ID: ReadonlyMap<string, (typeof TRACELEADS_RECURSOS_CATALOGO)[number]> = new Map(
  TRACELEADS_RECURSOS_CATALOGO.map((e) => [e.id, e]),
);

export function getCatalogEntry(id: string): (typeof TRACELEADS_RECURSOS_CATALOGO)[number] | undefined {
  return CATALOGO_POR_ID.get(id);
}

const firstId = TRACELEADS_RECURSOS_CATALOGO[0].id;
const restIds = TRACELEADS_RECURSOS_CATALOGO.slice(1).map((r) => r.id);
export const TRACELEADS_RECURSO_ENUM_TUPLE = [firstId, ...restIds] as [TraceleadsRecursoCatalogId, ...TraceleadsRecursoCatalogId[]];
