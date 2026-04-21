import { tool } from "ai";
import { z } from "zod";
import { traceleadsGetJson } from "./traceleads-client.js";
import { filtroMercadoBaseSchema, filtroMercadoToQueryParams } from "./filter-params.js";
import { buildOperationalTools } from "./operational-tools.js";
import { buildActionTools } from "./action-tools.js";

type CountResponse = { total: number };

type EmpresaRow = Record<string, unknown>;

type DataResponse = {
  data: EmpresaRow[];
  page: number;
  limit: number;
};

type CnaeItem = { codigo: string; descricao: string };

/** Agrupa os 2 primeiros dígitos dos CNAEs devolvidos (amostra da API) — ajuda a usar UM prefixo em contarEmpresasMercado em vez de listar dezenas de códigos. */
function calcularPrefixosDominantes(cnaes: CnaeItem[], limite = 8): { prefixo: string; ocorrenciasNaAmostra: number }[] {
  const counts = new Map<string, number>();
  for (const { codigo } of cnaes) {
    const c = String(codigo ?? "").replace(/\D/g, "");
    if (c.length < 2) continue;
    const p = c.slice(0, 2);
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limite)
    .map(([prefixo, ocorrenciasNaAmostra]) => ({ prefixo, ocorrenciasNaAmostra }));
}

function mergeCnaesPorCodigo(a: CnaeItem[], b: CnaeItem[]): CnaeItem[] {
  const m = new Map<string, CnaeItem>();
  for (const x of [...a, ...b]) {
    const codigo = String(x.codigo ?? "").trim();
    if (!codigo || m.has(codigo)) continue;
    m.set(codigo, {
      codigo,
      descricao: String(x.descricao ?? "").trim(),
    });
  }
  return [...m.values()];
}

/** Sugestão conservadora para filtro "cnae" amplo (2 dígitos ou 41,42) — evita 4111/4931 a quatro dígitos. */
function inferirSugestaoFiltroCnaeAmplo(
  termo: string,
  prefixosDominantes: { prefixo: string }[],
): string | null {
  const t = termo.toLowerCase();
  if (/construt|constru|edif[ií]cio|empreiteir|obra\s*civil/i.test(t)) return "41,42";
  if (/transport|transportad|carga|log[ií]stic|rodovi[aá]ri/i.test(t)) return "49";
  const top = prefixosDominantes[0]?.prefixo;
  return top && /^\d{2}$/.test(top) ? top : null;
}

function resumoEmpresa(e: EmpresaRow) {
  return {
    cnpj: e.cnpj,
    razaoSocial: e.razaoSocial ?? e.razao_social,
    nomeFantasia: e.nomeFantasia ?? e.nome_fantasia,
    uf: e.uf,
    municipio: e.municipio,
    cnaeFiscal: e.cnaeFiscal ?? e.cnae_fiscal,
    cnaeDescricao: e.cnaeFiscalDescricao ?? e.cnae_fiscal_descricao,
  };
}

const DESCRICAO_FILTROS =
  "Objeto opcional (consulta avançada): ufs, cnae (preferir 2 dígitos ou 7; vírgula=OR, ex. 41,42), cnaeSecundario + cnaeOperador, municipio(s), buscaTexto, porte(s), regimesTributarios, capital, dataInicioMin/dataInicioMax (início de atividade; **ano = referência temporal do system**, nunca 2023 por defeito), e-mail/telefone, Simples/MEI, matriz/filial, natureza, excluir e-mail/leads, filiais/funcionários, grauRisco. Se total=0 com pergunta ampla, repetir com cnae de 2 dígitos (ex. 41 ou 49) antes de concluir.";

function sliceArr<T>(v: unknown, max: number): T[] {
  return Array.isArray(v) ? (v.slice(0, max) as T[]) : [];
}

/**
 * Ferramentas só chamam a API TraceLeads (JWT do utilizador) — nenhum SQL direto.
 */
