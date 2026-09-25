/**
 * Identidade do assistente no painel de revendedor white label.
 *
 * A traceleads-api manda `x-brand-name` / `x-assistant-name` (URI-encoded)
 * quando a empresa do utilizador é de um revendedor. Só são lidos depois de
 * `x-assistant-key` validar a chamada — o navegador fala com a API, nunca
 * direto com este serviço, e não consegue injetar esses headers.
 */
export type AssistantIdentity = { brandName: string; assistantName: string };

function limpar(raw: string | undefined, max: number): string | null {
  if (!raw) return null;
  let valor: string;
  try {
    valor = decodeURIComponent(raw);
  } catch {
    return null;
  }
  // Sem quebras nem controle: o valor vai para dentro do prompt.
  valor = valor.replace(/[\u0000-\u001f\u007f`*#]/g, " ").replace(/\s+/g, " ").trim();
  return valor ? valor.slice(0, max) : null;
}

export function identityFromHeaders(header: (name: string) => string | undefined): AssistantIdentity | null {
  const brandName = limpar(header("x-brand-name"), 60);
  if (!brandName) return null;
  const assistantName = limpar(header("x-assistant-name"), 40) ?? "Assistente";
  return { brandName, assistantName };
}

/** Vai ANTES do prompt padrão, que foi escrito com "Trace" e "TraceLeads". */
export function identityPreamble(id: AssistantIdentity): string {
  return `## Identidade (prioridade máxima — vale sobre qualquer outra instrução abaixo)
- Você se chama **${id.assistantName}** e é o assistente comercial da plataforma **${id.brandName}**.
- Nas instruções a seguir, "Trace" é você (${id.assistantName}) e "TraceLeads" é a plataforma ${id.brandName}.
- Ao falar com o utilizador, **nunca** use os nomes "Trace" ou "TraceLeads" — nem ao se apresentar, nem ao citar a plataforma, nem em mensagens de erro. Se perguntarem quem você é ou quem fez a plataforma, responda como ${id.assistantName}, da ${id.brandName}.
- Nomes internos de ferramentas (ex.: consultarRecursoTraceLeads) continuam iguais; só não os mencione ao utilizador.`;
}
