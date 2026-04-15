/**
 * Origem da API traceleads-api (sem path, sem barra final).
 *
 * Preferir uma única URL:
 *   TRACELEADS_API_URL=https://api.seudominio.com
 *
 * Ou compor (útil para alinhar com variáveis já usadas no deploy):
 *   TRACELEADS_API_PROTOCOL=https
 *   TRACELEADS_API_HOST=api.seudominio.com
 *   TRACELEADS_API_PORT=443   (opcional; omitir em 80/443 padrão se quiser)
 */
export function resolveTraceleadsApiOrigin(): string {
  const single = process.env.TRACELEADS_API_URL?.trim();
  if (single) {
    return single.replace(/\/+$/, "");
  }

  const host = process.env.TRACELEADS_API_HOST?.trim();
  if (!host) {
    throw new Error(
      "Configure TRACELEADS_API_URL (recomendado) ou TRACELEADS_API_HOST (+ opcionalmente TRACELEADS_API_PROTOCOL / TRACELEADS_API_PORT)",
    );
  }

  const protocol = (process.env.TRACELEADS_API_PROTOCOL || "http").replace(/:?$/, "");
  const port = process.env.TRACELEADS_API_PORT?.trim();
  const hostPart = port && !host.includes(":") ? `${host}:${port}` : host;
  return `${protocol}://${hostPart}`.replace(/\/+$/, "");
}
