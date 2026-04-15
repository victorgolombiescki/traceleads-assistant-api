import { z } from "zod";

const EXCLUIR_EMAIL_TIPOS = [
  "contabilidade",
  "gmail",
  "hotmail",
  "yahoo",
  "uol",
  "icloud",
  "pessoal",
] as const;

/**
 * Filtros alinhados ao `FilterEmpresasDto` / `parseQueryParams` do `GET companies-search`
 * (contagem, data, export). Podem ser combinados num único objeto.
 */
export const filtroMercadoBaseSchema = z.object({
  ufs: z
    .array(z.string().regex(/^[a-zA-Z]{2}$/))
    .max(27)
    .optional()
    .transform((a) => (a ? a.map((x) => x.toUpperCase()) : undefined)),
  /**
   * CNAE fiscal: preferir **2 dígitos** (divisão, ex. 41, 49) ou **7 dígitos** exatos.
   * Vírgula = OR (ex. "41,42" construção + obras de infra). Evitar 4 dígitos tipo 4111 ou 4931: na API vira LIKE '4111%' e **exclui** códigos como 4120400.
   */
  cnae: z
    .string()
    .max(200)
    .regex(/^[\d,]+$/)
    .optional(),
  /** CNAEs secundários (cada valor vira um parâmetro `cnaeSecundario` na query) */
  cnaeSecundario: z.array(z.string().max(7).regex(/^\d+$/)).max(30).optional(),
  /** Como combinar CNAE fiscal com secundários: and | or */
  cnaeOperador: z.enum(["and", "or"]).optional(),
  municipio: z.string().max(80).optional(),
  municipios: z.array(z.string().max(80)).max(20).optional(),
  /** Campo `search` da API (razão social, CNPJ, descrição CNAE) */
  buscaTexto: z.string().max(120).optional(),
  porte: z.string().max(200).optional(),
  portes: z.array(z.string().max(40)).max(15).optional(),
  regimesTributarios: z.array(z.string().max(120)).max(15).optional(),
  temEmail: z.boolean().optional(),
  temTelefone: z.boolean().optional(),
  capitalMin: z.number().min(0).max(1e13).optional(),
  capitalMax: z.number().min(0).max(1e13).optional(),
  opcaoPeloSimples: z.boolean().optional(),
  opcaoPeloMei: z.boolean().optional(),
  /** 1 = matriz, 2 = filial (campo `identificadorMatrizFilial`) */
  identificadorMatrizFilial: z.union([z.literal(1), z.literal(2)]).optional(),
  naturezaJuridica: z.string().max(20).optional(),
  dataInicioMin: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe(
      "YYYY-MM-DD: data mínima de início de atividade da empresa. Para períodos relativos a 'hoje' ou 'este mês', usa o ano do bloco Referência temporal do system.",
    ),
  dataInicioMax: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe(
      "YYYY-MM-DD: data máxima de início de atividade. Alinha ao calendário atual no system; nunca assumas 2023 para 'último mês' se o utilizador fala do mês corrente.",
    ),
  excluirEmailTipos: z.array(z.enum(EXCLUIR_EMAIL_TIPOS)).max(7).optional(),
  excluirComLead: z.boolean().optional(),
  excluirLeadGanho: z.boolean().optional(),
  quantidadeFiliais: z.number().int().min(1).max(99999).optional(),
  quantidadeFiliaisOperador: z.enum(["gte", "lte"]).optional(),
  quantidadeFuncionarios: z.number().int().min(1).max(9999999).optional(),
  quantidadeFuncionariosOperador: z.enum(["gte", "lte"]).optional(),
  grauRisco: z.number().int().min(1).max(99).optional(),
});

export type FiltroMercadoBase = z.infer<typeof filtroMercadoBaseSchema>;

export type MercadoQueryParams = Record<string, string | string[] | undefined>;

