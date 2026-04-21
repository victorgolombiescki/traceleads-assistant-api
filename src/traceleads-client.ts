import { resolveTraceleadsApiOrigin } from "./traceleads-url.js";

const TIMEOUT_MS = 45_000;

export type TraceleadsQuery = Record<string, string | string[] | undefined>;

function buildUrl(path: string, query?: TraceleadsQuery): string {
  const origin = resolveTraceleadsApiOrigin();
  const rel = path.startsWith("/") ? path.slice(1) : path;
  const u = new URL(rel, `${origin}/`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === "") continue;
      if (Array.isArray(v)) {
        for (const item of v) {
          if (item !== undefined && item !== "") u.searchParams.append(k, item);
        }
      } else {
        u.searchParams.set(k, v);
      }
    }
  }
  return u.toString();
}

export async function traceleadsGetJson<T>(
  path: string,
  authorization: string,
  query?: TraceleadsQuery,
): Promise<T> {
  const url = buildUrl(path, query);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: authorization,
        Accept: "application/json",
      },
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`TraceLeads API ${res.status}: ${text.slice(0, 500)}`);
    }
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(t);
  }
}

export async function traceleadsPostJson<T>(
  path: string,
  authorization: string,
  body: unknown,
): Promise<T> {
  const url = buildUrl(path);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authorization,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`TraceLeads API ${res.status}: ${text.slice(0, 500)}`);
    }
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(t);
  }
}

export async function traceleadsPatchJson<T>(
  path: string,
  authorization: string,
  body: unknown,
): Promise<T> {
  const url = buildUrl(path);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: authorization,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`TraceLeads API ${res.status}: ${text.slice(0, 500)}`);
    }
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(t);
  }
}
