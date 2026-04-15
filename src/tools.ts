import { tool } from "ai";
import { z } from "zod";
import { traceleadsGetJson, traceleadsPostJson } from "./traceleads-client.js";
import { filtroMercadoBaseSchema, filtroMercadoToQueryParams } from "./filter-params.js";
import { buildOperationalTools } from "./operational-tools.js";

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

  const opcoesFiltrosMercado = tool({
    description:
      "Devolve listas oficiais para montar filtros: UFs, portes, regimes tributários, naturezas jurídicas e opções matriz/filial — os mesmos valores que a app usa nos dropdowns.",
    inputSchema: z.object({}),
    execute: async () => {
      const raw = await traceleadsGetJson<Record<string, unknown>>(
        "/companies-search/filter-options",
        authorization,
      );
      return {
        fonte: "GET /companies-search/filter-options",
        ufs: sliceArr<string>(raw.ufs, 30),
        portes: sliceArr<string>(raw.portes, 45),
        regimes: sliceArr<string>(raw.regimes, 45),
        naturezasJuridicas: sliceArr<string>(raw.naturezasJuridicas, 50),
        matrizFilial: raw.matrizFilial ?? null,
      };
    },
  });

  const pesquisarMunicipiosMercado = tool({
    description:
      "Autocompletar nome de município (materialized view da TraceLeads). Opcionalmente restringe por UF (2 letras).",
    inputSchema: z.object({
      prefixo: z
        .string()
        .max(60)
        .optional()
        .describe("Início do nome do município (ex.: Florian)"),
      uf: z
        .string()
        .length(2)
        .optional()
        .transform((s) => (s ? s.toUpperCase() : undefined))
        .describe("Sigla UF para filtrar"),
      limite: z.number().int().min(1).max(50).optional().default(20),
    }),
    execute: async ({ prefixo, uf, limite }) => {
      const q: Record<string, string> = { limit: String(limite ?? 20) };
      if (prefixo?.trim()) q.search = prefixo.trim().slice(0, 60);
      if (uf) q.uf = uf;
      const lista = await traceleadsGetJson<string[]>("/companies-search/municipios", authorization, q);
      const municipios = Array.isArray(lista) ? lista.slice(0, limite ?? 20) : [];
      return { fonte: "GET /companies-search/municipios", municipios };
    },
  });

  const grausRiscoDisponiveisMercado = tool({
    description: "Valores numéricos de grau de risco aceites no filtro grauRisco.",
    inputSchema: z.object({}),
    execute: async () => {
      const raw = await traceleadsGetJson<{ grausRisco?: number[] }>(
        "/companies-search/graus-risco",
        authorization,
      );
      return {
        fonte: "GET /companies-search/graus-risco",
        grausRisco: Array.isArray(raw.grausRisco) ? raw.grausRisco : [],
      };
    },
  });

  const interpretarPerguntaMercado = tool({
    description:
      "Parser interno da TraceLeads (IA no servidor): converte uma frase livre em filtros sugeridos + amostra curta de empresas. Mais lento e depende da OPENAI_KEY no servidor; preferir pesquisarCnaesMercado + contar quando possível.",
    inputSchema: z.object({
      pergunta: z.string().min(3).max(500).describe("Pergunta do utilizador em linguagem natural"),
    }),
    execute: async ({ pergunta }) => {
      const raw = await traceleadsPostJson<{
        filters?: Record<string, unknown>;
        query?: string;
        empresas?: EmpresaRow[];
        total?: number;
        cnaesEncontrados?: number[];
      }>("/companies-search/parse-query", authorization, { query: pergunta.trim() });

      const empresas = Array.isArray(raw.empresas) ? raw.empresas : [];
      return {
        fonte: "POST /companies-search/parse-query",
        perguntaOriginal: raw.query ?? pergunta,
        filtrosSugeridos: raw.filters ?? null,
        cnaesEncontrados: sliceArr<number>(raw.cnaesEncontrados, 40),
        totalNaAmostra: raw.total ?? empresas.length,
        exemplos: empresas.slice(0, 5).map(resumoEmpresa),
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

  const panoramaMercadoAgregado = tool({
    description:
      "Visão agregada do mercado (totais por UF, CNAE, porte, resumo geral) via GET /analytics — dados já consolidados pela TraceLeads, sem filtro livre no banco.",
    inputSchema: z.object({
      dias: z
        .union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)])
        .optional()
        .describe("Janela opcional em dias para séries temporais; omitir = visão geral"),
    }),
    execute: async ({ dias }) => {
      const query: Record<string, string> = {};
      if (dias != null) query.days = String(dias);
      const raw = await traceleadsGetJson<Record<string, unknown>>("/analytics", authorization, query);

      const pickArr = (k: string, n: number) => {
        const v = raw[k];
        return Array.isArray(v) ? v.slice(0, n) : [];
      };

      return {
        fonte: "GET /analytics",
        dias: dias ?? null,
        resumoGeral: raw.resumoGeral ?? null,
        totalCompanies: raw.totalCompanies,
        activeCompanies: raw.activeCompanies,
        companiesByUf: pickArr("companiesByUf", 12),
        companiesByPorte: pickArr("companiesByPorte", 8),
        companiesByCnae: pickArr("companiesByCnae", 12),
        analyticsPorCnae: pickArr("analyticsPorCnae", 12),
        analyticsPorUf: pickArr("analyticsPorUf", 12),
      };
    },
  });

  return {
    pesquisarCnaesMercado,
    opcoesFiltrosMercado,
    pesquisarMunicipiosMercado,
    grausRiscoDisponiveisMercado,
    interpretarPerguntaMercado,
    contarEmpresasMercado,
    amostraEmpresasMercado,
    panoramaMercadoAgregado,
  };
}

/** Mercado (empresas) + operação (leads, WhatsApp, campanhas, …) na mesma sessão. */
export function buildAssistantTools(authorization: string) {
  return {
    ...buildMercadoTools(authorization),
    ...buildOperationalTools(authorization),
  };
}