function sanitizeMunicipio(s: string): string {
  const t = s.trim();
  if (t.length > 80) throw new Error("Município muito longo");
  if (/[%_]/.test(t)) throw new Error("Use texto sem % ou _");
  return t;
}

/** Converte o input validado em query string (chaves do `CompaniesSearchController.parseQueryParams`). */
export function filtroMercadoToQueryParams(f: FiltroMercadoBase): MercadoQueryParams {
  const q: MercadoQueryParams = {};

  if (f.ufs?.length) {
    q.uf = f.ufs.join(",");
  }
  if (f.cnae) q.cnae = f.cnae.trim();
  if (f.cnaeSecundario?.length) {
    q.cnaeSecundario =
      f.cnaeSecundario.length === 1 ? f.cnaeSecundario[0] : [...f.cnaeSecundario];
  }
  if (f.cnaeOperador) q.cnaeOperador = f.cnaeOperador;

  const munParts: string[] = [];
  if (f.municipios?.length) {
    for (const m of f.municipios) munParts.push(sanitizeMunicipio(m));
  } else if (f.municipio) {
    munParts.push(sanitizeMunicipio(f.municipio));
  }
  if (munParts.length === 1) q.municipio = munParts[0];
  else if (munParts.length > 1) q.municipio = munParts.join(",");

  if (f.buscaTexto) q.search = f.buscaTexto.trim().slice(0, 120);

  if (f.portes?.length) q.porte = f.portes.map((p) => p.trim()).filter(Boolean).join(",");
  else if (f.porte) q.porte = f.porte.trim().slice(0, 200);

  if (f.regimesTributarios?.length) {
    q.regimeTributario = f.regimesTributarios
      .map((r) => r.trim())
      .filter(Boolean)
      .join(",");
  }

  if (f.temEmail === true) q.temEmail = "true";
  if (f.temEmail === false) q.temEmail = "false";
  if (f.temTelefone === true) q.temTelefone = "true";
  if (f.temTelefone === false) q.temTelefone = "false";
  if (f.capitalMin != null) q.capitalMin = String(f.capitalMin);
  if (f.capitalMax != null) q.capitalMax = String(f.capitalMax);
  if (f.opcaoPeloSimples === true) q.opcaoPeloSimples = "true";
  if (f.opcaoPeloSimples === false) q.opcaoPeloSimples = "false";
  if (f.opcaoPeloMei === true) q.opcaoPeloMei = "true";
  if (f.opcaoPeloMei === false) q.opcaoPeloMei = "false";

  if (f.identificadorMatrizFilial != null) {
    q.identificadorMatrizFilial = String(f.identificadorMatrizFilial);
  }
  if (f.naturezaJuridica) q.naturezaJuridica = f.naturezaJuridica.trim().slice(0, 20);
  if (f.dataInicioMin) q.dataInicioMin = f.dataInicioMin;
  if (f.dataInicioMax) q.dataInicioMax = f.dataInicioMax;

  if (f.excluirEmailTipos?.length) {
    q.excluirEmailTipos = f.excluirEmailTipos.join(",");
  }
  if (f.excluirComLead === true) q.excluirComLead = "true";
  if (f.excluirComLead === false) q.excluirComLead = "false";
  if (f.excluirLeadGanho === true) q.excluirLeadGanho = "true";
  if (f.excluirLeadGanho === false) q.excluirLeadGanho = "false";

  if (f.quantidadeFiliais != null) q.quantidadeFiliais = String(f.quantidadeFiliais);
  if (f.quantidadeFiliaisOperador) q.quantidadeFiliaisOperador = f.quantidadeFiliaisOperador;

  if (f.quantidadeFuncionarios != null) q.quantidadeFuncionarios = String(f.quantidadeFuncionarios);
  if (f.quantidadeFuncionariosOperador) {
    q.quantidadeFuncionariosOperador = f.quantidadeFuncionariosOperador;
  }

  if (f.grauRisco != null) q.grauRisco = String(f.grauRisco);

  return q;
}
