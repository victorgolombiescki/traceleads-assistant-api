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

type CnaeSugestao = {
  codigo: string;
  descricaoReferencia: string;
  ocorrenciasNaBusca: number;
  exemplos: CnaeItem[];
};

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

function buildCnaeSugestoes(cnaes: CnaeItem[]): CnaeSugestao[] {
  const byPrefix = new Map<string, { count: number; exemplos: CnaeItem[] }>();
  for (const c of cnaes) {
    const cod = String(c.codigo || "").replace(/\D/g, "");
    const p = cod.slice(0, 2);
    if (!p) continue;
    const cur = byPrefix.get(p) ?? { count: 0, exemplos: [] };
    cur.count += 1;
    if (cur.exemplos.length < 4) cur.exemplos.push(c);
    byPrefix.set(p, cur);
  }
  return [...byPrefix.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([prefixo, data]) => ({
      codigo: prefixo,
      descricaoReferencia: data.exemplos[0]?.descricao ?? "",
      ocorrenciasNaBusca: data.count,
      exemplos: data.exemplos,
    }));
}

function buildCnaeDescricoesFromSugestoes(sugestoes: CnaeSugestao[]) {
  return sugestoes.map((s) => ({
    codigo: s.codigo,
    descricao: s.descricaoReferencia,
    tipo: "divisao" as const,
  }));
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
  "Objeto opcional: ufs, cnae (obtido em pesquisarCnaesMercado), cnaeDescricoes (da pesquisa), municipio(s), buscaTexto, porte(s), regimesTributarios, capital, dataInicioMin/Max, e-mail/telefone, Simples/MEI, matriz/filial, natureza, excluir leads, filiais/funcionários, grauRisco. Nunca chute CNAE de memória — pesquise primeiro.";

/**
 * Ferramentas só chamam a API TraceLeads (JWT do utilizador) — nenhum SQL direto.
 */
export function buildMercadoTools(authorization: string) {
  const pesquisarCnaesMercado = tool({
    description:
      "PASSO 1 obrigatório quando o utilizador descreve setor em linguagem natural. Busca CNAEs reais na base (GET /companies-search/cnaes). Retorna cnaeSugeridoParaContagem e cnaeDescricoesParaContagem — use-os em contarEmpresasMercado. Opcional termoAlternativo funde duas buscas.",
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
        .describe("Segundo termo para fundir resultados (sinónimo ou foco)"),
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
      const cnaeSugestoes = buildCnaeSugestoes(merged);
      const cnaeSugeridoParaContagem = cnaeSugestoes[0] ?? null;
      const cnaeDescricoesParaContagem = buildCnaeDescricoesFromSugestoes(
        cnaeSugestoes.length > 1 ? cnaeSugestoes.slice(0, 2) : cnaeSugestoes,
      );
      const cnaeParam =
        cnaeSugestoes.length > 1
          ? cnaeSugestoes.slice(0, 2).map((s) => s.codigo).join(",")
          : cnaeSugeridoParaContagem?.codigo;
      const cnaes = merged.slice(0, 35);
      return {
        fonte: "GET /companies-search/cnaes",
        termosUsados: t1 ? [t0, t1] : [t0],
        quantidadeResultadosUnicos: merged.length,
        prefixosDominantesNosResultados: calcularPrefixosDominantes(merged),
        cnaeSugeridoParaContagem,
        cnaeSugestoes,
        cnaeDescricoesParaContagem,
        proximoPassoObrigatorio: cnaeSugeridoParaContagem
          ? `Chame contarEmpresasMercado com cnae: "${cnaeParam}" e cnaeDescricoes: ${JSON.stringify(cnaeDescricoesParaContagem)} + demais filtros.`
          : "Nenhum CNAE encontrado — peça mais detalhes ou outro termo.",
        amostraTruncada: merged.length > cnaes.length,
        cnaes,
        instrucaoRespostaLex:
          "Use o CNAE e a descrição retornados pela pesquisa. Não invente código nem nome de setor.",
      };
    },
  });

  const contarEmpresasMercado = tool({
    description: `PASSO 2: conta empresas (GET companies-search/market-counts — cubo BQ). Use DEPOIS de pesquisarCnaesMercado quando o setor veio em texto. Passe cnae + cnaeDescricoes da pesquisa. ${DESCRICAO_FILTROS} Evitar CNAE de 4 dígitos (4111, 4931).`,
    inputSchema: filtroMercadoBaseSchema,
    execute: async (input) => {
      const base = filtroMercadoToQueryParams(input);
      const data = await traceleadsGetJson<CountResponse & {
        comEmail?: number;
        comTelefone?: number;
        comEmailETelefone?: number;
        fonte?: string;
        consultaLenta?: boolean;
        durationMs?: number;
      }>(
        "/companies-search/market-counts",
        authorization,
        base,
      );
      return {
        total: data.total,
        comEmail: data.comEmail,
        comTelefone: data.comTelefone,
        comEmailETelefone: data.comEmailETelefone,
        leadsNoNicho: (data as { leadsNoNicho?: number }).leadsNoNicho,
        clientesNoNicho: (data as { clientesNoNicho?: number }).clientesNoNicho,
        fonte: data.fonte,
        consultaLenta: data.consultaLenta,
        filtrosAplicados: (data as { filtrosAplicados?: string[] }).filtrosAplicados ?? [],
        cnaesDescricao: (data as { cnaesDescricao?: unknown[] }).cnaesDescricao ?? [],
        instrucaoRespostaLex: (data as { instrucaoRespostaLex?: string }).instrucaoRespostaLex,
      };
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