export function buildMercadoTools(authorization: string) {
  const pesquisarCnaesMercado = tool({
    description:
      "CNAEs existentes na base por texto ou dígitos. Devolve prefixosDominantesNosResultados, sugestaoFiltroCnaeAmplo (41,42 construção; 49 transporte terrestre quando o termo bate com esses casos) e referenciaRapidaDivisoes. Opcional termoAlternativo funde duas buscas (ex. transportador + carga). Usa sugestaoFiltroCnaeAmplo em contarEmpresasMercado para perguntas amplas.",
    inputSchema: z.object({
      termo: z
        .string()
        .min(2)
        .max(80)
        .describe("Palavras-chave do setor ou dígitos iniciais do CNAE"),
      termoAlternativo: z
        .string()
        .min(2)
        .max(80)
        .optional()
        .describe("Segundo termo para fundir resultados (sinónimo ou foco, ex. carga após transportador)"),
    }),
    execute: async ({ termo, termoAlternativo }) => {
      const t0 = termo.trim();
      const t1 = termoAlternativo?.trim();
      const [listaA, listaB] = await Promise.all([
        traceleadsGetJson<CnaeItem[]>("/companies-search/cnaes", authorization, { search: t0 }),
        t1
          ? traceleadsGetJson<CnaeItem[]>("/companies-search/cnaes", authorization, { search: t1 })
          : Promise.resolve([] as CnaeItem[]),
      ]);
      const rawA = Array.isArray(listaA) ? listaA : [];
      const rawB = Array.isArray(listaB) ? listaB : [];
      const merged = t1 ? mergeCnaesPorCodigo(rawA, rawB) : rawA;
      const prefixosDominantesNosResultados = calcularPrefixosDominantes(merged);
      const sugestaoFiltroCnaeAmplo = inferirSugestaoFiltroCnaeAmplo(`${t0} ${t1 ?? ""}`.trim(), prefixosDominantesNosResultados);
      const cnaes = merged.slice(0, 35);
      return {
        fonte: "GET /companies-search/cnaes",
        termosUsados: t1 ? [t0, t1] : [t0],
        quantidadeResultadosUnicos: merged.length,
        prefixosDominantesNosResultados,
        sugestaoFiltroCnaeAmplo,
        referenciaRapidaDivisoes:
          "CNAE 2.0 (resumo): 41 construção civil (inclui 4120400 edifícios); 42 obras de engenharia/infra; 43 trabalhos especializados em construção; 49 transporte terrestre. Evitar filtros a 4 dígitos (4111, 4931) para perguntas amplas.",
        amostraTruncada: merged.length > cnaes.length,
        cnaes,
        dica:
          "Para transportadoras em SC: contarEmpresasMercado com ufs: [\"SC\"] e cnae \"49\" (ou sugestaoFiltroCnaeAmplo). Para construtoras no Brasil: cnae \"41\" ou \"41,42\".",
      };
    },
  });

  const contarEmpresasMercado = tool({
    description: `Conta empresas (GET companies-search/count). ${DESCRICAO_FILTROS} Nunca uses CNAE de 4 dígitos (ex. 4111) para perguntas amplas — usa 2 dígitos ou sugestaoFiltroCnaeAmplo de pesquisarCnaesMercado.`,
    inputSchema: filtroMercadoBaseSchema,
    execute: async (input) => {
      const base = filtroMercadoToQueryParams(input);
      const data = await traceleadsGetJson<CountResponse>(
        "/companies-search/count",
        authorization,
        base,
      );
      return { total: data.total, filtrosAplicados: base };
    },
  });

  const amostraEmpresasMercado = tool({
    description: `Lista até 12 empresas de exemplo (GET companies-search/data). ${DESCRICAO_FILTROS}`,
    inputSchema: filtroMercadoBaseSchema,
    execute: async (input) => {
      const base = filtroMercadoToQueryParams(input);
      const data = await traceleadsGetJson<DataResponse>("/companies-search/data", authorization, {
        ...base,
        page: "1",
        limit: "12",
      });
      const amostra = (data.data ?? []).slice(0, 12).map(resumoEmpresa);
      return {
        page: data.page,
        limit: data.limit,
        retornados: amostra.length,
        empresas: amostra,
      };
    },
  });

  return {
    pesquisarCnaesMercado,
    contarEmpresasMercado,
    amostraEmpresasMercado,
  };
}

/** Mercado (empresas) + operação (leads, WhatsApp, campanhas, …) + ações (mover lead, follow-up, enriquecimento, newsletter) na mesma sessão. */
export function buildAssistantTools(authorization: string) {
  return {
    ...buildMercadoTools(authorization),
    ...buildOperationalTools(authorization),
    ...buildActionTools(authorization),
  };
}
