/**
 * Ferramentas de AÇÃO do Trace (POST/PATCH na API TraceLeads).
 *
 * Cada ferramenta executa uma operação real no sistema do utilizador.
 * O modelo deve sempre confirmar com o utilizador antes de chamar estas ferramentas
 * (o system prompt orienta isso).
 *
 * LIMITES DE SEGURANÇA (invioláveis — definidos aqui e no frontend):
 *   - enviarTemplateParaLead: apenas 1 lead por chamada (nunca em loop)
 *   - enriquecerLeads: máx. 50 leads por chamada (créditos mensais)
 *   - Campanhas / disparos WhatsApp em massa: geridos pelo frontend com cap de 100 leads
 */

import { tool } from "ai";
import { z } from "zod";
import { traceleadsGetJson, traceleadsPostJson, traceleadsPatchJson } from "./traceleads-client.js";

/** Resultado genérico de ação executada. */
type ActionResult = {
  sucesso: boolean;
  mensagem: string;
  dados?: unknown;
};

/**
 * Ferramentas de escrita/ação do Trace.
 * Exigem que o utilizador tenha confirmado a intenção antes de serem chamadas.
 */
export function buildActionTools(authorization: string) {

  // ── Mover lead no funil ────────────────────────────────────────────────────

  const moverLeadNoFunil = tool({
    description:
      "Move um lead de uma coluna para outra no pipeline (funil de vendas). Use apenas após o utilizador confirmar explicitamente a movimentação. Sempre chame consultarRecursoTraceLeads(tl_pipelines_lista) para obter os ids de colunas disponíveis antes de executar.",
    inputSchema: z.object({
      leadId: z.number().int().positive().describe("ID numérico do lead na TraceLeads"),
      statusColumn: z
        .string()
        .describe("ID da coluna de destino (uuid ou id da coluna no pipeline)"),
      pipelineId: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("ID do pipeline (necessário quando o lead for de um pipeline específico)"),
    }),
    execute: async ({ leadId, statusColumn, pipelineId }): Promise<ActionResult> => {
      const body: Record<string, unknown> = { statusColumn };
      if (pipelineId != null) body.pipelineId = pipelineId;
      try {
        const dados = await traceleadsPatchJson<unknown>(`/leads/${leadId}`, authorization, body);
        return {
          sucesso: true,
          mensagem: `Lead #${leadId} movido para a coluna "${statusColumn}" com sucesso.`,
          dados,
        };
      } catch (err) {
        return {
          sucesso: false,
          mensagem: `Falha ao mover lead #${leadId}: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  });

  // ── Acionar follow-up ──────────────────────────────────────────────────────

  const acionarFollowUp = tool({
    description:
      "Aciona o job de follow-up de WhatsApp manualmente (equivale ao botão 'Executar agora' na tela /whatsapp/follow-up). Recomendado quando o utilizador quiser retomar conversas paradas. Não acionar sem confirmação explícita.",
    inputSchema: z.object({
      incluirConversasAntigas: z
        .boolean()
        .optional()
        .default(false)
        .describe("Se true, inclui conversas mais antigas (modo de teste/retroativo)"),
    }),
    execute: async ({ incluirConversasAntigas }): Promise<ActionResult> => {
      try {
        const dados = await traceleadsPostJson<unknown>("/follow-up/run", authorization, {
          includeOld: incluirConversasAntigas,
        });
        return {
          sucesso: true,
          mensagem: `Follow-up acionado com sucesso${incluirConversasAntigas ? " (modo retroativo ativo)" : ""}.`,
          dados,
        };
      } catch (err) {
        return {
          sucesso: false,
          mensagem: `Falha ao acionar follow-up: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  });

  // ── Enriquecer leads em lote ───────────────────────────────────────────────

  const enriquecerLeads = tool({
    description:
      "Dispara enriquecimento em lote para uma lista de leads (usa créditos mensais de enriquecimento). Usa a API /company-enrichment/bulk-enrich. Só acionar após confirmação do utilizador, pois consome créditos.",
    inputSchema: z.object({
      leadIds: z
        .array(z.number().int().positive())
        .min(1)
        .max(50)
        .describe("Lista de IDs de leads para enriquecer (máximo 50 por vez)"),
    }),
    execute: async ({ leadIds }): Promise<ActionResult> => {
      try {
        const dados = await traceleadsPostJson<unknown>("/company-enrichment/bulk-enrich", authorization, {
          leadIds,
        });
        return {
          sucesso: true,
          mensagem: `Enriquecimento iniciado para ${leadIds.length} lead(s). O processo roda em background — consulte o progresso em /ai-agents/enriquecimento/em-massa.`,
          dados,
        };
      } catch (err) {
        return {
          sucesso: false,
          mensagem: `Falha ao iniciar enriquecimento: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  });

  // ── Gerar rascunho de newsletter ──────────────────────────────────────────

  const gerarNewsletterDraft = tool({
    description:
      "Gera um rascunho de newsletter HTML com as notícias selecionadas. Requer que o utilizador já tenha selecionado as notícias (informe os IDs). O draft fica salvo em /inteligencia/newsletter para revisão e envio.",
    inputSchema: z.object({
      newsIds: z
        .array(z.number().int().positive())
        .min(1)
        .describe("IDs das notícias selecionadas para compor a newsletter"),
      template: z
        .enum(["minimal", "clean"])
        .default("clean")
        .describe("Modelo visual: minimal (simples) ou clean (com estilo)"),
      instrucoes: z
        .string()
        .max(500)
        .optional()
        .describe("Instruções opcionais de refinamento (tom, foco temático, etc.)"),
    }),
    execute: async ({ newsIds, template, instrucoes }): Promise<ActionResult> => {
      try {
        const body: Record<string, unknown> = { newsIds, template };
        if (instrucoes) body.refinementInstructions = instrucoes;
        const dados = await traceleadsPostJson<unknown>(
          "/news-agenda/inteligencia/generate-newsletter",
          authorization,
          body,
        );
        return {
          sucesso: true,
          mensagem: `Rascunho de newsletter gerado! Acesse /inteligencia/newsletter para revisar e copiar o HTML.`,
          dados,
        };
      } catch (err) {
        return {
          sucesso: false,
          mensagem: `Falha ao gerar newsletter: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  });

  // ── Criar lead manual ──────────────────────────────────────────────────────

  const criarLead = tool({
    description:
      "Cria um novo lead no CRM. Requer pelo menos nome ou empresa e o pipeline de destino. Confirmar com o utilizador antes de executar.",
    inputSchema: z.object({
      nome: z.string().max(200).optional().describe("Nome do contato"),
      empresa: z.string().max(200).optional().describe("Razão social ou nome da empresa"),
      email: z.string().email().optional().describe("E-mail do contato"),
      telefone: z.string().max(30).optional().describe("Telefone do contato (com DDD)"),
      cnpj: z.string().max(18).optional().describe("CNPJ da empresa (somente dígitos ou formatado)"),
      pipelineId: z.number().int().positive().optional().describe("ID do pipeline de destino"),
      statusColumn: z.string().optional().describe("ID da coluna inicial no pipeline"),
      observacoes: z.string().max(2000).optional().describe("Observações iniciais sobre o lead"),
    }),
    execute: async (input): Promise<ActionResult> => {
      if (!input.nome && !input.empresa) {
        return { sucesso: false, mensagem: "Informe pelo menos o nome ou a empresa do lead." };
      }
      try {
        const body: Record<string, unknown> = {};
        if (input.nome) body.contactName = input.nome;
        if (input.empresa) body.companyName = input.empresa;
        if (input.email) body.contactEmail = input.email;
        if (input.telefone) body.contactPhone = input.telefone;
        if (input.cnpj) body.cnpj = input.cnpj.replace(/\D/g, "");
        if (input.pipelineId) body.pipelineId = input.pipelineId;
        if (input.statusColumn) body.statusColumn = input.statusColumn;
        if (input.observacoes) body.notes = input.observacoes;
        const dados = await traceleadsPostJson<unknown>("/leads", authorization, body);
        return {
          sucesso: true,
          mensagem: `Lead "${input.nome || input.empresa}" criado com sucesso no CRM.`,
          dados,
        };
      } catch (err) {
        return {
          sucesso: false,
          mensagem: `Falha ao criar lead: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  });

  // ── Criar template de email ────────────────────────────────────────────────

  const criarTemplateEmail = tool({
    description:
      "Gera e salva um template de email em HTML no sistema. Use quando o utilizador pedir para criar um template de email ou para salvar um HTML gerado como template. Primeiro recolha: nome do template, assunto do email e o conteúdo/objetivo. Depois gere o HTML completo e chame esta ferramenta apenas após confirmação explícita do utilizador.",
    inputSchema: z.object({
      nome: z
        .string()
        .min(2)
        .describe("Nome interno do template (ex: 'Prospecção B2B Criciúma')"),
      assunto: z
        .string()
        .min(2)
        .describe("Assunto do email que o destinatário verá (ex: 'Conheça nossas soluções de vendas')"),
      html: z
        .string()
        .min(50)
        .describe("Conteúdo HTML completo e válido do template de email"),
    }),
    execute: async (input): Promise<ActionResult> => {
      try {
        const dados = await traceleadsPostJson<unknown>(
          "/email/templates",
          authorization,
          { name: input.nome, subject: input.assunto, htmlContent: input.html },
        );
        return {
          sucesso: true,
          mensagem: `Template de email "${input.nome}" criado com sucesso. Pode acessá-lo em Email Marketing → Templates.`,
          dados,
        };
      } catch (err) {
        return {
          sucesso: false,
          mensagem: `Falha ao criar template: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  });

  // ── Enviar template WhatsApp para um lead ─────────────────────────────────
  // LIMITE: apenas 1 lead por invocação. Nunca chamar em loop.

  const enviarTemplateParaLead = tool({
    description:
      "⚠️ USA APENAS PARA 1 LEAD ESPECÍFICO POR NOME/ID. " +
      "PROIBIDO chamar em loop ou para grupos/colunas/pipelines — usa o bloco whatsapp-bulk-preview nesses casos. " +
      "Envia um template de WhatsApp (pré-aprovado pela Meta) para o telefone de UM único lead. " +
      "Fluxo: 1) listar templates via tl_whatsapp_templates; 2) utilizador escolhe; 3) confirmar em texto; 4) executar. " +
      "Requer templateId e leadId. Busca automaticamente o telefone do lead. " +
      "NUNCA chamar mais de uma vez por resposta — qualquer envio em massa é feito pelo modal de disparo, não por esta ferramenta.",
    inputSchema: z.object({
      leadId: z
        .number()
        .int()
        .positive()
        .describe("ID numérico do lead no CRM (obtido via tl_leads_lista ou contexto)"),
      templateId: z
        .number()
        .int()
        .positive()
        .describe("ID numérico do template WhatsApp (obtido via tl_whatsapp_templates)"),
      variables: z
        .array(z.string())
        .max(10)
        .optional()
        .describe(
          "Variáveis do template na ordem {{1}}, {{2}}, … (ex.: [\"João\", \"TraceAI\"]). Omitir se o template não tiver variáveis.",
        ),
    }),
    execute: async (input): Promise<ActionResult> => {
      try {
        // Buscar telefone do lead
        const lead = await traceleadsGetJson<{ id: number; phone?: string | null; name?: string | null }>(
          `/leads/${input.leadId}`,
          authorization,
        );
        const phone = (lead as any).phone || (lead as any).contactPhone || (lead as any).whatsapp;
        if (!phone) {
          return {
            sucesso: false,
            mensagem: `Lead #${input.leadId} não tem telefone cadastrado — adicione um número antes de enviar.`,
          };
        }

        const payload: Record<string, unknown> = {
          toPhone: phone,
          type: "template",
          templateId: input.templateId,
        };
        if (input.variables && input.variables.length > 0) {
          payload.templateVariables = input.variables;
        }

        const result = await traceleadsPostJson<unknown>(
          "/whatsapp/conversations/send-message",
          authorization,
          payload,
        );

        return {
          sucesso: true,
          mensagem: `Template enviado para o lead "${(lead as any).name || `#${input.leadId}`}" (${phone}) com sucesso.`,
          dados: result,
        };
      } catch (err) {
        return {
          sucesso: false,
          mensagem: `Falha ao enviar template: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  });

  return {
    moverLeadNoFunil,
    acionarFollowUp,
    enriquecerLeads,
    gerarNewsletterDraft,
    criarLead,
    criarTemplateEmail,
    enviarTemplateParaLead,
  };
}
