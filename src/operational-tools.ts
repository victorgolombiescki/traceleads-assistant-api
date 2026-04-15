import { tool } from "ai";
import { z } from "zod";
import { traceleadsGetJson, type TraceleadsQuery } from "./traceleads-client.js";
import {
  getCatalogEntry,
  TRACELEADS_RECURSO_ENUM_TUPLE,
  TRACELEADS_RECURSOS_CATALOGO,
} from "./traceleads-resource-catalog.js";

const MAX_PARAM_LEN = 220;
const MAX_JSON_CHARS = 55_000;

function filtrarQuery(
  raw: Record<string, string> | undefined,
  permitidas: readonly string[] | undefined,
): TraceleadsQuery {
  if (!raw || typeof raw !== "object") return {};
  const keys = permitidas ?? [];
  if (keys.length === 0) return {};
  const out: TraceleadsQuery = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!keys.includes(k)) continue;
    if (typeof v !== "string") continue;
    const t = v.trim().slice(0, MAX_PARAM_LEN);
    if (t !== "") out[k] = t;
  }
  return out;
}

function truncarResposta(data: unknown): unknown {
  try {
    const s = JSON.stringify(data);
    if (s.length <= MAX_JSON_CHARS) return data;
    return {
      _truncado: true,
      tamanhoCaracteres: s.length,
      amostraJson: `${s.slice(0, MAX_JSON_CHARS)}…`,
    };
  } catch {
    return { _erroSerializacao: true };
  }
}

/** Descrição enviada ao modelo: routing natural de perguntas → valor de \`recurso\`. */
const DESCRICAO_CONSULTAR_RECURSO = `Lê dados reais da conta do utilizador (GET autenticado). Usa sempre que a pergunta for sobre a operação dele na TraceLeads — nunca respondas números ou estados só de memória.

**Como escolher \`recurso\` (mapeamento por intenção):**
- **Visão geral do painel / “como estão as coisas” / funil / prioridades / “o que fazer hoje”** → \`tl_dashboard\` (pipeline, funil, atividades do mês, métricas do período, alertas).
- **Totais globais de leads** (quantos leads, valor em pipeline, ganhos/perdidos agregados) → \`tl_leads_indicators_summary\` (opcional \`pipelineId\` em parametrosQuery).
- **Só o funil de vendas** → \`tl_leads_indicators_funnel\`.
- **Números num intervalo de tempo** (“este mês”, “últimos 7 dias”, “hoje”) → \`tl_leads_indicators_period\` com \`parametrosQuery\` tipo \`{"period":"mes_atual"}\` (valores: hoje, ultimos_7_dias, ultimos_30_dias, mes_atual, ano_atual). O campo \`newInPeriodCount\` são leads **criados** nessa janela.
- **Comparar período atual vs anterior** (semana/mês/trimestre) → \`tl_leads_indicators_temporal\`.
- **Listar ou amostrar leads** → \`tl_leads_lista\`; **contagem com filtros** (status, pipeline), sem data → \`tl_leads_count\`.
- **WhatsApp — ligação / integração** → \`tl_whatsapp_connection\` (e \`tl_whatsapp_access_check\` se precisares de permissão de módulo).
- **WhatsApp — conversas ativas, totais, mensagens no mês** → \`tl_whatsapp_conversations_stats\`; **lista de conversas** → \`tl_whatsapp_conversations\` (page, limit, status, search).
- **Quantas mensagens WhatsApp ou e-mails enviados num intervalo** (“último mês”, “últimos 30 dias”) → \`tl_leads_indicators_retornos\` com \`{"period":"mes_atual"}\` ou \`ultimos_30_dias\`: no JSON vêm \`whatsapp.enviados\` e \`emails.enviados\` (e período em \`periodo\`).
- **E-mails — relatório detalhado / histórico paginado** (módulo comunicação) → \`tl_email_stats\` com \`days\` (ex. 30); **série diária** → \`tl_email_stats_chart\`.
- **Campanhas de e-mail, pipelines, subscrição, agentes, ICP, calendário** → ids \`tl_campaigns_*\`, \`tl_pipelines_*\`, etc. no enum.

**Mercado de empresas (CNAE, Brasil, contagem na base pública)** → usa as ferramentas \`contarEmpresasMercado\` / \`pesquisarCnaesMercado\` / etc., **não** esta.

\`parametrosQuery\`: só chaves permitidas para aquele recurso (strings). Se o recurso não definir chaves, omite. O catálogo tem ${TRACELEADS_RECURSOS_CATALOGO.length} recursos (cada \`id\` do enum).`;

/** GETs operacionais da TraceLeads (allowlist); não expõe URLs arbitrárias. */
export function buildOperationalTools(authorization: string) {
  const consultarRecursoTraceLeads = tool({
    description: DESCRICAO_CONSULTAR_RECURSO,
    inputSchema: z.object({
      recurso: z
        .enum(TRACELEADS_RECURSO_ENUM_TUPLE)
        .describe(
          "Identificador do GET. Painel geral → tl_dashboard; WhatsApp ligação → tl_whatsapp_connection; stats conversas → tl_whatsapp_conversations_stats; envios WA/e-mail por período → tl_leads_indicators_retornos + period; detalhe e-mails → tl_email_stats (days).",
        ),
      parametrosQuery: z
        .record(z.string())
        .optional()
        .describe(
          "Query string (só chaves permitidas ao recurso). Ex.: {\"period\":\"mes_atual\",\"pipelineId\":\"1\"}. Omitir se não precisares de filtros.",
        ),
    }),
    execute: async ({ recurso, parametrosQuery }) => {
      const entry = getCatalogEntry(recurso);
      if (!entry) throw new Error("Recurso inválido");
      const permitidas = "queryKeysPermitidas" in entry ? entry.queryKeysPermitidas : undefined;
      const q = filtrarQuery(parametrosQuery, permitidas);
      const data = await traceleadsGetJson<unknown>(entry.path, authorization, q);
      return {
        recurso,
        path: entry.path,
        dados: truncarResposta(data),
      };
    },
  });

  const consultarDetalheTraceLeads = tool({
    description:
      "Detalhe de **um** registo por id numérico (GET). Usa quando já tens um id (lista, URL, contexto) e o utilizador quer ficha completa: lead (contacto, empresa), campanha de e-mail, pipeline, agente de IA ou conversa WhatsApp. Não uses para resumo agregado do painel — aí é consultarRecursoTraceLeads (ex.: tl_dashboard).",
    inputSchema: z.object({
      entidade: z
        .enum(["lead", "campanha_email", "pipeline", "agente_ia", "conversa_whatsapp"])
        .describe("Tipo de recurso a detalhar."),
      id: z
        .union([z.number().int().positive(), z.string().regex(/^\d{1,12}$/)])
        .describe("Identificador numérico na API."),
    }),
    execute: async ({ entidade, id }) => {
      const sid = typeof id === "number" ? String(id) : id;
      const pathBy: Record<string, string> = {
        lead: `/leads/${sid}`,
        campanha_email: `/campaigns/${sid}`,
        pipeline: `/pipelines/${sid}`,
        agente_ia: `/agents/${sid}`,
        conversa_whatsapp: `/whatsapp/conversations/${sid}`,
      };
      const path = pathBy[entidade];
      const data = await traceleadsGetJson<unknown>(path, authorization, {});
      return { entidade, path, dados: truncarResposta(data) };
    },
  });

  return { consultarRecursoTraceLeads, consultarDetalheTraceLeads };
}
